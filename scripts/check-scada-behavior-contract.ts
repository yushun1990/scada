import assert from 'node:assert/strict'
import {
  evaluateScadaConditionSet,
  resolveScadaDeviceActionReference,
  resolveScadaPropertyReference,
  shouldFireScadaBehavior,
  type ScadaBehaviorBinding,
  type ScadaConditionSet,
  type ScadaRuntimeValueReader,
} from '../src/scene/scada-behavior-contract'

const values = new Map<string, string | number | boolean | null>([
  ['pump-01:running', true],
  ['pump-01:fault', false],
  ['pump-01:pressure', 0.2],
  ['pump-02:running', true],
  ['pump-02:fault', false],
  ['pump-02:pressure', 0.6],
  ['pressure-sensor-01:pressure', 0.25],
])

const readValue: ScadaRuntimeValueReader = (sourceId, property) =>
  values.get(`${sourceId}:${property}`)

const primaryCondition: ScadaConditionSet = {
  groups: [
    {
      id: 'running-low-pressure',
      conditions: [
        {
          id: 'running',
          left: {
            kind: 'property',
            reference: {
              scope: 'primary-device',
              property: 'running',
            },
          },
          operator: 'eq',
          right: {
            kind: 'literal',
            value: true,
          },
        },
        {
          id: 'pressure',
          left: {
            kind: 'property',
            reference: {
              scope: 'primary-device',
              property: 'pressure',
            },
          },
          operator: 'lt',
          right: {
            kind: 'literal',
            value: 0.3,
          },
        },
      ],
    },
    {
      id: 'fault-alternative',
      conditions: [
        {
          id: 'fault',
          left: {
            kind: 'property',
            reference: {
              scope: 'primary-device',
              property: 'fault',
            },
          },
          operator: 'eq',
          right: {
            kind: 'literal',
            value: true,
          },
        },
      ],
    },
  ],
}

assert.equal(
  evaluateScadaConditionSet(
    primaryCondition,
    { deviceId: 'pump-01' },
    readValue,
  ),
  true,
  'conditions inside a group should AND together',
)

assert.equal(
  evaluateScadaConditionSet(
    primaryCondition,
    { deviceId: 'pump-02' },
    readValue,
  ),
  false,
  'the same relative conditions should resolve against the rebound primary device',
)

values.set('pump-02:fault', true)
assert.equal(
  evaluateScadaConditionSet(
    primaryCondition,
    { deviceId: 'pump-02' },
    readValue,
  ),
  true,
  'alternative condition groups should OR together',
)

const externalCondition: ScadaConditionSet = {
  groups: [
    {
      id: 'primary-running-external-pressure',
      conditions: [
        {
          id: 'running',
          left: {
            kind: 'property',
            reference: {
              scope: 'primary-device',
              property: 'running',
            },
          },
          operator: 'eq',
          right: {
            kind: 'literal',
            value: true,
          },
        },
        {
          id: 'external-pressure',
          left: {
            kind: 'property',
            reference: {
              scope: 'external',
              sourceId: 'pressure-sensor-01',
              property: 'pressure',
            },
          },
          operator: 'lt',
          right: {
            kind: 'literal',
            value: 0.3,
          },
        },
      ],
    },
  ],
}

assert.equal(
  evaluateScadaConditionSet(
    externalCondition,
    { deviceId: 'pump-02' },
    readValue,
  ),
  true,
  'external references should remain explicit when the primary device changes',
)

assert.deepEqual(
  resolveScadaPropertyReference(
    { scope: 'primary-device', property: 'running' },
    { deviceId: 'pump-02' },
  ),
  { sourceId: 'pump-02', property: 'running' },
)

assert.deepEqual(
  resolveScadaPropertyReference(
    {
      scope: 'external',
      sourceId: 'pressure-sensor-01',
      property: 'pressure',
    },
    { deviceId: 'pump-02' },
  ),
  { sourceId: 'pressure-sensor-01', property: 'pressure' },
)

assert.equal(
  resolveScadaPropertyReference(
    { scope: 'primary-device', property: 'running' },
    null,
  ),
  null,
  'relative references must not silently resolve without a primary device',
)

assert.deepEqual(
  resolveScadaDeviceActionReference(
    { scope: 'primary-device', action: 'start' },
    { deviceId: 'pump-02' },
  ),
  { sourceId: 'pump-02', action: 'start' },
  'interaction actions should follow the same primary-device rebind',
)

assert.deepEqual(
  resolveScadaDeviceActionReference(
    {
      scope: 'external',
      sourceId: 'shared-alarm-service',
      action: 'acknowledge',
    },
    { deviceId: 'pump-02' },
  ),
  { sourceId: 'shared-alarm-service', action: 'acknowledge' },
  'explicit external actions must not be rebound with the component device',
)

const enterBehavior: ScadaBehaviorBinding = {
  id: 'show-warning',
  enabled: true,
  edge: 'enter',
  conditions: primaryCondition,
  effect: {
    kind: 'component-action',
    action: 'showWarning',
  },
}

assert.equal(shouldFireScadaBehavior(enterBehavior, false, true), true)
assert.equal(
  shouldFireScadaBehavior(enterBehavior, true, true),
  false,
  'repeated telemetry that remains matched must not replay an enter action',
)
assert.equal(shouldFireScadaBehavior(enterBehavior, true, false), false)

const leaveBehavior: ScadaBehaviorBinding = {
  ...enterBehavior,
  id: 'clear-warning',
  edge: 'leave',
  effect: {
    kind: 'component-action',
    action: 'clearWarning',
  },
}

assert.equal(shouldFireScadaBehavior(leaveBehavior, true, false), true)
assert.equal(shouldFireScadaBehavior(leaveBehavior, false, false), false)
assert.equal(shouldFireScadaBehavior({ ...enterBehavior, enabled: false }, false, true), false)

assert.equal(
  evaluateScadaConditionSet({ groups: [] }, { deviceId: 'pump-01' }, readValue),
  false,
  'an empty condition set must never fire a behavior accidentally',
)

console.log(
  'SCADA behavior contract checks passed: flat condition groups use AND-within/OR-across semantics, primary-device references rebind without rewriting behaviors, external references stay explicit, and enter/leave edges prevent repeated telemetry from replaying one-shot component actions.',
)
