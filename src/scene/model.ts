import { studioComponentRegistry } from '../component-system/builtins'
import {
  SCENE_VERSION,
  createSceneId,
  type ComponentSceneNode,
  type SceneDocument,
} from './schema'

export * from './schema'

/**
 * Studio authoring helper. Pure Scene schema/validation code must import from
 * `scene/schema` instead so it does not pull trusted renderer/native assets.
 */
export function createComponentNode(
  componentType: string,
  index: number,
  offset = 0,
): ComponentSceneNode {
  const registration = studioComponentRegistry.require(componentType)
  const { definition } = registration

  return {
    id: createSceneId('component'),
    type: definition.type,
    name: `${definition.title} ${index}`,
    parentId: null,
    visible: true,
    locked: false,
    transform: {
      x: 220 + offset,
      y: 48 + offset,
      width: definition.size.defaultWidth,
      height: definition.size.defaultHeight,
      rotation: 0,
    },
    props: registration.createDefaultProps(),
    bindings: [],
    behaviors: [],
    scadaSemantics: null,
  }
}

/** Studio default-document helper bound to the live component registry. */
export function createDefaultScene(): SceneDocument {
  const defaultRegistration = studioComponentRegistry.list()[0] ?? null

  return {
    version: SCENE_VERSION,
    id: createSceneId('scene'),
    name: 'scada-lab',
    width: 1280,
    height: 720,
    background: '#edf1f5',
    nodes: defaultRegistration
      ? [createComponentNode(defaultRegistration.definition.type, 1)]
      : [],
    connections: [],
  }
}
