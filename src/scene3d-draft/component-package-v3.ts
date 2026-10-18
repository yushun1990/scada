import type { ComponentDefinition } from '../component-system/definition'
import { assertComponentDefinition } from '../component-system/validation'

/**
 * M10A draft of Component Package v3: one dimension-independent public
 * contract plus optional 2D/3D presentations and an explicit resource
 * manifest. Serialization, the v2 → v3 migration and activation behavior
 * remain M10C work. Architecture authority:
 * `docs/architecture/3d-scene-editor.md` (Component contract and
 * presentations).
 */

export const COMPONENT_PACKAGE_V3_DRAFT_VERSION = 3 as const

export const GLB_MEDIA_TYPE = 'model/gltf-binary' as const

export type ResourceManifestEntryDraft = {
  /** Lowercase SHA-256 content digest, exactly 64 hex characters. */
  digest: string
  mimeType: string
  byteLength: number
}

export type ResourceManifestDraft = readonly ResourceManifestEntryDraft[]

export type Visual2DPresentationDraft = {
  kind: 'visual-2d-v1'
  width: number
  height: number
}

export type PresentationRuleTargetDraft =
  | { kind: 'node-visibility'; nodeId: string }
  | { kind: 'material-base-color'; slotId: string }
  | { kind: 'material-emissive'; slotId: string }
  | { kind: 'animation-clip'; clipId: string }

/**
 * Declarative presentation rule draft: an authored Attribute or effective
 * Property namespace entry mapped onto one narrow presentation target.
 * Arbitrary Three objects, callbacks and shader sources stay unauthored.
 */
export type PresentationRuleDraft = {
  id: string
  sourceNamespace: 'attributes' | 'properties'
  sourceKey: string
  target: PresentationRuleTargetDraft
}

export type MaterialSlotDraft = {
  id: string
}

export type AnimationClipDraft = {
  id: string
  name: string
}

export type Anchor3DDraft = {
  id: string
  localPosition: readonly [number, number, number]
}

export type Visual3DPresentationDraft = {
  kind: 'visual-3d-v1'
  /** Stable imported hierarchy map target IDs (not renderer UUIDs). */
  importedNodeIds: readonly string[]
  /** Must reference a manifest entry digest. */
  modelDigest: string
  materialSlots: readonly MaterialSlotDraft[]
  animationClips: readonly AnimationClipDraft[]
  anchors: readonly Anchor3DDraft[]
  rules: readonly PresentationRuleDraft[]
}

export type ComponentPackageV3Draft = {
  packageVersion: typeof COMPONENT_PACKAGE_V3_DRAFT_VERSION
  definition: ComponentDefinition
  presentations: {
    '2d'?: Visual2DPresentationDraft
    '3d'?: Visual3DPresentationDraft
  }
  resources: ResourceManifestDraft
}

export type ComponentPackageV3DraftValidationResult =
  | { ok: true; package: ComponentPackageV3Draft }
  | { ok: false; issues: readonly string[] }

const SHA256_DIGEST_PATTERN = /^[0-9a-f]{64}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function parseManifest(
  value: unknown,
  issues: string[],
): Map<string, ResourceManifestEntryDraft> | null {
  if (!Array.isArray(value)) {
    issues.push('resources must be an array')
    return null
  }

  const entries = new Map<string, ResourceManifestEntryDraft>()
  for (const entryValue of value) {
    if (!isRecord(entryValue)) {
      issues.push('resources[] entries must be objects')
      continue
    }

    if (typeof entryValue.digest !== 'string' || !SHA256_DIGEST_PATTERN.test(entryValue.digest)) {
      issues.push('resources[] entries must carry a lowercase 64-hex SHA-256 digest')
      continue
    }

    if (entries.has(entryValue.digest)) {
      issues.push(`duplicate resource digest ${entryValue.digest}`)
      continue
    }

    if (!isNonEmptyString(entryValue.mimeType)) {
      issues.push(`resource ${entryValue.digest}: mimeType must be a non-empty string`)
      continue
    }

    if (!isFiniteNumber(entryValue.byteLength) || entryValue.byteLength <= 0) {
      issues.push(`resource ${entryValue.digest}: byteLength must be a positive finite number`)
      continue
    }

    entries.set(entryValue.digest, {
      digest: entryValue.digest,
      mimeType: entryValue.mimeType,
      byteLength: entryValue.byteLength,
    })
  }

  return entries
}

