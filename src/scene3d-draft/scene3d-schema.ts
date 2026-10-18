import type {
  ComponentAttributeValues,
  ComponentPropertyFallbackValues,
  ComponentScalarValue,
} from '../component-system/definition'
import {
  parsePersistedScadaSemantics,
  type PersistedScadaSemantics,
} from '../scene/scada-semantics-persistence'

/**
 * M10A draft authority for the Scene3D v1 document shape.
 *
 * This module is the isolated contract/spike area required by the M10A
 * acceptance matrix. Nothing under editor persistence, UI or Preview may
 * import it: canonical Scene3D persistence is M10B work and starts only
 * after the M10A decision record is accepted. Architecture authority:
 * `docs/architecture/3d-scene-editor.md` (Scene3D v1).
 */

export const SCENE3D_DRAFT_VERSION = 1 as const
export const SCENE3D_UNITS = 'm' as const
export const SCENE3D_UP_AXIS = 'Y' as const

export type Vec3 = readonly [number, number, number]
export type Quaternion = readonly [number, number, number, number]

export type Transform3D = {
  position: Vec3
  /** Canonical rotation. Euler angles are an Inspector projection only. */
  rotation: Quaternion
  scale: Vec3
}

export type Scene3DCamera = {
  position: Vec3
  target: Vec3
  up: Vec3
  /** Vertical field of view in degrees, exclusive (0, 180). */
  fovY: number
}

export type Scene3DEnvironment =
  | { kind: 'none' }
  | { kind: 'solid'; color: string }

export type Scene3DComponentNode = {
  kind: 'component'
  id: string
  parentId: string | null
  transform: Transform3D
  type: string
  attributes: ComponentAttributeValues
  propertyFallbacks: ComponentPropertyFallbackValues
  scadaSemantics: PersistedScadaSemantics | null
}

export type Scene3DGroupNode = {
  kind: 'group'
  id: string
  parentId: string | null
  transform: Transform3D
}

export type Scene3DNode = Scene3DComponentNode | Scene3DGroupNode

export type Scene3DConnectionEndpoint = {
  nodeId: string
  anchorId: string
}

export type Scene3DConnection = {
  id: string
  source: Scene3DConnectionEndpoint
  target: Scene3DConnectionEndpoint
}

export type Scene3DDocumentV1 = {
  version: typeof SCENE3D_DRAFT_VERSION
  id: string
  name: string
  units: typeof SCENE3D_UNITS
  upAxis: typeof SCENE3D_UP_AXIS
  environment: Scene3DEnvironment
  runtimeCamera: Scene3DCamera
  nodes: readonly Scene3DNode[]
  connections: readonly Scene3DConnection[]
}

export type Scene3DDraftValidationResult =
  | { ok: true; document: Scene3DDocumentV1 }
  | { ok: false; issues: readonly string[] }

const QUATERNION_MIN_NORM = 1e-12

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isComponentScalarValue(value: unknown): value is ComponentScalarValue {
  return (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
    || isFiniteNumber(value)
  )
}

function isFiniteVec3(value: unknown, label: string, issues: string[]): Vec3 | null {
  if (
    !Array.isArray(value)
    || value.length !== 3
    || !value.every(isFiniteNumber)
  ) {
    issues.push(`${label} must be three finite numbers`)
    return null
  }
  return [value[0], value[1], value[2]]
}

/**
 * Quaternions are normalized at the versioned input boundary. Only zero and
 * non-finite quaternions are unrecoverable; near-unit input is normalized.
 */
function normalizeQuaternion(
  value: unknown,
  label: string,
  issues: string[],
): Quaternion | null {
  if (
    !Array.isArray(value)
    || value.length !== 4
    || !value.every(isFiniteNumber)
  ) {
    issues.push(`${label} must be four finite numbers`)
    return null
  }

  const norm = Math.hypot(value[0], value[1], value[2], value[3])
  if (norm < QUATERNION_MIN_NORM) {
    issues.push(`${label} must not be a zero quaternion`)
    return null
  }

  return [value[0] / norm, value[1] / norm, value[2] / norm, value[3] / norm]
}

function parseTransform3D(
  value: unknown,
  label: string,
  issues: string[],
): Transform3D | null {
  if (!isRecord(value)) {
    issues.push(`${label} must be an object`)
    return null
  }

  const position = isFiniteVec3(value.position, `${label}.position`, issues)
  const rotation = normalizeQuaternion(
    value.rotation,
    `${label}.rotation`,
    issues,
  )
  const scale = isFiniteVec3(value.scale, `${label}.scale`, issues)

  if (!position || !rotation || !scale) return null

  if (scale.some((component) => component <= 0)) {
    issues.push(`${label}.scale components must be positive and non-zero`)
    return null
  }

  return { position, rotation, scale }
}

