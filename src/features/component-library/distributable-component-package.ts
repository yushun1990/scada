import { assertComponentVisualAnimations } from '../../component-system/animations'
import type { ComponentDefinition } from '../../component-system/definition'
import { assertComponentDefinition } from '../../component-system/validation'
import {
  migrateLegacyComponentDefinition,
  parseLegacyComponentDefinition,
} from '../../component-system/versioned-component-definition'
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
 * This authority is intentionally independent from the editable local component
 * document schema and the SCADA work-package envelope version.
 */
export const LEGACY_DISTRIBUTABLE_COMPONENT_PACKAGE_VERSION = 1 as const
export const DISTRIBUTABLE_COMPONENT_PACKAGE_VERSION = 2 as const

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

function validatePortablePackageContent(
  definition: ComponentDefinition,
  visualValue: unknown,
  implementationDraft: string,
): DistributableComponentPackage | null {
  try {
    assertComponentDefinition(definition)
    assertComponentVisualDefinition(visualValue)
    const normalizedDefinition = cloneComponentDefinition(definition)
    const visual = cloneComponentVisual(visualValue)
    assertComponentVisualRules(normalizedDefinition, visual)
    assertComponentVisualAnimations(normalizedDefinition, visual)
    assertPortableVisualResources(visual)

    return {
      packageVersion: DISTRIBUTABLE_COMPONENT_PACKAGE_VERSION,
      definition: normalizedDefinition,
      visual,
      implementationDraft,
    }
  } catch {
    return null
  }
}

function parseCurrentDistributableComponentPackage(
  value: Record<string, unknown>,
): DistributableComponentPackage | null {
  if (
    value.packageVersion !== DISTRIBUTABLE_COMPONENT_PACKAGE_VERSION ||
    typeof value.implementationDraft !== 'string'
  ) {
    return null
  }

  try {
    assertComponentDefinition(value.definition)
  } catch {
    return null
  }

  return validatePortablePackageContent(
    value.definition,
    value.visual,
    value.implementationDraft,
  )
}

function parseLegacyDistributableComponentPackage(
  value: Record<string, unknown>,
): DistributableComponentPackage | null {
  if (
    value.packageVersion !== LEGACY_DISTRIBUTABLE_COMPONENT_PACKAGE_VERSION ||
    typeof value.implementationDraft !== 'string'
  ) {
    return null
  }

  const legacyDefinition = parseLegacyComponentDefinition(value.definition)
  if (!legacyDefinition) return null

  const migrated = migrateLegacyComponentDefinition(legacyDefinition)
  if (!migrated.ok) return null

  const {
    schemaVersion: _schemaVersion,
    ...definition
  } = migrated.definition

  return validatePortablePackageContent(
    definition,
    value.visual,
    value.implementationDraft,
  )
}

/**
 * Parse one transport-neutral package value without persistence, activation,
 * filesystem or network side effects.
 *
 * V2 is the current Attribute/Property-aware contract. V1 is migration input
 * only: it is accepted automatically only when every legacy field authority is
 * provable by the shared migration authority (for example bindable Properties).
 * Ambiguous V1 fields fail closed rather than being silently reclassified.
 */
export function parseDistributableComponentPackage(
  value: unknown,
): DistributableComponentPackage | null {
  if (!isRecord(value)) return null

  return parseCurrentDistributableComponentPackage(value)
    ?? parseLegacyDistributableComponentPackage(value)
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

  // Reuse the accepted local document codec as the preflight gate before local
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
 * Deterministic JSON document used by file export/import. V1 input is normalized
 * to the current V2 authority before serialization.
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
