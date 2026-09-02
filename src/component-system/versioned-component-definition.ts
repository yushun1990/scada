import {
  createDefaultAttributeValuesFromDefinition,
  createDefaultPropertyFallbackValuesFromDefinition,
  type ComponentAttributeDefinition,
  type ComponentAttributeValues,
  type ComponentDefinition,
  type ComponentPropertyDefinition,
  type ComponentPropertyFallbackValues,
  type LegacyComponentDefinition,
} from './definition'
import { assertComponentDefinition } from './validation'

export const COMPONENT_DEFINITION_SCHEMA_VERSION = 2 as const

export type VersionedComponentDefinition = ComponentDefinition & {
  schemaVersion: typeof COMPONENT_DEFINITION_SCHEMA_VERSION
}

export type LegacyComponentFieldAuthority = 'attribute' | 'property'

/**
 * Explicit migration decisions are required only for legacy fields whose
 * authority cannot be proven from the old contract.
 */
export type LegacyComponentAuthorityManifest = Readonly<
  Record<string, LegacyComponentFieldAuthority>
>

export type LegacyComponentFieldClassification =
  | {
      kind: 'attribute'
      field: string
      source: 'manifest'
    }
  | {
      kind: 'property'
      field: string
      source: 'legacy-bindable' | 'manifest'
    }
  | {
      kind: 'ambiguous'
      field: string
      reason: string
    }

export type LegacyComponentDefinitionMigrationResult =
  | {
      ok: true
      definition: VersionedComponentDefinition
      classifications: readonly LegacyComponentFieldClassification[]
    }
  | {
      ok: false
      classifications: readonly LegacyComponentFieldClassification[]
      issues: readonly string[]
    }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Parse the pre-M9 public component-definition shape without assigning
 * Attribute/Property authority. Validation is reused only for scalar/action/
 * event/anchor structure by temporarily supplying an empty Attribute map; the
 * returned value remains explicitly typed as legacy migration input.
 */
export function parseLegacyComponentDefinition(
  value: unknown,
): LegacyComponentDefinition | null {
  if (!isRecord(value) || 'attributes' in value) return null

  const candidate = {
    ...value,
    attributes: {},
  }

  try {
    assertComponentDefinition(candidate)
  } catch {
    return null
  }

  return {
    type: candidate.type,
    title: candidate.title,
    category: candidate.category,
    description: candidate.description,
    size: candidate.size,
    properties: candidate.properties,
    actions: candidate.actions,
    events: candidate.events,
    anchors: candidate.anchors,
  }
}

function toAttributeDefinition(
  property: ComponentPropertyDefinition,
): ComponentAttributeDefinition {
  return {
    title: property.title,
    kind: property.kind,
    defaultValue: property.defaultValue,
    ...(property.description === undefined
      ? {}
      : { description: property.description }),
    ...(property.options === undefined ? {} : { options: property.options }),
  }
}

export function classifyLegacyComponentField(
  field: string,
  definition: ComponentPropertyDefinition,
  manifest: LegacyComponentAuthorityManifest = {},
): LegacyComponentFieldClassification {
  const explicitAuthority = manifest[field]

  if (definition.bindable === true) {
    if (explicitAuthority === 'attribute') {
      return {
        kind: 'ambiguous',
        field,
        reason:
          'legacy field is explicitly bindable and cannot be demoted to Attribute by migration manifest',
      }
    }

    return {
      kind: 'property',
      field,
      source: explicitAuthority === 'property' ? 'manifest' : 'legacy-bindable',
    }
  }

  if (explicitAuthority === 'attribute') {
    return { kind: 'attribute', field, source: 'manifest' }
  }

  if (explicitAuthority === 'property') {
    return { kind: 'property', field, source: 'manifest' }
  }

  return {
    kind: 'ambiguous',
    field,
    reason:
      'legacy non-bindable field does not encode whether it is authored configuration or runtime semantic state',
  }
}

export function migrateLegacyComponentDefinition(
  legacy: LegacyComponentDefinition,
  manifest: LegacyComponentAuthorityManifest = {},
): LegacyComponentDefinitionMigrationResult {
  const attributes: Record<string, ComponentAttributeDefinition> = {}
  const properties: Record<string, ComponentPropertyDefinition> = {}
  const classifications: LegacyComponentFieldClassification[] = []
  const issues: string[] = []

  for (const manifestField of Object.keys(manifest)) {
    if (!(manifestField in legacy.properties)) {
      issues.push(
        `migration manifest references unknown legacy field ${manifestField}`,
      )
    }
  }

  for (const [field, definition] of Object.entries(legacy.properties)) {
    const classification = classifyLegacyComponentField(
      field,
      definition,
      manifest,
    )
    classifications.push(classification)

    if (classification.kind === 'ambiguous') {
      issues.push(`${field}: ${classification.reason}`)
      continue
    }

    if (classification.kind === 'attribute') {
      attributes[field] = toAttributeDefinition(definition)
      continue
    }

    properties[field] = definition
  }

  if (issues.length > 0) {
    return {
      ok: false,
      classifications,
      issues,
    }
  }

  return {
    ok: true,
    definition: {
      schemaVersion: COMPONENT_DEFINITION_SCHEMA_VERSION,
      type: legacy.type,
      title: legacy.title,
      category: legacy.category,
      description: legacy.description,
      size: legacy.size,
      attributes,
      properties,
      actions: legacy.actions,
      events: legacy.events,
      anchors: legacy.anchors,
    },
    classifications,
  }
}

export function createDefaultAttributeValues(
  definition: VersionedComponentDefinition,
): ComponentAttributeValues {
  return createDefaultAttributeValuesFromDefinition(definition)
}

export function createDefaultPropertyFallbackValues(
  definition: VersionedComponentDefinition,
): ComponentPropertyFallbackValues {
  return createDefaultPropertyFallbackValuesFromDefinition(definition)
}
