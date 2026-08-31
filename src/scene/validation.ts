import { studioComponentRegistry } from '../component-system/builtins'
import type { SceneDocument } from './schema'
import {
  parseSceneDocumentWithRegistry,
  serializeSceneDocumentWithRegistry,
} from './validation-core'

/**
 * Existing Studio/default parser bound to the live product component registry.
 *
 * Portable-work/package preflight must import the pure scoped codec from
 * `scene/validation-core` instead of mutating this live registry first.
 */
export function parseSceneDocument(json: string): SceneDocument {
  return parseSceneDocumentWithRegistry(json, studioComponentRegistry)
}

/**
 * Existing Studio/default persistence path. Persistence still passes through
 * the current parser/migrator so legacy in-memory scenes cannot be written back
 * without normalization.
 */
export function serializeSceneDocument(scene: SceneDocument) {
  return serializeSceneDocumentWithRegistry(scene, studioComponentRegistry)
}