function parseEnvironment(
  value: unknown,
  issues: string[],
): Scene3DEnvironment | null {
  if (!isRecord(value)) {
    issues.push('environment must be an object')
    return null
  }

  if (value.kind === 'none') return { kind: 'none' }

  if (value.kind === 'solid' && isNonEmptyString(value.color)) {
    return { kind: 'solid', color: value.color }
  }

  issues.push(
    'environment must be { kind: "none" } or { kind: "solid", color: string }',
  )
  return null
}

function parseRuntimeCamera(
  value: unknown,
  issues: string[],
): Scene3DCamera | null {
  if (!isRecord(value)) {
    issues.push('runtimeCamera must be an object')
    return null
  }

  const position = isFiniteVec3(value.position, 'runtimeCamera.position', issues)
  const target = isFiniteVec3(value.target, 'runtimeCamera.target', issues)
  const up = isFiniteVec3(value.up, 'runtimeCamera.up', issues)

  if (!position || !target || !up) return null

  if (Math.hypot(...up) < QUATERNION_MIN_NORM) {
    issues.push('runtimeCamera.up must not be a zero vector')
    return null
  }

  if (!isFiniteNumber(value.fovY) || value.fovY <= 0 || value.fovY >= 180) {
    issues.push('runtimeCamera.fovY must be a finite number in (0, 180)')
    return null
  }

  return { position, target, up, fovY: value.fovY }
}

