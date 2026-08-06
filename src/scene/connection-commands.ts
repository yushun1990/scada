import { normalizeConnectionEndpoints } from '../components/ports'
import type {
  ConnectionEndpoint,
  SceneConnection,
  SceneDocument,
} from './model'

export type ConnectionEndpointRole = 'source' | 'target'

export type ReconnectConnectionStatus =
  | 'updated'
  | 'unchanged'
  | 'missing'
  | 'incompatible'
  | 'duplicate'

export type ReconnectConnectionResult = {
  scene: SceneDocument
  status: ReconnectConnectionStatus
  connection: SceneConnection | null
}

export function endpointsEqual(
  first: ConnectionEndpoint,
  second: ConnectionEndpoint,
) {
  return first.nodeId === second.nodeId && first.portId === second.portId
}

export function resolveReconnectedEndpoints(
  scene: SceneDocument,
  connection: SceneConnection,
  role: ConnectionEndpointRole,
  candidate: ConnectionEndpoint,
) {
  const fixedEndpoint =
    role === 'source' ? connection.target : connection.source
  const normalized =
    role === 'source'
      ? normalizeConnectionEndpoints(scene, candidate, fixedEndpoint)
      : normalizeConnectionEndpoints(scene, fixedEndpoint, candidate)

  if (!normalized) {
    return null
  }

  const keepsEndpointRoles =
    role === 'source'
      ? endpointsEqual(normalized.source, candidate) &&
        endpointsEqual(normalized.target, fixedEndpoint)
      : endpointsEqual(normalized.source, fixedEndpoint) &&
        endpointsEqual(normalized.target, candidate)

  return keepsEndpointRoles ? normalized : null
}

export function hasDuplicateConnection(
  scene: SceneDocument,
  source: ConnectionEndpoint,
  target: ConnectionEndpoint,
  ignoredConnectionId: string | null = null,
) {
  return scene.connections.some(
    (connection) =>
      connection.id !== ignoredConnectionId &&
      endpointsEqual(connection.source, source) &&
      endpointsEqual(connection.target, target),
  )
}

export function reconnectSceneConnection(
  scene: SceneDocument,
  connectionId: string,
  role: ConnectionEndpointRole,
  candidate: ConnectionEndpoint,
): ReconnectConnectionResult {
  const connection = scene.connections.find(
    (item) => item.id === connectionId,
  )

  if (!connection) {
    return { scene, status: 'missing', connection: null }
  }

  const currentEndpoint =
    role === 'source' ? connection.source : connection.target

  if (endpointsEqual(currentEndpoint, candidate)) {
    return { scene, status: 'unchanged', connection }
  }

  const endpoints = resolveReconnectedEndpoints(
    scene,
    connection,
    role,
    candidate,
  )

  if (!endpoints) {
    return { scene, status: 'incompatible', connection }
  }

  if (
    hasDuplicateConnection(
      scene,
      endpoints.source,
      endpoints.target,
      connection.id,
    )
  ) {
    return { scene, status: 'duplicate', connection }
  }

  const updatedConnection: SceneConnection = {
    ...connection,
    source: endpoints.source,
    target: endpoints.target,
  }

  return {
    scene: {
      ...scene,
      connections: scene.connections.map((item) =>
        item.id === connection.id ? updatedConnection : item,
      ),
    },
    status: 'updated',
    connection: updatedConnection,
  }
}
