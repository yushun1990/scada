export const COMPONENT_PUBLICATION_SCHEMA_VERSION = 1
export const COMPONENT_PACKAGE_VERSION = 1

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0
}

function isBaseRevision(value) {
  return value === null || isPositiveInteger(value)
}

export function normalizePublicationRequest(body, routeComponentType) {
  if (
    !isRecord(body) ||
    body.schemaVersion !== COMPONENT_PUBLICATION_SCHEMA_VERSION ||
    !isNonEmptyString(body.requestId) ||
    !isNonEmptyString(body.componentType) ||
    !isBaseRevision(body.baseRevision) ||
    !isRecord(body.package)
  ) {
    return null
  }

  const componentPackage = body.package
  if (
    componentPackage.packageVersion !== COMPONENT_PACKAGE_VERSION ||
    !isRecord(componentPackage.definition) ||
    !isNonEmptyString(componentPackage.definition.type) ||
    !isNonEmptyString(componentPackage.definition.title) ||
    !isRecord(componentPackage.visual) ||
    typeof componentPackage.implementationDraft !== 'string'
  ) {
    return null
  }

  const componentType = body.componentType.trim()
  if (
    componentPackage.definition.type !== componentType ||
    (routeComponentType !== undefined && routeComponentType !== componentType)
  ) {
    return null
  }

  return {
    schemaVersion: COMPONENT_PUBLICATION_SCHEMA_VERSION,
    requestId: body.requestId.trim(),
    componentType,
    baseRevision: body.baseRevision,
    package: componentPackage,
    title: componentPackage.definition.title.trim(),
  }
}

export function normalizeRevisionParam(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null
  const revision = Number(value)
  return isPositiveInteger(revision) ? revision : null
}

export function toPublishedRevision(row) {
  return {
    schemaVersion: COMPONENT_PUBLICATION_SCHEMA_VERSION,
    revisionId: row.revisionId,
    requestId: row.requestId,
    componentType: row.componentType,
    revision: row.revision,
    package: row.package,
    publishedAt: row.publishedAt,
  }
}

export function toPublicationHead(row) {
  return {
    schemaVersion: COMPONENT_PUBLICATION_SCHEMA_VERSION,
    componentType: row.componentType,
    title: row.title,
    latestRevision: row.latestRevision,
    latestRevisionId: row.latestRevisionId,
    publishedAt: row.publishedAt,
  }
}
