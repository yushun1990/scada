import assert from 'node:assert/strict'
import type { ComponentDefinition } from '../src/component-system/definition'
import { resolvePumpPresentationColor } from '../src/component-system/builtins/PumpComponentRenderer'
import type { ComponentVisualDefinition } from '../src/component-system/visual'
import {
  assertComponentVisualRules,
  resolveComponentVisualRules,
} from '../src/component-system/visualRules'

const definition: ComponentDefinition = {
  type: 'test.m9b1-visual',
  title: 'M9B1 visual authority',
  category: 'test',
  description: '',
  size: {
    defaultWidth: 100,
    defaultHeight: 100,
    minWidth: 10,
    minHeight: 10,
  },
  attributes: {
    runningColor: {
      title: 'Running color',
      kind: 'color',
      defaultValue: '#00ff00',
    },
  },
  properties: {
    state: {
      title: 'State',
      kind: 'string',
      defaultValue: 'stopped',
      bindable: true,
    },
    opacity: {
      title: 'Opacity',
      kind: 'number',
      defaultValue: 1,
      bindable: true,
    },
  },
  actions: {},
  events: {},
  anchors: [],
}

const visual: ComponentVisualDefinition = {
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
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      },
      visible: true,
      opacity: 1,
      primitive: 'rect',
      style: {
        fill: '#111111',
        stroke: '#222222',
        strokeWidth: 1,
      },
    },
  ],
  rules: [
    {
      id: 'running-color',
      enabled: true,
      propertyKey: 'state',
      operator: 'equals',
      compareValue: 'running',
      layerId: 'body',
      target: 'style.fill',
      value: '#00ff00',
      valueSource: {
        namespace: 'attribute',
        key: 'runningColor',
      },
    },
    {
      id: 'runtime-opacity',
      enabled: true,
      propertyKey: 'state',
      operator: 'equals',
      compareValue: 'running',
      layerId: 'body',
      target: 'opacity',
      value: 1,
      valueSource: {
        namespace: 'property',
        key: 'opacity',
      },
    },
  ],
  animations: [],
}

assert.doesNotThrow(() => assertComponentVisualRules(definition, visual))

const running = resolveComponentVisualRules(visual, {
  attributes: { runningColor: '#7c3aed' },
  properties: { state: 'running', opacity: 0.65 },
})
const runningBody = running.layers[0]
assert.equal(runningBody?.kind, 'vector')
if (runningBody?.kind !== 'vector') throw new Error('expected vector body')
assert.equal(runningBody.style?.fill, '#7c3aed')
assert.equal(runningBody.opacity, 0.65)

const stopped = resolveComponentVisualRules(visual, {
  attributes: { runningColor: '#7c3aed' },
  properties: { state: 'stopped', opacity: 0.2 },
})
const stoppedBody = stopped.layers[0]
assert.equal(stoppedBody?.kind, 'vector')
if (stoppedBody?.kind !== 'vector') throw new Error('expected vector body')
assert.equal(stoppedBody.style?.fill, '#111111')
assert.equal(stoppedBody.opacity, 1)

const invalidSourceVisual: ComponentVisualDefinition = {
  ...visual,
  rules: [
    {
      ...visual.rules![0],
      valueSource: { namespace: 'attribute', key: 'missingColor' },
    },
  ],
}
assert.throws(
  () => assertComponentVisualRules(definition, invalidSourceVisual),
  /不存在的 Attribute/,
)

assert.equal(
  resolvePumpPresentationColor('running', { runningColor: '#123456' }),
  '#123456',
)
assert.equal(
  resolvePumpPresentationColor('alarm', { alarmColor: '#654321' }),
  '#654321',
)

console.log(
  'M9B1 runtime authority checks passed: private visual rules consume explicit Attribute/Property namespaces without flattening, missing sources fail validation, and Pump presentation color is authored Attribute state rather than a hard-coded runtime palette.',
)
