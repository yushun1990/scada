import {
  COMPONENT_VISUAL_VERSION,
  type ComponentVisualDefinition,
  type ImageVisualLayer,
  type SvgVisualLayer,
  type VisualLayerTransform,
} from '../../component-system/visual'
import type {
  ComponentDefinition,
  ComponentPropertyDefinition,
  ComponentValueOption,
} from '../../component-system/definition'
import type { VisualRule } from '../../component-system/visualRules'
import type { ImportedVisualAsset } from './visual-asset-import'
import {
  COMPONENT_PACKAGE_VERSION,
  type ComponentLibraryEntry,
} from './component-document'

/**
 * Result of multi-image component creation, including the assembled library
 * entry and a human-readable size deviation note (if deviation exceeds the
 * warning threshold).
 */
export type MultiImageComponentResult = {
  component: ComponentLibraryEntry
  sizeDeviationWarning: string | null
}

/**
 * Create a self-contained multi-image state-switching component from a set
 * of imported visual assets. The function is pure — it produces a standard
 * `ComponentLibraryEntry` and does not perform IO.
 *
 * Invariants:
 * - At least 2 assets are required.
 * - All layer transforms are unified to the bounding box of the largest
 *   intrinsic dimensions across all assets.
 * - A `select` Property named "state" is created with one option per image.
 * - One `visible` Visual Rule per layer ensures mutual-exclusion switching.
 * - The first asset is the default visible layer.
 *
 * The result integrates with the existing Group + Visual Rule + Property
 * system and does not introduce new data models (M9 boundary preserved).
 */
export function createMultiImageComponent(
  assets: readonly ImportedVisualAsset[],
  creationOptions?: { title?: string },
): MultiImageComponentResult {
  if (assets.length < 2) {
    throw new Error('多图组件至少需要 2 张图片')
  }

  // --- Measure and normalize sizes -----------------------------------------

  const ratios = assets.map((a) => {
    const w = Math.max(1, a.intrinsicWidth)
    const h = Math.max(1, a.intrinsicHeight)
    return w / h
  })
  const maxRatio = Math.max(...ratios)
  const minRatio = Math.min(...ratios)
  const ratioDeviation = maxRatio > 0 ? (maxRatio - minRatio) / maxRatio : 0

  const WARNING_THRESHOLD = 0.15
  const sizeDeviationWarning =
    ratioDeviation > WARNING_THRESHOLD
      ? `注意：图片宽高比差异较大（偏差 ${Math.round(ratioDeviation * 100)}%），可能不适合状态切换`
      : null

  // Normalize component design size to standard SCADA component base dimension (96px)
  const maxWidth = Math.max(...assets.map((a) => a.intrinsicWidth))
  const maxHeight = Math.max(...assets.map((a) => a.intrinsicHeight))
  const dominantAspect = maxWidth > 0 && maxHeight > 0 ? maxWidth / maxHeight : 1

  let normalizedWidth = 96
  let normalizedHeight = 96
  if (dominantAspect >= 1) {
    normalizedWidth = 96
    normalizedHeight = Math.max(24, Math.round(96 / dominantAspect))
  } else {
    normalizedHeight = 96
    normalizedWidth = Math.max(24, Math.round(96 * dominantAspect))
  }

  const unifiedTransform: VisualLayerTransform = {
    x: 0,
    y: 0,
    width: normalizedWidth,
    height: normalizedHeight,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
  }

  // --- Build option values from file names ---------------------------------

  const optionValues = assets.map((asset) => sanitizeOptionValue(asset.name))
  const deduplicatedValues = deduplicateValues(optionValues)

  // --- Build layers --------------------------------------------------------

  const layers: (ImageVisualLayer | SvgVisualLayer)[] = assets.map(
    (asset, index) => {
      const id = `image${index + 1}`
      const base = {
        id,
        name: asset.name,
        parentId: null,
        transform: { ...unifiedTransform },
        visible: index === 0,
        opacity: 1,
        assetRef: asset.assetRef,
        style: { fit: 'contain' as const },
      }

      if (asset.kind === 'svg') {
        return {
          ...base,
          kind: 'svg' as const,
          document: asset.document,
        }
      }

      return {
        ...base,
        kind: 'image' as const,
      }
    },
  )

  // --- Build Property ------------------------------------------------------

  const options: ComponentValueOption[] = deduplicatedValues.map(
    (value, index) => ({
      label: assets[index]!.name,
      value,
    }),
  )

  const stateProperty: ComponentPropertyDefinition = {
    title: '状态',
    kind: 'select',
    defaultValue: deduplicatedValues[0]!,
    bindable: true,
    options,
  }

  // --- Build Visual Rules --------------------------------------------------

  const rules: VisualRule[] = deduplicatedValues.flatMap((value, index) => [
    {
      id: `r${index * 2 + 1}`,
      enabled: true,
      propertyKey: 'state',
      operator: 'equals' as const,
      compareValue: value,
      layerId: layers[index]!.id,
      target: 'visible' as const,
      value: true,
    },
    {
      id: `r${index * 2 + 2}`,
      enabled: true,
      propertyKey: 'state',
      operator: 'notEquals' as const,
      compareValue: value,
      layerId: layers[index]!.id,
      target: 'visible' as const,
      value: false,
    },
  ])

  // --- Assemble ComponentDefinition ----------------------------------------

  const suffix = Date.now().toString(36)
  const title = creationOptions?.title?.trim() || '多图组件'
  const definition: ComponentDefinition = {
    type: `custom.multiimage.${suffix}`,
    title,
    category: '自定义',
    description: `由 ${assets.length} 张图片自动创建的状态切换组件`,
    size: {
      defaultWidth: Math.round(normalizedWidth),
      defaultHeight: Math.round(normalizedHeight),
      minWidth: Math.min(32, Math.round(normalizedWidth)),
      minHeight: Math.min(24, Math.round(normalizedHeight)),
    },
    attributes: {},
    properties: {
      state: stateProperty,
    },
    actions: {},
    events: {},
    anchors: [],
  }

  // --- Assemble Visual -----------------------------------------------------

  const visual: ComponentVisualDefinition = {
    version: COMPONENT_VISUAL_VERSION,
    mode: 'composite',
    designSize: {
      width: normalizedWidth,
      height: normalizedHeight,
    },
    layers,
    rules,
    animations: [],
  }

  // --- Assemble ComponentLibraryEntry --------------------------------------

  const componentId = `component-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`

  const component: ComponentLibraryEntry = {
    version: COMPONENT_PACKAGE_VERSION,
    id: componentId,
    definition,
    visual,
    status: 'draft',
    implementationDraft: '// 多图状态切换组件 — 自动生成\n',
    updatedAt: new Date().toISOString(),
    builtIn: false,
  }

  return { component, sizeDeviationWarning }
}

