import {
  serializeManagedSvgDataUrl,
  type ManagedSvgDocument,
} from '../../component-system/managedSvg'
import { parseManagedSvgSourceWithCompatibility } from '../../component-system/managedSvgImportCompatibility'
import {
  type ComponentVisualDefinition,
  type ComponentVisualLayer,
  type ImageVisualLayer,
  type SvgVisualLayer,
} from '../../component-system/visual'

export const LOCAL_VISUAL_ASSET_ACCEPT = '.svg,.png,.jpg,.jpeg,.webp'

export type ImportedVisualAsset = {
  kind: 'svg' | 'image'
  name: string
  assetRef: string
  document?: ManagedSvgDocument
  intrinsicWidth: number
  intrinsicHeight: number
}

export type ApplyImportedVisualAssetOptions = {
  selectedLayerId?: string | null
  requireReplacement?: boolean
}

export type ApplyImportedVisualAssetResult = {
  visual: ComponentVisualDefinition
  layerId: string
  replaced: boolean
}

type RasterMediaType = 'image/png' | 'image/jpeg' | 'image/webp'
type LocalFileClassification =
  | { kind: 'svg'; mediaType: 'image/svg+xml' }
  | { kind: 'image'; mediaType: RasterMediaType }

const RASTER_MEDIA_TYPES = new Set<RasterMediaType>([
  'image/png',
  'image/jpeg',
  'image/webp',
])

function extensionOf(fileName: string) {
  const index = fileName.lastIndexOf('.')
  return index >= 0 ? fileName.slice(index).toLowerCase() : ''
}

function visualNameFromFile(fileName: string) {
  const trimmed = fileName.trim()
  const extension = extensionOf(trimmed)
  const withoutExtension = extension ? trimmed.slice(0, -extension.length) : trimmed
  return withoutExtension.trim() || 'Imported asset'
}

function classifyFile(file: Pick<File, 'name' | 'type'>): LocalFileClassification {
  const extension = extensionOf(file.name)
  const mediaType = file.type.toLowerCase().trim()

  if (extension === '.svg' || mediaType === 'image/svg+xml') {
    if (extension && extension !== '.svg') {
      throw new Error('文件扩展名与 SVG 类型不一致')
    }
    if (mediaType && mediaType !== 'image/svg+xml') {
      throw new Error('SVG 文件的 MIME 类型不受支持')
    }
    return { kind: 'svg', mediaType: 'image/svg+xml' }
  }

  const extensionMediaType: RasterMediaType | null = extension === '.png'
    ? 'image/png'
    : extension === '.jpg' || extension === '.jpeg'
      ? 'image/jpeg'
      : extension === '.webp'
        ? 'image/webp'
        : null
  const declaredMediaType = RASTER_MEDIA_TYPES.has(mediaType as RasterMediaType)
    ? mediaType as RasterMediaType
    : null

  if (extension && !extensionMediaType) {
    throw new Error('仅支持 SVG、PNG、JPEG、WebP 本地资源')
  }
  if (mediaType && !declaredMediaType) {
    throw new Error('图片 MIME 类型不受支持')
  }
  if (!extensionMediaType && !declaredMediaType) {
    throw new Error('无法识别图片类型；请使用 SVG、PNG、JPEG 或 WebP')
  }
  if (extensionMediaType && declaredMediaType && declaredMediaType !== extensionMediaType) {
    throw new Error('文件扩展名与图片 MIME 类型不一致')
  }

  return {
    kind: 'image',
    mediaType: extensionMediaType ?? declaredMediaType!,
  }
}

function readFileAsDataUrl(file: File, mediaType: RasterMediaType) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      const expectedPrefix = `data:${mediaType}`
      if (typeof reader.result !== 'string' || !reader.result.startsWith(expectedPrefix)) {
        reject(new Error('无法读取图片资源'))
        return
      }
      resolve(reader.result)
    })
    reader.addEventListener('error', () => reject(new Error('读取图片文件失败')))
    const source = file.type.toLowerCase().trim() === mediaType
      ? file
      : new Blob([file], { type: mediaType })
    reader.readAsDataURL(source)
  })
}

function loadImageDimensions(assetRef: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => {
      const width = image.naturalWidth || image.width
      const height = image.naturalHeight || image.height
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        reject(new Error('无法读取图片固有尺寸'))
        return
      }
      resolve({ width, height })
    })
    image.addEventListener('error', () => reject(new Error('图片文件无法解码')))
    image.src = assetRef
  })
}

export async function importLocalVisualAsset(file: File): Promise<ImportedVisualAsset> {
  if (!file || file.size <= 0) {
    throw new Error('资源文件为空')
  }

  const classification = classifyFile(file)
  const name = visualNameFromFile(file.name)

  if (classification.kind === 'svg') {
    const source = await file.text()
    const imported = parseManagedSvgSourceWithCompatibility(source)
    const assetRef = serializeManagedSvgDataUrl(imported.document)

    return {
      kind: 'svg',
      name,
      assetRef,
      document: imported.document,
      intrinsicWidth: imported.intrinsicWidth,
      intrinsicHeight: imported.intrinsicHeight,
    }
  }

  const assetRef = await readFileAsDataUrl(file, classification.mediaType)
  const dimensions = await loadImageDimensions(assetRef)

  return {
    kind: 'image',
    name,
    assetRef,
    intrinsicWidth: dimensions.width,
    intrinsicHeight: dimensions.height,
  }
}