function parseVisual2DPresentation(
  value: unknown,
  issues: string[],
): Visual2DPresentationDraft | null {
  if (!isRecord(value) || value.kind !== 'visual-2d-v1') {
    issues.push('presentations.2d must have kind "visual-2d-v1"')
    return null
  }

  if (
    !isFiniteNumber(value.width)
    || value.width <= 0
    || !isFiniteNumber(value.height)
    || value.height <= 0
  ) {
    issues.push('presentations.2d width/height must be positive finite numbers')
    return null
  }

  return { kind: 'visual-2d-v1', width: value.width, height: value.height }
}

function collectUniqueIds(
  values: readonly unknown[],
  label: string,
  issues: string[],
): Set<string> | null {
  const ids = new Set<string>()
  for (const value of values) {
    if (!isRecord(value) || !isNonEmptyString(value.id)) {
      issues.push(`${label} entries must have a non-empty id`)
      return null
    }
    if (ids.has(value.id)) {
      issues.push(`duplicate ${label} id ${value.id}`)
      return null
    }
    ids.add(value.id)
  }
  return ids
}

function parseVisual3DPresentation(
  value: unknown,
  manifest: Map<string, ResourceManifestEntryDraft>,
  issues: string[],
): Visual3DPresentationDraft | null {
  if (!isRecord(value) || value.kind !== 'visual-3d-v1') {
    issues.push('presentations.3d must have kind "visual-3d-v1"')
    return null
  }

  if (typeof value.modelDigest !== 'string' || !SHA256_DIGEST_PATTERN.test(value.modelDigest)) {
    issues.push('presentations.3d modelDigest must be a lowercase 64-hex SHA-256 digest')
    return null
  }

  const modelEntry = manifest.get(value.modelDigest)
  if (!modelEntry) {
    issues.push(
      `presentations.3d modelDigest ${value.modelDigest} is not covered by the resource manifest`,
    )
    return null
  }
  if (modelEntry.mimeType !== GLB_MEDIA_TYPE) {
    issues.push(
      `presentations.3d model resource must be ${GLB_MEDIA_TYPE}, got ${modelEntry.mimeType}`,
    )
    return null
  }

  if (!Array.isArray(value.importedNodeIds)) {
    issues.push('presentations.3d importedNodeIds must be an array')
    return null
  }
  const importedNodeIds: string[] = []
  const seenNodeIds = new Set<string>()
  for (const nodeId of value.importedNodeIds) {
    if (!isNonEmptyString(nodeId)) {
      issues.push('presentations.3d importedNodeIds entries must be non-empty strings')
      return null
    }
    if (seenNodeIds.has(nodeId)) {
      issues.push(`duplicate imported node id ${nodeId}`)
      return null
    }
    seenNodeIds.add(nodeId)
    importedNodeIds.push(nodeId)
  }

  if (!Array.isArray(value.materialSlots) || !Array.isArray(value.animationClips)) {
    issues.push('presentations.3d materialSlots and animationClips must be arrays')
    return null
  }
  const materialSlotIds = collectUniqueIds(value.materialSlots, 'materialSlots', issues)
  const animationClipIds = collectUniqueIds(value.animationClips, 'animationClips', issues)
  if (!materialSlotIds || !animationClipIds) return null

  const animationClips: AnimationClipDraft[] = []
  for (const clipValue of value.animationClips) {
    const clip = clipValue as Record<string, unknown>
    if (!isNonEmptyString(clip.name)) {
      issues.push(`animation clip ${String(clip.id)}: name must be a non-empty string`)
      return null
    }
    animationClips.push({ id: clip.id as string, name: clip.name })
  }

  if (!Array.isArray(value.anchors)) {
    issues.push('presentations.3d anchors must be an array')
    return null
  }
  const anchorIds = collectUniqueIds(value.anchors, 'anchors', issues)
  if (!anchorIds) return null
  const anchors: Anchor3DDraft[] = []
  for (const anchorValue of value.anchors) {
    const anchor = anchorValue as Record<string, unknown>
    if (
      !Array.isArray(anchor.localPosition)
      || anchor.localPosition.length !== 3
      || !anchor.localPosition.every(isFiniteNumber)
    ) {
      issues.push(`anchor ${String(anchor.id)}: localPosition must be three finite numbers`)
      return null
    }
    anchors.push({
      id: anchor.id as string,
      localPosition: [anchor.localPosition[0], anchor.localPosition[1], anchor.localPosition[2]],
    })
  }

  if (!Array.isArray(value.rules)) {
    issues.push('presentations.3d rules must be an array')
    return null
  }
  const rules: PresentationRuleDraft[] = []
  const ruleIds = new Set<string>()
  for (const ruleValue of value.rules) {
    if (!isRecord(ruleValue)) {
      issues.push('rules[] entries must be objects')
      return null
    }
    if (!isNonEmptyString(ruleValue.id)) {
      issues.push('rules[] entries must have a non-empty id')
      return null
    }
    if (ruleIds.has(ruleValue.id)) {
      issues.push(`duplicate rule id ${ruleValue.id}`)
      return null
    }
    ruleIds.add(ruleValue.id)

    if (
      (ruleValue.sourceNamespace !== 'attributes' && ruleValue.sourceNamespace !== 'properties')
      || !isNonEmptyString(ruleValue.sourceKey)
    ) {
      issues.push(
        `rule ${ruleValue.id}: sourceNamespace must be "attributes" or "properties" and sourceKey non-empty`,
      )
      return null
    }

    const target = ruleValue.target
    if (!isRecord(target) || !isNonEmptyString(target.kind)) {
      issues.push(`rule ${ruleValue.id}: target must be a discriminated presentation target`)
      return null
    }
    switch (target.kind) {
      case 'node-visibility':
        if (!isNonEmptyString(target.nodeId) || !seenNodeIds.has(target.nodeId)) {
          issues.push(
            `rule ${ruleValue.id}: node-visibility target ${String(target.nodeId)} is not an imported node`,
          )
          return null
        }
        break
      case 'material-base-color':
      case 'material-emissive':
        if (!isNonEmptyString(target.slotId) || !materialSlotIds.has(target.slotId)) {
          issues.push(
            `rule ${ruleValue.id}: ${target.kind} target ${String(target.slotId)} is not a material slot`,
          )
          return null
        }
        break
      case 'animation-clip':
        if (!isNonEmptyString(target.clipId) || !animationClipIds.has(target.clipId)) {
          issues.push(
            `rule ${ruleValue.id}: animation-clip target ${String(target.clipId)} is not an animation clip`,
          )
          return null
        }
        break
      default:
        issues.push(`rule ${ruleValue.id}: unknown target kind ${String(target.kind)}`)
        return null
    }

    rules.push({
      id: ruleValue.id,
      sourceNamespace: ruleValue.sourceNamespace,
      sourceKey: ruleValue.sourceKey,
      target: target as unknown as PresentationRuleTargetDraft,
    })
  }

  return {
    kind: 'visual-3d-v1',
    importedNodeIds,
    modelDigest: value.modelDigest,
    materialSlots: value.materialSlots as MaterialSlotDraft[],
    animationClips,
    anchors,
    rules,
  }
}

