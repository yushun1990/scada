import assert from 'node:assert/strict'
import { compileVisualAnimation } from '../src/component-system/animations'

const timing = {
  durationMs: 1000,
  delayMs: 20,
  iterations: 'infinite',
  direction: 'alternate',
  easing: 'ease-in-out',
} as const
const activation = { kind: 'always' } as const

const cases = [
  {
    animation: {
      id: 'spin1',
      kind: 'spin',
      enabled: true,
      layerId: 'layer1',
      degreesPerIteration: 360,
      timing,
      activation,
    } as const,
    tracks: [
      { target: 'transform.rotation', sampling: 'continuous', to: 360 },
    ],
  },
  {
    animation: {
      id: 'move1',
      kind: 'move',
      enabled: true,
      layerId: 'layer1',
      deltaXPerIteration: 80,
      deltaYPerIteration: -20,
      timing,
      activation,
    } as const,
    tracks: [
      { target: 'transform.x', sampling: 'continuous', to: 80 },
      { target: 'transform.y', sampling: 'continuous', to: -20 },
    ],
  },
  {
    animation: {
      id: 'scale1',
      kind: 'scale',
      enabled: true,
      layerId: 'layer1',
      scaleXMultiplier: 1.5,
      scaleYMultiplier: 0.75,
      timing,
      activation,
    } as const,
    tracks: [
      { target: 'transform.scaleX', sampling: 'continuous', to: 1.5 },
      { target: 'transform.scaleY', sampling: 'continuous', to: 0.75 },
    ],
  },
  {
    animation: {
      id: 'fade1',
      kind: 'fade',
      enabled: true,
      layerId: 'layer1',
      opacityMultiplier: 0.2,
      timing,
      activation,
    } as const,
    tracks: [
      { target: 'opacity', sampling: 'continuous', to: 0.2 },
    ],
  },
  {
    animation: {
      id: 'blink1',
      kind: 'blink',
      enabled: true,
      layerId: 'layer1',
      timing,
      activation,
    } as const,
    tracks: [
      {
        target: 'visible',
        sampling: 'step',
        threshold: 0.5,
        before: true,
        after: false,
      },
    ],
  },
] as const

for (const { animation, tracks } of cases) {
  const compiled = compileVisualAnimation(animation)
  assert.equal(compiled.id, animation.id, 'persistent animation id is preserved as the runtime control identity')
  assert.equal(compiled.layerId, animation.layerId)
  assert.equal(compiled.enabled, animation.enabled)
  assert.equal(compiled.timing, animation.timing, 'adapter reuses accepted timing metadata')
  assert.equal(compiled.activation, animation.activation, 'adapter keeps activation outside visual tracks')
  assert.deepEqual(compiled.tracks, tracks)
}

console.log('Animation adapter checks passed: spin/move/scale/fade/blink compile into generic contribution tracks while preserving stable ids, timing and activation metadata.')
