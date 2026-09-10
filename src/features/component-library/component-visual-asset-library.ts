import { browserPersistence, ensureBrowserPersistenceReady } from '../../storage/browser-persistence'
import type { ImportedVisualAsset } from './visual-asset-import'

const COMPONENT_VISUAL_ASSET_LIBRARY_META_KEY = 'component-visual-asset-library-v1'

export type ComponentVisualAssetResource = ImportedVisualAsset & {
  id: string
  createdAt: string
}

function isComponentVisualAssetResource(value: unknown): value is ComponentVisualAssetResource {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false

  const candidate = value as Record<string, unknown>
  if (
    typeof candidate.id !== 'string' || !candidate.id ||
    typeof candidate.createdAt !== 'string' ||
    (candidate.kind !== 'svg' && candidate.kind !== 'image') ||
    typeof candidate.name !== 'string' ||
    typeof candidate.assetRef !== 'string' || !candidate.assetRef.startsWith('data:image/') ||
    typeof candidate.intrinsicWidth !== 'number' || !Number.isFinite(candidate.intrinsicWidth) || candidate.intrinsicWidth <= 0 ||
    typeof candidate.intrinsicHeight !== 'number' || !Number.isFinite(candidate.intrinsicHeight) || candidate.intrinsicHeight <= 0
  ) {
    return false
  }

  if (candidate.kind === 'svg' && (typeof candidate.document !== 'object' || candidate.document === null)) {
    return false
  }

  return true
}

function cloneResource(resource: ComponentVisualAssetResource): ComponentVisualAssetResource {
  return structuredClone(resource)
}

function parseLibrary(value: unknown): ComponentVisualAssetResource[] {
  if (!Array.isArray(value)) return []

  return value
    .filter(isComponentVisualAssetResource)
    .map(cloneResource)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export async function listComponentVisualAssetResources() {
  await ensureBrowserPersistenceReady()
  return parseLibrary(
    await browserPersistence.getMeta(COMPONENT_VISUAL_ASSET_LIBRARY_META_KEY),
  )
}

export async function addComponentVisualAssetResources(
  assets: readonly ImportedVisualAsset[],
) {
  if (assets.length === 0) return listComponentVisualAssetResources()

  await ensureBrowserPersistenceReady()
  const current = parseLibrary(
    await browserPersistence.getMeta(COMPONENT_VISUAL_ASSET_LIBRARY_META_KEY),
  )
  const createdAt = new Date().toISOString()
  const additions = assets.map((asset, index): ComponentVisualAssetResource => ({
    ...cloneResource({
      ...asset,
      id: `visual-asset-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${index}-${Math.random()}`}`,
      createdAt,
    }),
  }))
  const next = [...additions, ...current]

  await browserPersistence.setMeta(COMPONENT_VISUAL_ASSET_LIBRARY_META_KEY, next)
  return next.map(cloneResource)
}
