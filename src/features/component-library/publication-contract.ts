import type { ComponentLibraryEntry } from './component-document'
import {
  createDistributableComponentPackage,
  distributableComponentPackageToLibraryEntry,
  parseDistributableComponentPackage,
  type DistributableComponentPackage,
} from './distributable-component-package'

export const COMPONENT_PUBLICATION_SCHEMA_VERSION = 1 as const

/**
 * Compatibility name for the accepted M6.7 publication wire contract.
 * Publication now consumes the transport-neutral M7 package codec rather than
 * owning a second package definition.
 */
export type ComponentPublishedPackage = DistributableComponentPackage
export const parseComponentPublishedPackage = parseDistributableComponentPackage
export const createComponentPublishedPackage = createDistributableComponentPackage

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

  const componentPackage = createDistributableComponentPackage(entry)

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

  const componentPackage = parseDistributableComponentPackage(value.package)
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

  const componentPackage = parseDistributableComponentPackage(value.package)
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
  return distributableComponentPackageToLibraryEntry(revision.package, {
    id: `published:${revision.revisionId}`,
    updatedAt: revision.publishedAt,
  })
}
