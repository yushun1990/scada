import { useSyncExternalStore } from 'react'
import {
  getManagedSvgIntrinsicSize,
  serializeManagedSvgDocument,
  type ManagedSvgDocument,
} from '../../component-system/managedSvg'
import {
  resolveVisualAssetStyle,
  type SvgVisualLayer,
} from '../../component-system/visual'

export type ComponentManagedSvgSelection = {
  layerId: string
  tagId: string
}

export type ManagedSvgViewportBounds = {
  x: number
  y: number
  width: number
  height: number
}

export type ManagedSvgLayerBounds = {
  x: number
  y: number
  width: number
  height: number
}

let currentSelection: ComponentManagedSvgSelection | null = null
const listeners = new Set<() => void>()

function emitSelectionChange() {
  for (const listener of listeners) listener()
}

export function getComponentManagedSvgSelection() {
  return currentSelection
}

export function setComponentManagedSvgSelection(
  selection: ComponentManagedSvgSelection | null,
) {
  if (
    currentSelection?.layerId === selection?.layerId &&
    currentSelection?.tagId === selection?.tagId
  ) {
    return
  }

  currentSelection = selection
  emitSelectionChange()
}

export function useComponentManagedSvgSelection() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getComponentManagedSvgSelection,
    getComponentManagedSvgSelection,
  )
}

function finiteBounds(bounds: ManagedSvgViewportBounds | ManagedSvgLayerBounds) {
  return (
    Number.isFinite(bounds.x) &&
    Number.isFinite(bounds.y) &&
    Number.isFinite(bounds.width) &&
    Number.isFinite(bounds.height) &&
    bounds.width > 0 &&
    bounds.height > 0
  )
}

function clampLayerBounds(
  bounds: ManagedSvgLayerBounds,
  layerWidth: number,
  layerHeight: number,
): ManagedSvgLayerBounds | null {
  const x1 = Math.max(0, bounds.x)
  const y1 = Math.max(0, bounds.y)
  const x2 = Math.min(layerWidth, bounds.x + bounds.width)
  const y2 = Math.min(layerHeight, bounds.y + bounds.height)

  if (x2 <= x1 || y2 <= y1) return null

  return {
    x: x1,
    y: y1,
    width: x2 - x1,
    height: y2 - y1,
  }
}

export function mapManagedSvgViewportBoundsToLayer(
  layer: SvgVisualLayer,
  bounds: ManagedSvgViewportBounds,
): ManagedSvgLayerBounds | null {
  if (!layer.document || !finiteBounds(bounds)) return null

  const layerWidth = layer.transform.width
  const layerHeight = layer.transform.height
  if (layerWidth <= 0 || layerHeight <= 0) return null

  const intrinsic = getManagedSvgIntrinsicSize(layer.document)
  const fit = resolveVisualAssetStyle(layer).fit

  if (fit === 'stretch') {
    return clampLayerBounds({
      x: bounds.x * layerWidth,
      y: bounds.y * layerHeight,
      width: bounds.width * layerWidth,
      height: bounds.height * layerHeight,
    }, layerWidth, layerHeight)
  }

  if (fit === 'contain') {
    const scale = Math.min(
      layerWidth / intrinsic.width,
      layerHeight / intrinsic.height,
    )
    const drawWidth = intrinsic.width * scale
    const drawHeight = intrinsic.height * scale
    const offsetX = (layerWidth - drawWidth) / 2
    const offsetY = (layerHeight - drawHeight) / 2

    return clampLayerBounds({
      x: offsetX + bounds.x * drawWidth,
      y: offsetY + bounds.y * drawHeight,
      width: bounds.width * drawWidth,
      height: bounds.height * drawHeight,
    }, layerWidth, layerHeight)
  }

  const imageRatio = intrinsic.width / intrinsic.height
  const targetRatio = layerWidth / layerHeight
  let cropX = 0
  let cropY = 0
  let cropWidth = intrinsic.width
  let cropHeight = intrinsic.height

  if (imageRatio > targetRatio) {
    cropWidth = intrinsic.height * targetRatio
    cropX = (intrinsic.width - cropWidth) / 2
  } else {
    cropHeight = intrinsic.width / targetRatio
    cropY = (intrinsic.height - cropHeight) / 2
  }

  const sourceX = bounds.x * intrinsic.width
  const sourceY = bounds.y * intrinsic.height
  const sourceWidth = bounds.width * intrinsic.width
  const sourceHeight = bounds.height * intrinsic.height

  return clampLayerBounds({
    x: (sourceX - cropX) * layerWidth / cropWidth,
    y: (sourceY - cropY) * layerHeight / cropHeight,
    width: sourceWidth * layerWidth / cropWidth,
    height: sourceHeight * layerHeight / cropHeight,
  }, layerWidth, layerHeight)
}

export function measureManagedSvgElementViewportBounds(
  managedDocument: ManagedSvgDocument,
  tagId: string,
): ManagedSvgViewportBounds | null {
  if (
    typeof DOMParser === 'undefined' ||
    typeof document === 'undefined' ||
    !document.body
  ) {
    return null
  }

  const parsed = new DOMParser().parseFromString(
    serializeManagedSvgDocument(managedDocument),
    'image/svg+xml',
  )
  if (parsed.querySelector('parsererror')) return null

  const importedRoot = document.importNode(
    parsed.documentElement,
    true,
  ) as unknown as SVGSVGElement
  const intrinsic = getManagedSvgIntrinsicSize(managedDocument)
  importedRoot.style.display = 'block'
  importedRoot.style.width = `${intrinsic.width}px`
  importedRoot.style.height = `${intrinsic.height}px`
  importedRoot.style.maxWidth = 'none'
  importedRoot.style.maxHeight = 'none'

  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.position = 'fixed'
  host.style.left = '-100000px'
  host.style.top = '-100000px'
  host.style.width = `${intrinsic.width}px`
  host.style.height = `${intrinsic.height}px`
  host.style.opacity = '0'
  host.style.pointerEvents = 'none'
  host.style.overflow = 'visible'
  host.appendChild(importedRoot)
  document.body.appendChild(host)

  try {
    const target = importedRoot.getAttribute('data-scada-tag') === tagId
      ? importedRoot
      : [...importedRoot.querySelectorAll('[data-scada-tag]')].find(
          (candidate) => candidate.getAttribute('data-scada-tag') === tagId,
        ) ?? null

    if (!target) return null

    const rootRect = importedRoot.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    if (
      rootRect.width <= 0 ||
      rootRect.height <= 0 ||
      targetRect.width <= 0 ||
      targetRect.height <= 0
    ) {
      return null
    }

    const bounds = {
      x: (targetRect.left - rootRect.left) / rootRect.width,
      y: (targetRect.top - rootRect.top) / rootRect.height,
      width: targetRect.width / rootRect.width,
      height: targetRect.height / rootRect.height,
    }

    return finiteBounds(bounds) ? bounds : null
  } finally {
    host.remove()
  }
}