// --- Helpers ---------------------------------------------------------------

function sanitizeOptionValue(name: string): string {
  const trimmed = name.trim()
  return trimmed || 'image'
}

function deduplicateValues(values: string[]): string[] {
  const seen = new Map<string, number>()
  return values.map((value) => {
    const count = seen.get(value) ?? 0
    seen.set(value, count + 1)
    return count === 0 ? value : `${value}-${count + 1}`
  })
}

/**
 * Suggest a sensible component title from uploaded asset/file names and existing titles.
 */
export function suggestMultiImageComponentTitle(
  names: readonly string[],
  existingTitles: readonly string[] = [],
): string {
  const cleanNames = names.map((name) => {
    const trimmed = name.trim()
    const lastDot = trimmed.lastIndexOf('.')
    return lastDot > 0 ? trimmed.slice(0, lastDot) : trimmed
  }).filter(Boolean)

  let baseTitle = '多图组件'
  if (cleanNames.length > 0) {
    let prefix = cleanNames[0]
    for (let i = 1; i < cleanNames.length; i++) {
      while (!cleanNames[i].toLowerCase().startsWith(prefix.toLowerCase())) {
        prefix = prefix.slice(0, -1)
        if (!prefix) break
      }
    }
    prefix = prefix.replace(/[-_\s\d]+$/, '').trim()
    if (prefix.length >= 2 && !/^\d+$/.test(prefix)) {
      baseTitle = prefix
    }
  }

  const existingSet = new Set(existingTitles.map((t) => t.trim().toLowerCase()))
  if (!existingSet.has(baseTitle.toLowerCase())) {
    return baseTitle
  }
  let counter = 2
  while (existingSet.has(`${baseTitle} ${counter}`.toLowerCase())) {
    counter += 1
  }
  return `${baseTitle} ${counter}`
}

