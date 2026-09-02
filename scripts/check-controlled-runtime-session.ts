import assert from 'node:assert/strict'
import { applyVisualRuntimeOverlay } from '../src/component-system/visualRuntime'
import { resolveComponentVisualRules } from '../src/component-system/visualRules'
import { ControlledRuntimeSession } from '../src/runtime/controlled-runtime-session'
import type { ComponentProps } from '../src/component-system/definition'

const definition = {
  type: 'test.controlled-session',
  title: 'Controlled Session Test',
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
    speed: {
      title: 'Speed',
      kind: 'number',
      defaultValue: 0,
    },
  },
  actions: {
    reset: { title: 'Reset' },
  },
  events: {
    started: { title: 'Started' },
  },
  anchors: [],
} as const

const visual = {
  version: 3,
  mode: 'composite',
  designSize: { width: 100, height: 100 },
  layers: [
    {
      id: 'fan',
      name: 'Fan',
      kind: 'vector',
      parentId: null,
      transform: {
        x: 10,
        y: 20,
        width: 40,
        height: 40,
        rotation: 5,
        scaleX: 1,
        scaleY: 1,
      },
      visible: true,
      opacity: 0.8,
      primitive: 'circle',
    },
  ],
  rules: [
    {
      id: 'running-rotation',
      enabled: true,
      propertyKey: 'running',
      operator: 'equals',
      compareValue: true,
      layerId: 'fan',
      target: 'transform.rotation',
      value: 30,
    },
  ],
  animations: [],
} as const

let baseProperties: ComponentProps = {
  running: false,
  speed: 20,
}
const emitted: Array<[string, unknown]> = []
const invoked: Array<[string, unknown]> = []
const routedDiagnostics: Array<{ level: string; message: string; details?: unknown }> = []

const session = new ControlledRuntimeSession(
  definition,
  visual,
  () => baseProperties,
  {
    emitEvent(eventName, payload) {
      emitted.push([eventName, payload])
    },
    invokeAction(actionName, input) {
      invoked.push([actionName, input])
      return `handled:${actionName}`
    },
    reportDiagnostic(entry) {
      routedDiagnostics.push(entry)
    },
  },
)

assert.deepEqual(session.getEffectiveProperties(), {
  running: false,
  speed: 20,
})

session.runtime.properties.set('speed', 80)
baseProperties = { running: false, speed: 30 }
assert.equal(
  session.getEffectiveProperties().speed,
  80,
  'runtime override wins while it exists',
)
session.runtime.properties.clear('speed')
assert.equal(
  session.getEffectiveProperties().speed,
  30,
  'clear restores the current base value instead of a stale value captured at session creation',
)

baseProperties = { running: false, speed: Number.NaN }
assert.equal(
  session.getEffectiveProperties().speed,
  0,
  'invalid host base values fall back to the declared Property default',
)
baseProperties = { running: false, speed: 30 }

session.runtime.properties.set('running', true)
const ruleResolved = resolveComponentVisualRules(
  visual,
  {
    attributes: {},
    properties: session.getEffectiveProperties(),
  },
)
assert.equal(ruleResolved.layers[0]?.transform.rotation, 30)
assert.equal(visual.layers[0]?.transform.rotation, 5, 'rules/session must not mutate authored visual state')

session.runtime.visual.set('fan', 'transform.rotation', 100)
session.runtime.visual.set('fan', 'opacity', 0.6)
const absoluteResolved = session.applyVisualAbsoluteState(ruleResolved)
assert.equal(absoluteResolved.layers[0]?.transform.rotation, 100)
assert.equal(absoluteResolved.layers[0]?.opacity, 0.6)
assert.equal(ruleResolved.layers[0]?.transform.rotation, 30, 'absolute runtime state must remain transient')
assert.equal(ruleResolved.layers[0]?.opacity, 0.8)

session.runtime.visual.contribute('rotation-primary', 'fan', 'transform.rotation', 20)
session.runtime.visual.contribute('rotation-primary', 'fan', 'transform.rotation', 40)
session.runtime.visual.contribute('rotation-secondary', 'fan', 'transform.rotation', -10)
session.runtime.visual.contribute('scale-a', 'fan', 'transform.scaleX', 1.5)
session.runtime.visual.contribute('scale-b', 'fan', 'transform.scaleX', 2)
session.runtime.visual.contribute('gate-open', 'fan', 'visible', true)
session.runtime.visual.contribute('gate-closed', 'fan', 'visible', false)

const overlay = session.getVisualContributionOverlay()
assert.equal(
  overlay.fan?.['transform.rotation'],
  30,
  'same control id replaces its previous contribution while distinct controls compose',
)
assert.equal(overlay.fan?.['transform.scaleX'], 3)
assert.equal(overlay.fan?.visible, false)

const fullyResolved = applyVisualRuntimeOverlay(absoluteResolved, overlay)
assert.equal(fullyResolved.layers[0]?.transform.rotation, 130)
assert.equal(fullyResolved.layers[0]?.transform.scaleX, 3)
assert.equal(fullyResolved.layers[0]?.visible, false)
assert.equal(fullyResolved.layers[0]?.opacity, 0.6)

session.runtime.visual.clearContribution('rotation-secondary')
assert.equal(session.getVisualContributionOverlay().fan?.['transform.rotation'], 40)
session.runtime.visual.clear('fan', 'transform.rotation')
const restoredAbsolute = session.applyVisualAbsoluteState(ruleResolved)
assert.equal(
  restoredAbsolute.layers[0]?.transform.rotation,
  30,
  'clearing an absolute visual override restores the current rule-resolved value',
)

session.runtime.events.emit('started', { speed: 30 })
assert.deepEqual(emitted, [['started', { speed: 30 }]])
assert.equal(session.runtime.actions.invoke('reset', { hard: true }), 'handled:reset')
assert.deepEqual(invoked, [['reset', { hard: true }]])

session.runtime.diagnostics.log('warn', 'test diagnostic', { code: 7 })
assert.deepEqual(session.getDiagnostics(), [
  { level: 'warn', message: 'test diagnostic', details: { code: 7 } },
])
assert.deepEqual(routedDiagnostics, [
  { level: 'warn', message: 'test diagnostic', details: { code: 7 } },
])

session.reset()
assert.deepEqual(session.getEffectiveProperties(), { running: false, speed: 30 })
assert.deepEqual(session.getVisualAbsoluteState(), {})
assert.deepEqual(session.getVisualContributionOverlay(), {})
assert.deepEqual(session.getDiagnostics(), [])
assert.equal(visual.layers[0]?.opacity, 0.8, 'session reset must not mutate authored visual state')

const unavailableHostSession = new ControlledRuntimeSession(
  definition,
  visual,
  () => ({ running: false, speed: 0 }),
)
assert.throws(
  () => unavailableHostSession.runtime.events.emit('started'),
  /Event host capability 不可用/,
)
assert.throws(
  () => unavailableHostSession.runtime.actions.invoke('reset'),
  /Action host capability 不可用/,
)
unavailableHostSession.dispose()

session.dispose()
assert.equal(session.isDisposed, true)
assert.throws(() => session.getEffectiveProperties(), /Session 已释放/)
assert.throws(() => session.runtime.properties.set('speed', 10), /Session 已释放/)
session.dispose()

console.log('Controlled Runtime session checks passed: dynamic base properties, reversible absolute visual state, idempotent control slots, generic contribution composition, host callbacks, diagnostics and disposal remain runtime-only and deterministic.')
