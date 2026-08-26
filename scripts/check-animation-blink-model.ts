import assert from 'node:assert/strict'
import {
  applyVisualAnimationOverlay,
  assertComponentVisualAnimations,
  evaluateVisualAnimationPhase,
  evaluateVisualAnimationProgress,
  evaluateVisualAnimations,
} from '../src/component-system/animations'
import { resolveComponentVisualRules } from '../src/component-system/visualRules'

const definition = {
  type: 'test.blink-animation',
  title: 'Blink Animation Test',
  category: 'test',
  description: '',
  size: {
    defaultWidth: 100,
    defaultHeight: 100,
    minWidth: 10,
    minHeight: 10,
  },
  properties: {
    alarm: {
      title: 'Alarm',
      kind: 'boolean',
      defaultValue: false,
    },
  },
  actions: {},
  events: {},
  anchors: [],
} as const

const blinkAnimation = {
  id: 'lamp-blink',
  kind: 'blink',
  enabled: true,
  layerId: 'lamp',
  timing: {
    durationMs: 1000,
    delayMs: 0,
    iterations: 'infinite',
    direction: 'normal',
    easing: 'ease-in',
  },
  activation: { kind: 'always' },
} as const

const visual = {
  version: 3,
  mode: 'composite',
  designSize: { width: 100, height: 100 },
  layers: [
    {
      id: 'lamp',
      name: 'Lamp',
      kind: 'vector',
      parentId: null,
      transform: {
        x: 20,
        y: 20,
        width: 40,
        height: 40,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      },
      visible: true,
      opacity: 1,
      primitive: 'rect',
    },
  ],
  rules: [],
  animations: [blinkAnimation],
} as const

assert.doesNotThrow(() => assertComponentVisualAnimations(definition, visual))

assert.equal(evaluateVisualAnimationPhase(blinkAnimation.timing, 250), 0.25)
assert.equal(evaluateVisualAnimationProgress(blinkAnimation.timing, 250), 0.0625)
assert.equal(
  evaluateVisualAnimations(visual, {}, 250).lamp?.visibleGate,
  true,
  'blink uses raw directed phase and is visible in the first half-cycle',
)
assert.equal(
  evaluateVisualAnimations(visual, {}, 600).lamp?.visibleGate,
  false,
  'blink threshold must ignore easing; raw phase 0.6 is hidden even though ease-in progress is 0.36',
)

const hiddenOverlay = evaluateVisualAnimations(visual, {}, 600)
const hiddenRendered = applyVisualAnimationOverlay(visual, hiddenOverlay)
assert.equal(hiddenRendered.layers[0]?.visible, false)
assert.equal(visual.layers[0]?.visible, true, 'blink must not mutate persisted base visibility')

const alreadyHidden = {
  ...visual,
  layers: [{ ...visual.layers[0], visible: false }],
} as const
const visiblePhaseOverlay = evaluateVisualAnimations(alreadyHidden, {}, 100)
assert.equal(visiblePhaseOverlay.lamp?.visibleGate, true)
assert.equal(
  applyVisualAnimationOverlay(alreadyHidden, visiblePhaseOverlay).layers[0]?.visible,
  false,
  'blink gate must never force a base-hidden layer visible',
)

const delayedBlink = {
  ...blinkAnimation,
  id: 'lamp-blink-delayed',
  timing: {
    ...blinkAnimation.timing,
    delayMs: 400,
  },
} as const
const composedVisual = {
  ...visual,
  animations: [blinkAnimation, delayedBlink],
} as const
assert.equal(
  evaluateVisualAnimations(composedVisual, {}, 600).lamp?.visibleGate,
  false,
  'multiple blink gates compose with logical AND',
)

const ruleVisual = {
  ...visual,
  rules: [
    {
      id: 'hide-on-alarm',
      enabled: true,
      propertyKey: 'alarm',
      operator: 'equals',
      compareValue: true,
      layerId: 'lamp',
      target: 'visible',
      value: false,
    },
  ],
} as const
const ruleResolved = resolveComponentVisualRules(ruleVisual, { alarm: true })
assert.equal(ruleResolved.layers[0]?.visible, false)
const ruleOverlay = evaluateVisualAnimations(ruleResolved, { alarm: true }, 100)
assert.equal(ruleOverlay.lamp?.visibleGate, true)
assert.equal(
  applyVisualAnimationOverlay(ruleResolved, ruleOverlay).layers[0]?.visible,
  false,
  'Blink gate composes after Rules and cannot reveal rule-hidden content',
)
assert.equal(ruleResolved.layers[0]?.visible, false, 'blink must not mutate rule-resolved visibility')

const propertyBlink = {
  ...blinkAnimation,
  activation: {
    kind: 'property',
    propertyKey: 'alarm',
    operator: 'equals',
    compareValue: true,
  },
} as const
const propertyVisual = { ...visual, animations: [propertyBlink] } as const
assert.deepEqual(evaluateVisualAnimations(propertyVisual, { alarm: false }, 600), {})
assert.equal(
  evaluateVisualAnimations(propertyVisual, { alarm: true }, 600).lamp?.visibleGate,
  false,
)

const finiteBlink = {
  ...blinkAnimation,
  timing: {
    ...blinkAnimation.timing,
    iterations: 1,
  },
} as const
const finiteVisual = { ...visual, animations: [finiteBlink] } as const
assert.equal(evaluateVisualAnimations(finiteVisual, {}, 999).lamp?.visibleGate, false)
assert.deepEqual(
  evaluateVisualAnimations(finiteVisual, {}, 1000),
  {},
  'completed finite blink restores the rule/base visual state by dropping its transient gate',
)

const reverseBlink = {
  ...blinkAnimation,
  timing: {
    ...blinkAnimation.timing,
    direction: 'reverse',
  },
} as const
assert.equal(
  evaluateVisualAnimations({ ...visual, animations: [reverseBlink] }, {}, 100).lamp?.visibleGate,
  false,
  'reverse direction deterministically swaps the stepped phase',
)

console.log('Blink animation model checks passed: raw stepped phase, visibility gating, AND composition, rule ordering, property activation and lifecycle restoration are deterministic.')
