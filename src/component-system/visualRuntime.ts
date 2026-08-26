import type {
  ComponentVisualDefinition,
  ComponentVisualLayer,
} from './visual'

export const VISUAL_RUNTIME_TARGET_DESCRIPTORS = {
  'transform.x': {
    valueKind: 'number',
    composition: 'add',
    identity: 0,
  },
  'transform.y': {
    valueKind: 'number',
    composition: 'add',
    identity: 0,
  },
  'transform.rotation': {
    valueKind: 'number',
    composition: 'add',
    identity: 0,
  },
  'transform.scaleX': {
    valueKind: 'number',
    composition: 'multiply',
    identity: 1,
  },
  'transform.scaleY': {
    valueKind: 'number',
    composition: 'multiply',
    identity: 1,
  },
  opacity: {
    valueKind: 'number',
    composition: 'multiply',
    identity: 1,
  },
  visible: {
    valueKind: 'boolean',
    composition: 'gate',
    identity: true,
  },
} as const

export type VisualRuntimeTarget = keyof typeof VISUAL_RUNTIME_TARGET_DESCRIPTORS
export type VisualRuntimeComposition =
  (typeof VISUAL_RUNTIME_TARGET_DESCRIPTORS)[VisualRuntimeTarget]['composition']
export type VisualRuntimeValueKind =
  (typeof VISUAL_RUNTIME_TARGET_DESCRIPTORS)[VisualRuntimeTarget]['valueKind']

export type VisualRuntimeLayerOverlay = {
  [Target in VisualRuntimeTarget]?: Target extends 'visible' ? boolean : number
}

export type VisualRuntimeOverlay = Record<string, VisualRuntimeLayerOverlay>

export function composeVisualRuntimeContribution(
  overlay: VisualRuntimeOverlay,
  layerId: string,
  target: VisualRuntimeTarget,
  contribution: number | boolean,
) {
  const descriptor = VISUAL_RUNTIME_TARGET_DESCRIPTORS[target]
  const layerOverlay = overlay[layerId] ?? {}
  const values = layerOverlay as Record<string, number | boolean | undefined>
  const current = values[target]

  if (descriptor.composition === 'add') {
    if (typeof contribution !== 'number') {
      throw new Error(`Visual Runtime target ${target} 需要 number contribution`)
    }
    values[target] = (typeof current === 'number' ? current : 0) + contribution
  } else if (descriptor.composition === 'multiply') {
    if (typeof contribution !== 'number') {
      throw new Error(`Visual Runtime target ${target} 需要 number contribution`)
    }
    values[target] = (typeof current === 'number' ? current : 1) * contribution
  } else {
    if (typeof contribution !== 'boolean') {
      throw new Error(`Visual Runtime target ${target} 需要 boolean contribution`)
    }
    values[target] = (typeof current === 'boolean' ? current : true) && contribution
  }

  overlay[layerId] = layerOverlay
}

function applyNumericContribution(
  target: Exclude<VisualRuntimeTarget, 'visible'>,
  base: number,
  contribution: number | undefined,
) {
  if (contribution === undefined) return base
  const descriptor = VISUAL_RUNTIME_TARGET_DESCRIPTORS[target]
  return descriptor.composition === 'add'
    ? base + contribution
    : base * contribution
}

function applyVisibilityGate(base: boolean, gate: boolean | undefined) {
  return gate === undefined ? base : base && gate
}

export function applyVisualRuntimeLayerOverlay(
  layer: ComponentVisualLayer,
  overlay: VisualRuntimeLayerOverlay,
): ComponentVisualLayer {
  return {
    ...layer,
    visible: applyVisibilityGate(layer.visible, overlay.visible),
    opacity: applyNumericContribution('opacity', layer.opacity, overlay.opacity),
    transform: {
      ...layer.transform,
      x: applyNumericContribution('transform.x', layer.transform.x, overlay['transform.x']),
      y: applyNumericContribution('transform.y', layer.transform.y, overlay['transform.y']),
      rotation: applyNumericContribution(
        'transform.rotation',
        layer.transform.rotation,
        overlay['transform.rotation'],
      ),
      scaleX: applyNumericContribution(
        'transform.scaleX',
        layer.transform.scaleX,
        overlay['transform.scaleX'],
      ),
      scaleY: applyNumericContribution(
        'transform.scaleY',
        layer.transform.scaleY,
        overlay['transform.scaleY'],
      ),
    },
  }
}

export function applyVisualRuntimeOverlay(
  visual: ComponentVisualDefinition,
  overlay: VisualRuntimeOverlay,
): ComponentVisualDefinition {
  if (Object.keys(overlay).length === 0) return visual

  return {
    ...visual,
    layers: visual.layers.map((layer) => {
      const layerOverlay = overlay[layer.id]
      return layerOverlay
        ? applyVisualRuntimeLayerOverlay(layer, layerOverlay)
        : layer
    }),
  }
}
