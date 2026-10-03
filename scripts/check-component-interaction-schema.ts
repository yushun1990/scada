import assert from 'node:assert/strict'
import type { ComponentActionDefinition, ComponentEventDefinition } from '../src/component-system/definition'
import { describeActionParameters, describeEventPayload } from '../src/components/component-interaction-schema'

const action: ComponentActionDefinition = {
  title: '请求调整',
  parameters: [
    { name: 'level', title: '等级', kind: 'number', description: '语义输入，不是状态写入' },
    {
      name: 'mode', title: '模式', kind: 'select', optional: true, nullable: true,
      options: [{ label: '数字一', value: 1 }, { label: '文本一', value: '1' }],
    },
    { name: 'label', title: '标签', kind: 'string', optional: true },
    { name: 'enabled', title: '启用', kind: 'boolean', optional: true, nullable: false },
    { name: 'accent', title: '颜色', kind: 'color', optional: true },
  ],
}
const event: ComponentEventDefinition = {
  title: '观察到的变化',
  payload: {
    level: { title: '等级', kind: 'number' },
    mode: { ...action.parameters![1] },
  },
}
const before = structuredClone({ action, event })
Object.freeze(action.parameters)
for (const parameter of action.parameters!) {
  if (parameter.options) {
    parameter.options.forEach(Object.freeze)
    Object.freeze(parameter.options)
  }
  Object.freeze(parameter)
}
Object.freeze(action)
Object.values(event.payload!).forEach(Object.freeze)
Object.freeze(event.payload)
Object.freeze(event)

const parameters = describeActionParameters(action)
assert.deepEqual(parameters.map((field) => field.name), ['level', 'mode', 'label', 'enabled', 'accent'])
assert.deepEqual(parameters.map((field) => field.type), [
  'number · 数字', 'select · 枚举', 'string · 文本', 'boolean · 布尔', 'color · 颜色',
])
assert.equal(parameters[0].description, '语义输入，不是状态写入')
assert.equal(parameters[0].requirement, '必填')
assert.equal(parameters[0].nullability, '不允许 null')
assert.equal(parameters[1].requirement, '可选')
assert.equal(parameters[1].nullability, '允许 null')
assert.equal(parameters[3].nullability, '不允许 null')
assert.deepEqual(parameters[1].options, [
  { label: '数字一', value: '1' }, { label: '文本一', value: '"1"' },
])
assert.deepEqual(parameters[0].options, [])
assert.deepEqual(describeActionParameters({ title: '无参数' }), [])
assert.deepEqual(describeActionParameters({ title: '无参数', parameters: [] }), [])
assert.equal(describeEventPayload({ title: '无载荷' }), undefined)
assert.deepEqual(describeEventPayload({ title: '空载荷', payload: {} }), [])
const payload = describeEventPayload(event)!
assert.deepEqual(payload.map((field) => field.name), ['level', 'mode'])
assert.equal(payload[0].requirement, '必填')
assert.equal(payload[1].requirement, '可选')
assert.equal(payload[1].nullability, '允许 null')
assert.deepEqual(payload[1].options, parameters[1].options)
assert.deepEqual({ action, event }, before, 'read-only consumption must not rewrite type-owned declarations')
assert.notEqual(payload[1].options, event.payload!.mode.options, 'view options must not expose mutable contract arrays')
console.log('Component interaction schema checks passed: ordered typed parameters, named payloads, optional/nullability, scalar enum identity, no-payload/empty-record distinction and read-only consumption.')