function nextLayerId(kind: 'svg' | 'image', layers: readonly ComponentVisualLayer[]) {
  const ids = new Set(layers.map((layer) => layer.id))
  let index = 1
  while (ids.has(`${kind}${index}`)) index += 1
  return `${kind}${index}`
}

function createPlacement(
  visual: ComponentVisualDefinition,
  intrinsicWidth: number,
  intrinsicHeight: number,
) {
  const sourceWidth = Math.max(1, intrinsicWidth)
  const sourceHeight = Math.max(1, intrinsicHeight)
  const maxWidth = Math.max(1, visual.designSize.width * 0.8)
  const maxHeight = Math.max(1, visual.designSize.height * 0.8)
  const scale = Math.min(1, maxWidth / sourceWidth, maxHeight / sourceHeight)
  const width = Math.max(1, sourceWidth * scale)
  const height = Math.max(1, sourceHeight * scale)

  return {
    x: (visual.designSize.width - width) / 2,
    y: (visual.designSize.height - height) / 2,
    width,
    height,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
  }
}

function replaceCompatibleLayer(
  layer: SvgVisualLayer | ImageVisualLayer,
  asset: ImportedVisualAsset,
): SvgVisualLayer | ImageVisualLayer {
  if (layer.kind !== asset.kind) {
    throw new Error(`所选 ${layer.kind === 'svg' ? 'SVG' : '位图'} 图层只能替换为同类型资源`)
  }

  if (layer.kind === 'svg') {
    if (!asset.document) {
      throw new Error('SVG 替换必须产生受管 SVG document')
    }
    return {
      ...layer,
      assetRef: asset.assetRef,
      document: asset.document,
    }
  }

  return {
    ...layer,
    assetRef: asset.assetRef,
  }
}

export function applyImportedVisualAsset(
  visual: ComponentVisualDefinition,
  asset: ImportedVisualAsset,
  options: ApplyImportedVisualAssetOptions = {},
): ApplyImportedVisualAssetResult {
  if (visual.mode !== 'composite') {
    throw new Error('Native Visual 不支持本地资源导入')
  }

  if (
    !Number.isFinite(asset.intrinsicWidth) ||
    !Number.isFinite(asset.intrinsicHeight) ||
    asset.intrinsicWidth <= 0 ||
    asset.intrinsicHeight <= 0 ||
    !asset.assetRef.startsWith('data:image/')
  ) {
    throw new Error('导入资源无效')
  }

  const selectedLayer = options.selectedLayerId
    ? visual.layers.find((layer) => layer.id === options.selectedLayerId) ?? null
    : null

  if (selectedLayer && (selectedLayer.kind === 'svg' || selectedLayer.kind === 'image')) {
    if (selectedLayer.kind === asset.kind) {
      if (
        selectedLayer.kind === 'svg' &&
        (visual.rules ?? []).some((rule) => rule.layerId === selectedLayer.id && rule.svgTagId !== undefined)
      ) {
        throw new Error('该 SVG 已有内部标签 Visual Rule；请先删除或改为 Layer 目标后再替换文件')
      }

      const replacement = replaceCompatibleLayer(selectedLayer, asset)
      return {
        visual: {
          ...visual,
          layers: visual.layers.map((layer) => layer.id === selectedLayer.id ? replacement : layer),
        },
        layerId: selectedLayer.id,
        replaced: true,
      }
    }

    if (options.requireReplacement) {
      throw new Error(`所选 ${selectedLayer.kind === 'svg' ? 'SVG' : '位图'} 图层与导入文件类型不兼容`)
    }
  } else if (options.requireReplacement) {
    throw new Error('替换资源需要先选择一个 SVG 或位图图层')
  }

  const id = nextLayerId(asset.kind, visual.layers)
  const parentId = selectedLayer?.kind === 'group'
    ? selectedLayer.id
    : selectedLayer?.parentId ?? null
  const base = {
    id,
    name: asset.name,
    parentId,
    transform: createPlacement(visual, asset.intrinsicWidth, asset.intrinsicHeight),
    visible: true,
    opacity: 1,
    assetRef: asset.assetRef,
    style: { fit: 'contain' as const },
  }
  const layer: SvgVisualLayer | ImageVisualLayer = asset.kind === 'svg'
    ? {
        ...base,
        kind: 'svg',
        document: asset.document,
      }
    : {
        ...base,
        kind: 'image',
      }

  if (layer.kind === 'svg' && !layer.document) {
    throw new Error('SVG 导入缺少受管 document')
  }

  return {
    visual: { ...visual, layers: [...visual.layers, layer] },
    layerId: id,
    replaced: false,
  }
}
