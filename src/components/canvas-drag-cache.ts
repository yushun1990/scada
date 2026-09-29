import type Konva from 'konva'

const DRAG_CACHE_MAX_PIXEL_RATIO = 3
const DRAG_CACHE_MIN_PIXEL_RATIO = 0.5
const DRAG_CACHE_MAX_PIXELS = 12_000_000

/**
 * Rasterize a dragged node's subtree once so every drag frame becomes a
 * bitmap blit instead of a full vector repaint. Complex SVG layers are the
 * intended beneficiary: their oversized rasterized source makes per-frame
 * redraw the dominant drag cost.
 *
 * The cache pixel ratio tracks the node's absolute scale times the device
 * pixel ratio (capped) so the cached bitmap stays sharp at the current zoom,
 * and the pixel budget keeps the buffer bounded for very large subtrees.
 * Returns false when the node cannot be usefully cached; callers must pair
 * any true result with releaseDragPreviewCache.
 */
export function cacheNodeForDragPreview(node: Konva.Node): boolean {
  const rect = node.getClientRect({
    skipTransform: true,
    relativeTo: node.getParent() || undefined,
  })

  if (!(rect.width > 0) || !(rect.height > 0)) {
    return false
  }

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
