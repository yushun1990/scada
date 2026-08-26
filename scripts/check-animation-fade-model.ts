import assert from 'node:assert/strict'
import {
  applyVisualAnimationOverlay,
  assertComponentVisualAnimations,
  evaluateVisualAnimations,
} from '../src/component-system/animations'
import { resolveComponentVisualRules } from '../src/component-system/visualRules'

const definition = {
  type: 'test.fade-animation',
  title: 'Fade Animation Test',
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

const fadeAnimation = {
  id: 'body-fade',
  kind: 'fade',
  enabled: true,
  layerId: 'body',
  opacityMultiplier: 0,
  timing: {
    durationMs: 1000,
    delayMs: 0,
    iterations: 'infinite',
    direction: 'normal',
    easing: 'linear',
  },
  activation: { kind: 'always' },
} as const

const visual = {
  version: 3,
  mode: 'composite',
  designSize: { width: 100, height: 100 },
  layers: [
    {
      id: 'body',
      name: 'Body',
      kind: 'vector',
      parentId: null,
      transform: {
        x: 10,
        y: 20,
        width: 40,
        height: 40,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      },
      visible: true,
      opacity: 0.8,
      primitive: 'rect',
    },
  ],
  rules: [],
  animations: [fadeAnimation],
} as const

assert.doesNotThrow(() => assertComponentVisualAnimations(definition, visual))

const halfOverlay = evaluateVisualAnimations(visual, {}, 500)
assert.equal(halfOverlay.body?.opacityMultiplier, 0.5)
const halfRendered = applyVisualAnimationOverlay(visual, halfOverlay)
assert.equal(halfRendered.layers[0]?.opacity, 0.4)
assert.equal(visual.layers[0]?.opacity, 0.8, 'fade must not mutate persisted base opacity')

const secondFade = {
  ...fadeAnimation,
  id: 'body-fade-2',
  opacityMultiplier: 0.5,
} as const
const composedOverlay = evaluateVisualAnimations(
  { ...visual, animations: [fadeAnimation, secondFade] },
  {},
  500,
)
assert.equal(composedOverlay.body?.opacityMultiplier, 0.375)
const composedRendered = applyVisualAnimationOverlay(visual, composedOverlay)
assert.ok(Math.abs((composedRendered.layers[0]?.opacity ?? 0) - 0.3) < 1e-12)

const ruleVisual = {
  ...visual,
  rules: [
    {
      id: 'running-base-opacity',
      enabled: true,
      propertyKey: 'running',
      operator: 'equals',
      compareValue: true,
      layerId: 'body',
      target: 'opacity',
      value: 0.5,
    },
  ],
} as const
const ruleResolved = resolveComponentVisualRules(ruleVisual, { running: true })
assert.equal(ruleResolved.layers[0]?.opacity, 0.5)
const ruleOverlay = evaluateVisualAnimations(ruleResolved, { running: true }, 500)
const ruleAnimated = applyVisualAnimationOverlay(ruleResolved, ruleOverlay)
assert.equal(ruleAnimated.layers[0]?.opacity, 0.25)
assert.equal(ruleResolved.layers[0]?.opacity, 0.5, 'fade must not mutate rule-resolved opacity')

const propertyFade = {
  ...fadeAnimation,
  activation: {
    kind: 'property',
    propertyKey: 'running',
    operator: 'equals',
    compareValue: true,
  },
} as const
const propertyVisual = { ...visual, animations: [propertyFade] } as const
assert.deepEqual(evaluateVisualAnimations(propertyVisual, { running: false }, 500), {})
assert.equal(
  evaluateVisualAnimations(propertyVisual, { running: true }, 500).body?.opacityMultiplier,
  0.5,
)

const badNegative = structuredClone(visual)
badNegative.animations[0].opacityMultiplier = -0.1
assert.throws(
  () => assertComponentVisualAnimations(definition, badNegative),
  /opacityMultiplier/,
)

const badAboveOne = structuredClone(visual)
badAboveOne.animations[0].opacityMultiplier = 1.1
assert.throws(
  () => assertComponentVisualAnimations(definition, badAboveOne),
  /opacityMultiplier/,
)

console.log('Fade animation model checks passed: opacity interpolation, multiplicative composition, rule ordering, property activation and validation are deterministic.')
