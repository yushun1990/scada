import { assertComponentVisualAnimations } from '../../component-system/animations'
import type { ComponentDefinition } from '../../component-system/definition'
import { assertComponentDefinition } from '../../component-system/validation'
import {
  assertComponentVisualDefinition,
  cloneComponentVisual,
  type ComponentVisualDefinition,
} from '../../component-system/visual'
import { assertComponentVisualRules } from '../../component-system/visualRules'
import {
  COMPONENT_PACKAGE_VERSION,
  cloneComponentDefinition,
  serializeComponentLibraryDocument,
  type ComponentLibraryEntry,
} from './component-document'

/**
 * Version of the transport-neutral distributable artifact.
 *
 * Keep this separate from the editable ComponentLibraryEntry schema even while
 * both are currently version 1. A future local authoring migration must not
 * silently change the wire/file distribution contract.
 */
export const DISTRIBUTABLE_COMPONENT_PACKAGE_VERSION = 1 as const

export type DistributableComponentPackage = {
  packageVersion: typeof DISTRIBUTABLE_COMPONENT_PACKAGE_VERSION
  definition: ComponentDefinition
  visual: ComponentVisualDefinition
  implementationDraft: string
}

export type DistributableComponentImportMetadata = Readonly<{
  id: string
  updatedAt: string
}>

const PORTABLE_IMAGE_MEDIA_TYPES = new Set([
  'image/svg+xml',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isSelfContainedPortableImageRef(assetRef: string) {
  if (!assetRef || assetRef !== assetRef.trim()) {
    return false
  }

  const match = /^data:([^;,]+)(?:;[^,]*)?,/i.exec(assetRef)
  if (!match || !PORTABLE_IMAGE_MEDIA_TYPES.has(match[1].toLowerCase())) {
    return false
  }

  return assetRef.indexOf(',') < assetRef.length - 1
}

function assertPortableVisualResources(visual: ComponentVisualDefinition) {
  for (const layer of visual.layers) {
    if (layer.kind !== 'svg' && layer.kind !== 'image') {
      continue
    }

    if (!isSelfContainedPortableImageRef(layer.assetRef)) {
      throw new Error(
        `Portable visual layer ${layer.id} must use a self-contained data:image assetRef`,
      )
    }
  }
}

function cloneDistributableComponentPackage(
  componentPackage: DistributableComponentPackage,
): DistributableComponentPackage {
  return {
    packageVersion: DISTRIBUTABLE_COMPONENT_PACKAGE_VERSION,
    definition: cloneComponentDefinition(componentPackage.definition),
    visual: cloneComponentVisual(componentPackage.visual),
    implementationDraft: componentPackage.implementationDraft,
  }
}

/**
 * Parse one transport-neutral package value without persistence, activation,
 * filesystem or network side effects.
 *
 * Local editable visuals may still carry host-relative asset references while
 * authoring. The distribution boundary is stricter: every SVG/Image layer must
 * already be self-contained so a package cannot validate successfully while
 * depending on a browser host path, remote URL or process-local blob URL.
 */
export function parseDistributableComponentPackage(
  value: unknown,
): DistributableComponentPackage | null {
  if (
    !isRecord(value) ||
    value.packageVersion !== DISTRIBUTABLE_COMPONENT_PACKAGE_VERSION ||
    typeof value.implementationDraft !== 'string'
  ) {
    return null
  }

  try {
    assertComponentDefinition(value.definition)
    assertComponentVisualDefinition(value.visual)
    const definition = cloneComponentDefinition(value.definition)
    const visual = cloneComponentVisual(value.visual)
    assertComponentVisualRules(definition, visual)
    assertComponentVisualAnimations(definition, visual)
    assertPortableVisualResources(visual)

    return {
      packageVersion: DISTRIBUTABLE_COMPONENT_PACKAGE_VERSION,
      definition,
      visual,
      implementationDraft: value.implementationDraft,
    }
  } catch {
    return null
  }
}

/**
 * Convert a validated ready local authoring document into the distribution
 * artifact. Local repository identity/status/timestamps are deliberately not
 * carried across this boundary.
 */
export function createDistributableComponentPackage(
  entry: ComponentLibraryEntry,
): DistributableComponentPackage {
  if (entry.builtIn) {
    throw new Error('Built-in components are not distributable user packages')
  }
  if (entry.status !== 'ready') {
    throw new Error('Only ready local component packages can be distributed')
  }

  // Reuse the accepted local package codec as the preflight gate before local
  // metadata is removed from the transport-neutral artifact.
  serializeComponentLibraryDocument(entry)
  assertPortableVisualResources(entry.visual)

  return {
    packageVersion: DISTRIBUTABLE_COMPONENT_PACKAGE_VERSION,
    definition: cloneComponentDefinition(entry.definition),
    visual: cloneComponentVisual(entry.visual),
    implementationDraft: entry.implementationDraft,
  }
}

/**
 * Deterministic JSON document used by future file export/import. The output is
 * produced from a normalized cloned package so callers cannot smuggle local
 * repository metadata into the serialized artifact.
 */
export function serializeDistributableComponentPackage(
  componentPackage: DistributableComponentPackage,
): string {
  const normalized = parseDistributableComponentPackage(componentPackage)
  if (!normalized) {
    throw new Error('Distributable component package is invalid')
  }

  return JSON.stringify(normalized, null, 2)
}

export function parseDistributableComponentPackageDocument(
  raw: string,
): DistributableComponentPackage | null {
  try {
    return parseDistributableComponentPackage(JSON.parse(raw))
  } catch {
    return null
  }
}

/**
 * Pure conversion back into the existing local package model. The caller owns
 * the new local repository identity/timestamp; neither value is encoded in the
 * distribution artifact itself.
 */
export function distributableComponentPackageToLibraryEntry(
  componentPackage: DistributableComponentPackage,
  metadata: DistributableComponentImportMetadata,
): ComponentLibraryEntry {
  if (!isNonEmptyString(metadata.id)) {
    throw new Error('Imported component local id cannot be empty')
  }
  if (!isNonEmptyString(metadata.updatedAt)) {
    throw new Error('Imported component updatedAt cannot be empty')
  }

  const normalized = parseDistributableComponentPackage(componentPackage)
  if (!normalized) {
    throw new Error('Distributable component package is invalid')
  }

  const cloned = cloneDistributableComponentPackage(normalized)

  return {
    version: COMPONENT_PACKAGE_VERSION,
    id: metadata.id,
    definition: cloned.definition,
    visual: cloned.visual,
    status: 'ready',
    implementationDraft: cloned.implementationDraft,
    updatedAt: metadata.updatedAt,
    builtIn: false,
  }
}
