import assert from 'node:assert/strict'
import {
  applyVisualAnimationOverlay,
  assertComponentVisualAnimations,
  evaluateVisualAnimationProgress,
  evaluateVisualAnimations,
} from '../src/component-system/animations'

const linearTiming = {
  durationMs: 1000,
  delayMs: 100,
  iterations: 2,
  direction: 'normal',
  easing: 'linear',
} as const

assert.equal(evaluateVisualAnimationProgress(linearTiming, 99), null)
assert.equal(evaluateVisualAnimationProgress(linearTiming, 100), 0)
assert.equal(evaluateVisualAnimationProgress(linearTiming, 600), 0.5)
assert.equal(evaluateVisualAnimationProgress(linearTiming, 1100), 0)
assert.equal(evaluateVisualAnimationProgress(linearTiming, 2100), null)

assert.equal(
  evaluateVisualAnimationProgress(
    { ...linearTiming, delayMs: 0, iterations: 'infinite', direction: 'reverse' },
    250,
  ),
  0.75,
)
assert.equal(
  evaluateVisualAnimationProgress(
    { ...linearTiming, delayMs: 0, iterations: 'infinite', direction: 'alternate' },
    1250,
  ),
  0.75,
)
assert.equal(
  evaluateVisualAnimationProgress(
    { ...linearTiming, delayMs: 0, iterations: 'infinite', easing: 'ease-in' },
    250,
  ),
  0.0625,
)

const definition = {
  type: 'test.animation',
  title: 'Animation Test',
  category: 'test',
  description: '',
  size: {
    defaultWidth: 100,
    defaultHeight: 100,
    minWidth: 10,
    minHeight: 10,
  },
  properties: {
    running: {
      title: 'Running',
      kind: 'boolean',
      defaultValue: false,
    },
  },
  actions: {},
  events: {},
  anchors: [],
} as const

const visual = {
  version: 3,
  mode: 'composite',
  designSize: { width: 100, height: 100 },
  layers: [
    {
      id: 'wheel',
      name: 'Wheel',
      kind: 'vector',
      parentId: null,
      transform: {
        x: 10,
        y: 20,
        width: 40,
        height: 40,
        rotation: 20,
        scaleX: 1,
        scaleY: 1,
      },
      visible: true,
      opacity: 1,
      primitive: 'circle',
    },
  ],
  rules: [],
  animations: [
    {
      id: 'wheel-spin',
      kind: 'spin',
      enabled: true,
      layerId: 'wheel',
      degreesPerIteration: 360,
      timing: {
        durationMs: 1000,
        delayMs: 0,
        iterations: 'infinite',
        direction: 'normal',
        easing: 'linear',
      },
      activation: {
        kind: 'property',
        propertyKey: 'running',
        operator: 'equals',
        compareValue: true,
      },
    },
  ],
} as const

assert.doesNotThrow(() => assertComponentVisualAnimations(definition, visual))
assert.deepEqual(evaluateVisualAnimations(visual, { running: false }, 500), {})

const overlay = evaluateVisualAnimations(visual, { running: true }, 500)
assert.equal(overlay.wheel?.rotationDelta, 180)

const rendered = applyVisualAnimationOverlay(visual, overlay)
assert.equal(rendered.layers[0]?.transform.rotation, 200)
assert.equal(visual.layers[0]?.transform.rotation, 20, 'base visual must remain immutable')

const secondSpin = {
  ...visual.animations[0],
  id: 'wheel-spin-2',
  degreesPerIteration: 180,
  activation: { kind: 'always' },
} as const
const composedOverlay = evaluateVisualAnimations(
  { ...visual, animations: [visual.animations[0], secondSpin] },
  { running: true },
  500,
)
assert.equal(composedOverlay.wheel?.rotationDelta, 270)

const badLayer = structuredClone(visual)
badLayer.animations[0].layerId = 'missing'
assert.throws(
  () => assertComponentVisualAnimations(definition, badLayer),
  /不存在的 Layer/,
)

const badDuration = structuredClone(visual)
badDuration.animations[0].timing.durationMs = 0
assert.throws(
  () => assertComponentVisualAnimations(definition, badDuration),
  /durationMs/,
)

const badProperty = structuredClone(visual)
badProperty.animations[0].activation = {
  kind: 'property',
  propertyKey: 'missing',
  operator: 'equals',
  compareValue: true,
}
assert.throws(
  () => assertComponentVisualAnimations(definition, badProperty),
  /不存在的 Property/,
)

console.log('Animation model checks passed: timing, direction, easing, activation, composition and validation are deterministic.')
