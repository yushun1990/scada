import type Konva from 'konva'

const DRAG_CACHE_MAX_PIXEL_RATIO = 3
const DRAG_CACHE_MIN_PIXEL_RATIO = 0.5
const DRAG_CACHE_MAX_PIXELS = 12_000_000

// Caching only pays when the subtree's own drawing is expensive per frame —
// concretely, when an oversized raster gets scaled far down each frame (the
// imported complex-SVG shape). A raster displayed near its natural size, or a
// handful of vector shapes, draws faster directly; routing them through a
// cached canvas blit (canvas-to-canvas scaled drawImage plus a cache
// allocation per drag) can regress pointer tracking on real GPUs.
const EXPENSIVE_RASTER_SOURCE_PIXELS = 1_000_000
const EXPENSIVE_RASTER_DOWNSCALE_FACTOR = 2
const EXPENSIVE_PATH_DATA_LENGTH = 20_000

type RasterSource = {
  naturalWidth?: number
  naturalHeight?: number
  width?: number
  height?: number
}

function rasterSourcePixels(source: unknown): number {
  const raster = source as RasterSource | null | undefined

  if (!raster) {
    return 0
  }

  const width = raster.naturalWidth ?? raster.width ?? 0
  const height = raster.naturalHeight ?? raster.height ?? 0
  return width * height
}

function cacheBufferPixels(node: Konva.Node): number {
  const rect = node.getClientRect({
    skipTransform: true,
    relativeTo: node.getParent() || undefined,
  })

  if (!(rect.width > 0) || !(rect.height > 0)) {
    return 0
  }

  const scale = node.getAbsoluteScale()
  const devicePixelRatio =
    typeof window !== 'undefined' && window.devicePixelRatio
      ? window.devicePixelRatio
      : 1
  const pixelRatio = Math.min(
    DRAG_CACHE_MAX_PIXEL_RATIO,
    Math.max(
      DRAG_CACHE_MIN_PIXEL_RATIO,
      Math.max(Math.abs(scale.x), Math.abs(scale.y)) * devicePixelRatio,
    ),
  )

  return rect.width * rect.height * pixelRatio * pixelRatio
}

function isExpensiveDrawNode(node: Konva.Node, bufferPixels: number): boolean {
  if (node.getClassName() === 'Image') {
    const sourcePixels = rasterSourcePixels((node as Konva.Image).image())
    return (
      sourcePixels > EXPENSIVE_RASTER_SOURCE_PIXELS &&
      sourcePixels > bufferPixels * EXPENSIVE_RASTER_DOWNSCALE_FACTOR
    )
  }

  if (node.getClassName() === 'Path') {
    const data = (node as unknown as { data: () => string }).data()
    return typeof data === 'string' && data.length > EXPENSIVE_PATH_DATA_LENGTH
  }

  return false
}

function hasExpensiveDrawNode(node: Konva.Node, bufferPixels: number): boolean {
  if (isExpensiveDrawNode(node, bufferPixels)) {
    return true
  }

  const container = node as Konva.Container

  if (typeof container.find !== 'function') {
    return false
  }

  return container.find('*').some((child) => isExpensiveDrawNode(child, bufferPixels))
}

/**
 * Rasterize a dragged node's subtree once so every drag frame becomes a
 * bitmap blit instead of a full vector repaint. Only subtrees whose own
 * drawing is expensive (oversized SVG rasters, huge photos, long vector
 * paths) are cached; cheap subtrees keep direct drawing.
 *
 * The cache pixel ratio tracks the node's absolute scale times the device
 * pixel ratio (capped) so the cached bitmap stays sharp at the current zoom,
 * and the pixel budget keeps the buffer bounded for very large subtrees.
 * Returns false when the node cannot be usefully cached; callers must pair
 * any true result with releaseDragPreviewCache.
 */
export function cacheNodeForDragPreview(node: Konva.Node): boolean {
  const bufferPixels = cacheBufferPixels(node)

  if (bufferPixels <= 0 || !hasExpensiveDrawNode(node, bufferPixels)) {
    return false
  }

  const rect = node.getClientRect({
    skipTransform: true,
    relativeTo: node.getParent() || undefined,
  })

  const scale = node.getAbsoluteScale()
  const devicePixelRatio =
    typeof window !== 'undefined' && window.devicePixelRatio
      ? window.devicePixelRatio
      : 1
  const absoluteScale = Math.max(Math.abs(scale.x), Math.abs(scale.y))

  let pixelRatio = Math.min(
    DRAG_CACHE_MAX_PIXEL_RATIO,
    Math.max(DRAG_CACHE_MIN_PIXEL_RATIO, absoluteScale * devicePixelRatio),
  )

  while (
    pixelRatio > DRAG_CACHE_MIN_PIXEL_RATIO &&
    rect.width * rect.height * pixelRatio * pixelRatio > DRAG_CACHE_MAX_PIXELS
  ) {
    pixelRatio -= 0.25
  }

  if (rect.width * rect.height * pixelRatio * pixelRatio > DRAG_CACHE_MAX_PIXELS) {
    return false
  }

  node.cache({
    x: Math.floor(rect.x),
    y: Math.floor(rect.y),
    width: Math.ceil(rect.width),
    height: Math.ceil(rect.height),
    pixelRatio,
  })

  return node.isCached()
}

/**
 * Restore vector rendering after a drag. Tolerates nodes that were destroyed
 * or detached mid-session; their canvas memory is reclaimed by Konva anyway.
 */
export function releaseDragPreviewCache(nodes: readonly Konva.Node[]): void {
  for (const node of nodes) {
    try {
      node.clearCache()
    } catch {
      // Node already destroyed — nothing to release.
    }
  }
}