function parseScene3DNode(
  value: unknown,
  issues: string[],
): Scene3DNode | null {
  if (!isRecord(value)) {
    issues.push('nodes[] entries must be objects')
    return null
  }

  if (!isNonEmptyString(value.id)) {
    issues.push('nodes[] entries must have a non-empty id')
    return null
  }

  if (value.parentId !== null && !isNonEmptyString(value.parentId)) {
    issues.push(`node ${value.id}: parentId must be a non-empty string or null`)
    return null
  }

  const transform = parseTransform3D(value.transform, `node ${value.id}.transform`, issues)
  if (!transform) return null

  if (value.kind === 'group') {
    return {
      kind: 'group',
      id: value.id,
      parentId: value.parentId ?? null,
      transform,
    }
  }

  if (value.kind !== 'component') {
    issues.push(`node ${value.id}: kind must be "group" or "component"`)
    return null
  }

  if (!isNonEmptyString(value.type)) {
    issues.push(`node ${value.id}: component nodes must reference a component type`)
    return null
  }

  const attributes = isRecord(value.attributes) ? value.attributes : null
  if (!attributes) {
    issues.push(`node ${value.id}: attributes must be an object`)
    return null
  }
  const attributeValues: ComponentAttributeValues = {}
  for (const [key, attributeValue] of Object.entries(attributes)) {
    if (!isComponentScalarValue(attributeValue)) {
      issues.push(`node ${value.id}: attributes must contain scalar contract values only`)
      return null
    }
    attributeValues[key] = attributeValue
  }

  const propertyFallbacks = isRecord(value.propertyFallbacks)
    ? value.propertyFallbacks
    : null
  if (!propertyFallbacks) {
    issues.push(`node ${value.id}: propertyFallbacks must be an object`)
    return null
  }
  const fallbackValues: ComponentPropertyFallbackValues = {}
  for (const [key, fallbackValue] of Object.entries(propertyFallbacks)) {
    if (!isComponentScalarValue(fallbackValue)) {
      issues.push(`node ${value.id}: propertyFallbacks must contain scalar contract values only`)
      return null
    }
    fallbackValues[key] = fallbackValue
  }

  let scadaSemantics: PersistedScadaSemantics | null = null
  if (value.scadaSemantics !== null && value.scadaSemantics !== undefined) {
    try {
      scadaSemantics = parsePersistedScadaSemantics(value.scadaSemantics)
    } catch (error) {
      issues.push(
        `node ${value.id}: scadaSemantics is not a valid persisted semantics document: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      return null
    }
  }

  return {
    kind: 'component',
    id: value.id,
    parentId: value.parentId ?? null,
    transform,
    type: value.type,
    attributes: attributeValues,
    propertyFallbacks: fallbackValues,
    scadaSemantics,
  }
}

function detectHierarchyCycle(parentByNode: Map<string, string | null>): string | null {
  for (const start of parentByNode.keys()) {
    const seen = new Set<string>()
    let current: string | null = start
    while (current !== null) {
      if (seen.has(current)) {
        return `node ${start}: parent hierarchy contains a cycle at ${current}`
      }
      seen.add(current)
      current = parentByNode.get(current) ?? null
    }
  }
  return null
}

/**
 * Fail-closed draft validator for the Scene3D v1 input boundary. Future
 * versions are rejected explicitly; malformed transforms, hierarchies,
 * references and semantics produce stable diagnostics instead of partial
 * documents.
 */
export function validateScene3DDraftDocument(value: unknown): Scene3DDraftValidationResult {
  const issues: string[] = []

  if (!isRecord(value)) {
    return { ok: false, issues: ['Scene3D document must be an object'] }
  }

  if (value.version !== SCENE3D_DRAFT_VERSION) {
    return {
      ok: false,
      issues: [
        `unsupported Scene3D version ${String(
          value.version,
        )}: expected exactly ${SCENE3D_DRAFT_VERSION}`,
      ],
    }
  }

  const id = isNonEmptyString(value.id) ? value.id : null
  const name = isNonEmptyString(value.name) ? value.name : null
  if (!id || !name) {
    issues.push('Scene3D document must have non-empty id and name')
  }

  if (value.units !== SCENE3D_UNITS) {
    issues.push(`units must be "${SCENE3D_UNITS}"`)
  }

  if (value.upAxis !== SCENE3D_UP_AXIS) {
    issues.push(`upAxis must be "${SCENE3D_UP_AXIS}"`)
  }

  const environment = parseEnvironment(value.environment, issues)
  const runtimeCamera = parseRuntimeCamera(value.runtimeCamera, issues)

  if (!Array.isArray(value.nodes)) {
    issues.push('nodes must be an array')
    return { ok: false, issues }
  }

  const nodeIds = new Set<string>()
  for (const nodeValue of value.nodes) {
    if (isRecord(nodeValue) && isNonEmptyString(nodeValue.id)) {
      if (nodeIds.has(nodeValue.id)) {
        issues.push(`duplicate node id ${nodeValue.id}`)
      }
      nodeIds.add(nodeValue.id)
    }
  }

  const nodes: Scene3DNode[] = []
  for (const nodeValue of value.nodes) {
    const node = parseScene3DNode(nodeValue, issues)
    if (node) nodes.push(node)
  }

  const parentByNode = new Map<string, string | null>()
  for (const node of nodes) {
    if (node.parentId !== null && !nodeIds.has(node.parentId)) {
      issues.push(`node ${node.id}: parentId ${node.parentId} does not reference a known node`)
      continue
    }
    parentByNode.set(node.id, node.parentId)
  }

  const cycle = detectHierarchyCycle(parentByNode)
  if (cycle) issues.push(cycle)

  const connections: Scene3DConnection[] = []
  if (!Array.isArray(value.connections)) {
    issues.push('connections must be an array')
  } else {
    const connectionIds = new Set<string>()
    for (const connectionValue of value.connections) {
      if (!isRecord(connectionValue) || !isNonEmptyString(connectionValue.id)) {
        issues.push('connections[] entries must have a non-empty id')
        continue
      }
      if (connectionIds.has(connectionValue.id)) {
        issues.push(`duplicate connection id ${connectionValue.id}`)
      }
      connectionIds.add(connectionValue.id)

      const endpoints: Scene3DConnectionEndpoint[] = []
      for (const endpointKey of ['source', 'target'] as const) {
        const endpoint = connectionValue[endpointKey]
        if (
          !isRecord(endpoint)
          || !isNonEmptyString(endpoint.nodeId)
          || !isNonEmptyString(endpoint.anchorId)
        ) {
          issues.push(
            `connection ${connectionValue.id}: ${endpointKey} must reference nodeId and anchorId`,
          )
          endpoints.length = 0
          break
        }
        if (!nodeIds.has(endpoint.nodeId)) {
          issues.push(
            `connection ${connectionValue.id}: ${endpointKey}.nodeId ${endpoint.nodeId} does not reference a known node`,
          )
        }
        endpoints.push({ nodeId: endpoint.nodeId, anchorId: endpoint.anchorId })
      }

      if (endpoints.length === 2) {
        connections.push({
          id: connectionValue.id,
          source: endpoints[0],
          target: endpoints[1],
        })
      }
    }
  }

  if (issues.length > 0 || !environment || !runtimeCamera || !id || !name) {
    return { ok: false, issues }
  }

  return {
    ok: true,
    document: {
      version: SCENE3D_DRAFT_VERSION,
      id,
      name,
      units: SCENE3D_UNITS,
      upAxis: SCENE3D_UP_AXIS,
      environment,
      runtimeCamera,
      nodes,
      connections,
    },
  }
}
