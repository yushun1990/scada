import type {
  ComponentVisualDefinition,
  ComponentVisualLayer,
} from './visual'
import type { VisualRuntimeTarget } from './visualRuntime'

export type VisualRuntimeLayerState = {
  [Target in VisualRuntimeTarget]?: Target extends 'visible' ? boolean : number
}

export type VisualRuntimeAbsoluteState = Record<string, VisualRuntimeLayerState>

export function applyVisualRuntimeLayerState(
  layer: ComponentVisualLayer,
  state: VisualRuntimeLayerState,
): ComponentVisualLayer {
  return {
    ...layer,
    visible: state.visible ?? layer.visible,
    opacity: state.opacity ?? layer.opacity,
    transform: {
      ...layer.transform,
      x: state['transform.x'] ?? layer.transform.x,
      y: state['transform.y'] ?? layer.transform.y,
      rotation: state['transform.rotation'] ?? layer.transform.rotation,
      scaleX: state['transform.scaleX'] ?? layer.transform.scaleX,
      scaleY: state['transform.scaleY'] ?? layer.transform.scaleY,
    },
  }
}

export function applyVisualRuntimeAbsoluteState(
  visual: ComponentVisualDefinition,
  state: VisualRuntimeAbsoluteState,
): ComponentVisualDefinition {
  if (Object.keys(state).length === 0) return visual

  return {
    ...visual,
    layers: visual.layers.map((layer) => {
      const layerState = state[layer.id]
      return layerState
        ? applyVisualRuntimeLayerState(layer, layerState)
        : layer
    }),
  }
}
