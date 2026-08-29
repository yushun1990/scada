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

export const COMPONENT_PUBLICATION_SCHEMA_VERSION = 1 as const

export type ComponentPublishedPackage = {
  packageVersion: typeof COMPONENT_PACKAGE_VERSION
  definition: ComponentDefinition
  visual: ComponentVisualDefinition
  implementationDraft: string
}

export type ComponentPublicationRequest = {
  schemaVersion: typeof COMPONENT_PUBLICATION_SCHEMA_VERSION
  requestId: string
  componentType: string
  baseRevision: number | null
  package: ComponentPublishedPackage
}

export type PublishedComponentRevision = {
  schemaVersion: typeof COMPONENT_PUBLICATION_SCHEMA_VERSION
  revisionId: string
  requestId: string
  componentType: string
  revision: number
  package: ComponentPublishedPackage
  publishedAt: string
}

export type ComponentPublicationHead = {
  schemaVersion: typeof COMPONENT_PUBLICATION_SCHEMA_VERSION
  componentType: string
  title: string
  latestRevision: number
  latestRevisionId: string
  publishedAt: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0
}

function isBaseRevision(value: unknown): value is number | null {
  return value === null || isPositiveInteger(value)
}

function clonePublishedPackage(
  componentPackage: ComponentPublishedPackage,
): ComponentPublishedPackage {
  return {
    packageVersion: componentPackage.packageVersion,
    definition: cloneComponentDefinition(componentPackage.definition),
    visual: cloneComponentVisual(componentPackage.visual),
    implementationDraft: componentPackage.implementationDraft,
  }
}

export function parseComponentPublishedPackage(
  value: unknown,
): ComponentPublishedPackage | null {
  if (
    !isRecord(value) ||
    value.packageVersion !== COMPONENT_PACKAGE_VERSION ||
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

    return {
      packageVersion: COMPONENT_PACKAGE_VERSION,
      definition,
      visual,
      implementationDraft: value.implementationDraft,
    }
  } catch {
    return null
  }
}

export function createComponentPublishedPackage(
  entry: ComponentLibraryEntry,
): ComponentPublishedPackage {
  if (entry.builtIn) {
    throw new Error('Built-in components are not publishable user packages')
  }
  if (entry.status !== 'ready') {
    throw new Error('Only ready local component packages can be published')
  }

  // Reuse the accepted local package codec as the publication preflight gate.
  // Publication deliberately drops local identity/status/timestamps afterward.
  serializeComponentLibraryDocument(entry)

  return {
    packageVersion: COMPONENT_PACKAGE_VERSION,
    definition: cloneComponentDefinition(entry.definition),
    visual: cloneComponentVisual(entry.visual),
    implementationDraft: entry.implementationDraft,
  }
}

export function createComponentPublicationRequest(
  entry: ComponentLibraryEntry,
  options: {
    requestId: string
    baseRevision: number | null
  },
): ComponentPublicationRequest {
  if (!isNonEmptyString(options.requestId)) {
    throw new Error('Publication requestId cannot be empty')
  }
  if (!isBaseRevision(options.baseRevision)) {
    throw new Error('Publication baseRevision must be null or a positive integer')
  }

  const componentPackage = createComponentPublishedPackage(entry)

  return {
    schemaVersion: COMPONENT_PUBLICATION_SCHEMA_VERSION,
    requestId: options.requestId,
    componentType: componentPackage.definition.type,
    baseRevision: options.baseRevision,
    package: componentPackage,
  }
}

export function parseComponentPublicationRequest(
  value: unknown,
): ComponentPublicationRequest | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== COMPONENT_PUBLICATION_SCHEMA_VERSION ||
    !isNonEmptyString(value.requestId) ||
    !isNonEmptyString(value.componentType) ||
    !isBaseRevision(value.baseRevision)
  ) {
    return null
  }

  const componentPackage = parseComponentPublishedPackage(value.package)
  if (!componentPackage || componentPackage.definition.type !== value.componentType) {
    return null
  }

  return {
    schemaVersion: COMPONENT_PUBLICATION_SCHEMA_VERSION,
    requestId: value.requestId,
    componentType: value.componentType,
    baseRevision: value.baseRevision,
    package: componentPackage,
  }
}

export function parsePublishedComponentRevision(
  value: unknown,
): PublishedComponentRevision | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== COMPONENT_PUBLICATION_SCHEMA_VERSION ||
    !isNonEmptyString(value.revisionId) ||
    !isNonEmptyString(value.requestId) ||
    !isNonEmptyString(value.componentType) ||
    !isPositiveInteger(value.revision) ||
    !isNonEmptyString(value.publishedAt)
  ) {
    return null
  }

  const componentPackage = parseComponentPublishedPackage(value.package)
  if (!componentPackage || componentPackage.definition.type !== value.componentType) {
    return null
  }

  return {
    schemaVersion: COMPONENT_PUBLICATION_SCHEMA_VERSION,
    revisionId: value.revisionId,
    requestId: value.requestId,
    componentType: value.componentType,
    revision: value.revision,
    package: componentPackage,
    publishedAt: value.publishedAt,
  }
}

export function parseComponentPublicationHead(
  value: unknown,
): ComponentPublicationHead | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== COMPONENT_PUBLICATION_SCHEMA_VERSION ||
    !isNonEmptyString(value.componentType) ||
    !isNonEmptyString(value.title) ||
    !isPositiveInteger(value.latestRevision) ||
    !isNonEmptyString(value.latestRevisionId) ||
    !isNonEmptyString(value.publishedAt)
  ) {
    return null
  }

  return {
    schemaVersion: COMPONENT_PUBLICATION_SCHEMA_VERSION,
    componentType: value.componentType,
    title: value.title,
    latestRevision: value.latestRevision,
    latestRevisionId: value.latestRevisionId,
    publishedAt: value.publishedAt,
  }
}

export function publishedRevisionToLibraryEntry(
  revision: PublishedComponentRevision,
): ComponentLibraryEntry {
  const componentPackage = clonePublishedPackage(revision.package)

  return {
    version: COMPONENT_PACKAGE_VERSION,
    id: `published:${revision.revisionId}`,
    definition: componentPackage.definition,
    visual: componentPackage.visual,
    status: 'ready',
    implementationDraft: componentPackage.implementationDraft,
    updatedAt: revision.publishedAt,
    builtIn: false,
  }
}
