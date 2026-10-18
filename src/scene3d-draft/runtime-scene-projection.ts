import { isComponentNode } from '../scene/schema'
import type { SceneDocument } from '../scene/schema'
import type { PersistedScadaSemantics } from '../scene/scada-semantics-persistence'
import type { Scene3DComponentNode, Scene3DDocumentV1 } from './scene3d-schema'

/**
 * M10A draft of the renderer-independent RuntimeSceneProjection.
 *
 * Both Scene kinds project to the same minimal semantic runtime input.
 * Geometry, camera, lighting and material data must never enter this shape:
 * the projection type deliberately contains only contract-level fields, so
 * equivalent 2D and 3D component instances produce one identical runtime
 * input. Architecture authority: `docs/architecture/3d-scene-editor.md`
 * (RuntimeSceneProjection).
 */

export type RuntimeComponentInstanceDraft = {
  id: string
  type: string
  attributes: Readonly<Record<string, unknown>>
  propertyFallbacks: Readonly<Record<string, unknown>>
  scadaSemantics: PersistedScadaSemantics | null
}

export type RuntimeSceneProjectionDraft = {
  instances: readonly RuntimeComponentInstanceDraft[]
}

export function projectScene2DDocument(
  scene: SceneDocument,
): RuntimeSceneProjectionDraft {
  return {
    instances: scene.nodes.filter(isComponentNode).map((node) => ({
      id: node.id,
      type: node.type,
      attributes: node.attributes,
      propertyFallbacks: node.propertyFallbacks,
      scadaSemantics: node.scadaSemantics,
    })),
  }
}

export function projectScene3DDocument(
  scene: Scene3DDocumentV1,
): RuntimeSceneProjectionDraft {
  return {
    instances: scene.nodes
      .filter((node): node is Scene3DComponentNode => node.kind === 'component')
      .map((node) => ({
        id: node.id,
        type: node.type,
        attributes: node.attributes,
        propertyFallbacks: node.propertyFallbacks,
        scadaSemantics: node.scadaSemantics,
      })),
  }
}
