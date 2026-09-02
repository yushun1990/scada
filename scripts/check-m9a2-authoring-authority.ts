import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pumpComponentDefinition } from '../src/component-system/builtins/pump-contract'

const attributeEditor = readFileSync(
  'src/features/component-library/ComponentAttributeContractEditor.tsx',
  'utf8',
)
const componentEditor = readFileSync(
  'src/features/component-library/ComponentEditorPage.tsx',
  'utf8',
)
const scadaInspector = readFileSync(
  'src/features/scada-editor/ComponentPropertiesInspector.tsx',
  'utf8',
)
const scadaEditor = readFileSync(
  'src/features/scada-editor/ScadaEditorPage.tsx',
  'utf8',
)

assert.ok(pumpComponentDefinition.attributes.runningColor)
assert.equal(pumpComponentDefinition.properties.runningColor, undefined)
assert.ok(pumpComponentDefinition.properties.state)
assert.equal(pumpComponentDefinition.properties.state.bindable, true)

assert.match(attributeEditor, /definition\.attributes/)
assert.doesNotMatch(attributeEditor, /bindable/)
assert.match(componentEditor, /公开配置 · Attributes/)
assert.match(componentEditor, /运行属性 · Properties/)
assert.match(componentEditor, /<ComponentAttributeContractEditor/)
assert.match(componentEditor, /<ComponentPropertyContractEditor/)

assert.match(scadaInspector, /组件配置 · Attributes/)
assert.match(scadaInspector, /运行属性 · Properties/)
assert.match(scadaInspector, /Object\.entries\(definition\.attributes\)/)
assert.match(scadaInspector, /Object\.entries\(definition\.properties\)/)
assert.match(scadaInspector, /property\.bindable/)
assert.doesNotMatch(scadaInspector, /attribute\.bindable/)

assert.match(scadaEditor, /attributes:\s*\{\s*\.\.\.node\.attributes/)
assert.match(scadaEditor, /propertyFallbacks:\s*\{\s*\.\.\.node\.propertyFallbacks/)
assert.match(scadaEditor, /definition\.properties\[key\]\?\.bindable/)
assert.doesNotMatch(scadaEditor, /definition\.attributes\[key\]\?\.bindable/)

console.log(
  'M9A2 authoring authority checks passed: Pump presentation configuration is an Attribute while semantic state is a bindable Property, Component Workbench exposes separate Attribute/Property contract surfaces, SCADA Inspector separates authored configuration from runtime Properties, and binding authority remains Property-only.',
)