/**
 * Fail-closed draft validator for Component Package v3. The public
 * definition is checked through the production component-definition
 * validator; presentation, manifest and rule-reference invariants are draft
 * scope. Transport encoding and the v2 migration stay out of this draft.
 */
export function validateComponentPackageV3Draft(
  value: unknown,
): ComponentPackageV3DraftValidationResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, issues: ['component package must be an object'] }
  }
  const record = value as Record<string, unknown>

  if (record.packageVersion !== COMPONENT_PACKAGE_V3_DRAFT_VERSION) {
    return {
      ok: false,
      issues: [
        `unsupported component package version ${String(
          record.packageVersion,
        )}: expected exactly ${COMPONENT_PACKAGE_V3_DRAFT_VERSION}`,
      ],
    }
  }

  try {
    assertComponentDefinition(record.definition)
  } catch (error) {
    return {
      ok: false,
      issues: [
        `definition is not a valid component contract: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ],
    }
  }
  const definition = record.definition as ComponentDefinition

  const issues: string[] = []
  const manifest = parseManifest(record.resources, issues)
  if (!manifest) return { ok: false, issues }

  const presentations = isRecord(record.presentations) ? record.presentations : {}
  const visual2d = '2d' in presentations
    ? parseVisual2DPresentation(presentations['2d'], issues)
    : null
  if ('2d' in presentations && !visual2d) return { ok: false, issues }

  const visual3d = '3d' in presentations
    ? parseVisual3DPresentation(presentations['3d'], manifest, issues)
    : null
  if ('3d' in presentations && !visual3d) return { ok: false, issues }

  if (!visual2d && !visual3d) {
    issues.push('component package v3 requires at least one presentation')
    return { ok: false, issues }
  }

  if (issues.length > 0) return { ok: false, issues }

  const drafts: ComponentPackageV3Draft = {
    packageVersion: COMPONENT_PACKAGE_V3_DRAFT_VERSION,
    definition,
    presentations: {
      ...(visual2d ? { '2d': visual2d } : {}),
      ...(visual3d ? { '3d': visual3d } : {}),
    },
    resources: [...manifest.values()],
  }
  return { ok: true, package: drafts }
}
