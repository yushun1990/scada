import assert from 'node:assert/strict'
import {
  applyVisualRuntimeOverlay,
  composeVisualRuntimeContribution,
  evaluateVisualRuntimeContributionTrack,
  VISUAL_RUNTIME_TARGET_DESCRIPTORS,
  type VisualRuntimeOverlay,
} from '../src/component-system/visualRuntime'

assert.deepEqual(VISUAL_RUNTIME_TARGET_DESCRIPTORS, {
  'transform.x': { valueKind: 'number', composition: 'add', identity: 0 },
  'transform.y': { valueKind: 'number', composition: 'add', identity: 0 },
  'transform.rotation': { valueKind: 'number', composition: 'add', identity: 0 },
  'transform.scaleX': { valueKind: 'number', composition: 'multiply', identity: 1 },
  'transform.scaleY': { valueKind: 'number', composition: 'multiply', identity: 1 },
  opacity: { valueKind: 'number', composition: 'multiply', identity: 1 },
  visible: { valueKind: 'boolean', composition: 'gate', identity: true },
})

assert.equal(
  evaluateVisualRuntimeContributionTrack(
    { target: 'transform.x', sampling: 'continuous', to: 100 },
    0.5,
    0.25,
  ),
  25,
  'additive numeric tracks interpolate from composition identity 0 using eased progress',
)
assert.equal(
  evaluateVisualRuntimeContributionTrack(
    { target: 'transform.scaleX', sampling: 'continuous', to: 2 },
    0.5,
    0.25,
  ),
  1.25,
  'multiplicative numeric tracks interpolate from composition identity 1 using eased progress',
)
assert.equal(
  evaluateVisualRuntimeContributionTrack(
    { target: 'opacity', sampling: 'continuous', to: 0 },
    0.5,
    0.25,
  ),
  0.75,
)
assert.equal(
  evaluateVisualRuntimeContributionTrack(
    { target: 'visible', sampling: 'step', threshold: 0.5, before: true, after: false },
    0.6,
    0.1,
  ),
  false,
  'step tracks sample raw phase and ignore eased progress',
)

const overlay: VisualRuntimeOverlay = {}
composeVisualRuntimeContribution(overlay, 'layer1', 'transform.x', 20)
composeVisualRuntimeContribution(overlay, 'layer1', 'transform.x', -5)
composeVisualRuntimeContribution(overlay, 'layer1', 'transform.y', 7)
composeVisualRuntimeContribution(overlay, 'layer1', 'transform.rotation', 45)
composeVisualRuntimeContribution(overlay, 'layer1', 'transform.rotation', 15)
composeVisualRuntimeContribution(overlay, 'layer1', 'transform.scaleX', 1.5)
composeVisualRuntimeContribution(overlay, 'layer1', 'transform.scaleX', 2)
composeVisualRuntimeContribution(overlay, 'layer1', 'transform.scaleY', 0.5)
composeVisualRuntimeContribution(overlay, 'layer1', 'opacity', 0.8)
composeVisualRuntimeContribution(overlay, 'layer1', 'opacity', 0.5)
composeVisualRuntimeContribution(overlay, 'layer1', 'visible', true)
composeVisualRuntimeContribution(overlay, 'layer1', 'visible', false)

assert.deepEqual(overlay, {
  layer1: {
    'transform.x': 15,
    'transform.y': 7,
    'transform.rotation': 60,
    'transform.scaleX': 3,
    'transform.scaleY': 0.5,
    opacity: 0.4,
    visible: false,
  },
})

const visual = {
  version: 3,
  mode: 'composite',
  designSize: { width: 320, height: 240 },
  layers: [
    {
      id: 'layer1',
      name: 'Layer 1',
      kind: 'vector',
      parentId: null,
      transform: {
        x: 100,
        y: 50,
        width: 80,
        height: 30,
        rotation: 10,
        scaleX: -2,
        scaleY: 4,
      },
      visible: true,
      opacity: 0.75,
      primitive: 'rect',
      style: {
        fill: '#ffffff',
        stroke: '#000000',
        strokeWidth: 1,
      },
    },
  ],
  rules: [],
  animations: [],
} as const

const rendered = applyVisualRuntimeOverlay(visual, overlay)
const layer = rendered.layers[0]
assert.equal(layer?.transform.x, 115)
assert.equal(layer?.transform.y, 57)
assert.equal(layer?.transform.rotation, 70)
assert.equal(layer?.transform.scaleX, -6, 'positive runtime multipliers preserve mirrored base sign')
assert.equal(layer?.transform.scaleY, 2)
assert.ok(Math.abs((layer?.opacity ?? 0) - 0.3) < 1e-12)
assert.equal(layer?.visible, false)
assert.equal(layer?.transform.width, 80, 'runtime overlay leaves unrelated geometry unchanged')
assert.equal(layer?.transform.height, 30, 'runtime overlay leaves unrelated geometry unchanged')
assert.equal(visual.layers[0]?.transform.x, 100, 'runtime overlay never mutates base visual state')
assert.equal(visual.layers[0]?.visible, true, 'runtime overlay never mutates base visibility')
assert.equal(visual.layers[0]?.opacity, 0.75, 'runtime overlay never mutates base opacity')

const hiddenVisual = {
  ...visual,
  layers: [{ ...visual.layers[0], visible: false }],
} as const
const openGate: VisualRuntimeOverlay = {}
composeVisualRuntimeContribution(openGate, 'layer1', 'visible', true)
assert.equal(
  applyVisualRuntimeOverlay(hiddenVisual, openGate).layers[0]?.visible,
  false,
  'gate composition cannot force a hidden base layer visible',
)

assert.throws(
  () => composeVisualRuntimeContribution({}, 'layer1', 'transform.x', true),
  /number contribution/,
)
assert.throws(
  () => composeVisualRuntimeContribution({}, 'layer1', 'visible', 1),
  /boolean contribution/,
)

console.log('Visual Runtime checks passed: canonical targets, continuous/step contribution sampling, add/multiply/gate composition, immutable application and type guards are independent of named animation effects.')
