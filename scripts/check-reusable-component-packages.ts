import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { evaluateVisualAnimations } from '../src/component-system/animations'
import { createCompositeComponentRegistration } from '../src/component-system/composite-registration'
import { ComponentRegistry } from '../src/component-system/registry'
import { resolveComponentVisualRules } from '../src/component-system/visualRules'
import {
  parseComponentLibraryDocument,
  serializeComponentLibraryDocument,
  type ComponentLibraryEntry,
} from '../src/features/component-library/component-document'
import {
  distributableComponentPackageToLibraryEntry,
  parseDistributableComponentPackageDocument,
  serializeDistributableComponentPackage,
  type DistributableComponentPackage,
} from '../src/features/component-library/distributable-component-package'
import { createUserComponentActivationController } from '../src/features/component-library/runtime-activation-core'
import { MemoryComponentRepository } from '../src/storage/memory-repositories'

const packageFixtures = [
  { filename: 'process-valve.scada-component.json', type: 'starter.process-valve' },
  { filename: 'running-motor.scada-component.json', type: 'starter.running-motor' },
  { filename: 'signal-quality.scada-component.json', type: 'starter.signal-quality' },
] as const

function loadPackage(filename: string) {
  const document = readFileSync(resolve('public/component-packages', filename), 'utf8')
  const componentPackage = parseDistributableComponentPackageDocument(document)
  assert.ok(componentPackage, `${filename} must parse through the shared M7A codec`)
  return { document, componentPackage }
}

function layerById(componentPackage: DistributableComponentPackage, layerId: string) {
  const layer = componentPackage.visual.layers.find((candidate) => candidate.id === layerId)
  assert.ok(layer, `missing layer ${layerId} in ${componentPackage.definition.type}`)
  return layer
}

const loaded = packageFixtures.map((fixture) => ({ ...fixture, ...loadPackage(fixture.filename) }))
assert.deepEqual(
  loaded.map(({ componentPackage }) => componentPackage.definition.type),
  packageFixtures.map(({ type }) => type),
  'starter package types are stable and intentionally ordered',
)
assert.equal(new Set(loaded.map(({ componentPackage }) => componentPackage.definition.type)).size, loaded.length)

for (const { filename, componentPackage } of loaded) {
  assert.equal(componentPackage.visual.mode, 'composite')
  assert.deepEqual(componentPackage.definition.actions, {}, `${filename} must remain declarative`)
  assert.deepEqual(componentPackage.definition.events, {}, `${filename} must remain declarative`)
  const canonical = serializeDistributableComponentPackage(componentPackage)
  const reparsed = parseDistributableComponentPackageDocument(canonical)
  assert.deepEqual(reparsed, componentPackage)
  assert.equal(serializeDistributableComponentPackage(reparsed!), canonical)
}

const entries: ComponentLibraryEntry[] = loaded.map(({ componentPackage }, index) =>
  distributableComponentPackageToLibraryEntry(componentPackage, {
    id: `starter-import-${index + 1}`,
    updatedAt: `2026-08-31T06:0${index}:00.000Z`,
  }),
)
const repository = new MemoryComponentRepository()
for (const entry of entries) {
  await repository.put({ id: entry.id, document: serializeComponentLibraryDocument(entry), updatedAt: entry.updatedAt })
}
const persisted = await repository.list()
assert.equal(persisted.length, entries.length)
const hydrated = persisted.map((record) => {
  const entry = parseComponentLibraryDocument(record.document)
  assert.ok(entry, `persisted starter package ${record.id} must hydrate`)
  return entry
})

const registry = new ComponentRegistry()
const activationController = createUserComponentActivationController({
  registry,
  builtInRegistrations: [],
  createRegistration: (entry) => createCompositeComponentRegistration(entry.definition, entry.visual),
})
const activation = activationController.replace(hydrated)
assert.deepEqual(activation.activeTypes, packageFixtures.map(({ type }) => type).sort())
assert.deepEqual(activation.diagnostics, [])

const valve = loaded.find(({ type }) => type === 'starter.process-valve')!.componentPackage
assert.equal(valve.definition.attributes.openColor?.defaultValue, '#22c55e')
const valveOpen = resolveComponentVisualRules(valve.visual, {
  attributes: { closedColor: '#64748b', openColor: '#7c3aed', faultColor: '#ef4444' },
  properties: { state: 'open' },
})
const valveOpenBody = layerById({ ...valve, visual: valveOpen }, 'body')
const valveOpenHandle = layerById({ ...valve, visual: valveOpen }, 'handle')
assert.equal(valveOpenBody.kind, 'vector')
assert.equal(valveOpenBody.style?.fill, '#7c3aed')
assert.equal(valveOpenHandle.transform.rotation, 90)

const valveFault = resolveComponentVisualRules(valve.visual, {
  attributes: { closedColor: '#64748b', openColor: '#22c55e', faultColor: '#f97316' },
  properties: { state: 'fault' },
})
const valveFaultBody = layerById({ ...valve, visual: valveFault }, 'body')
assert.equal(valveFaultBody.kind, 'vector')
assert.equal(valveFaultBody.style?.fill, '#f97316')
assert.equal(evaluateVisualAnimations(valveFault, { state: 'fault' }, 600).body?.visible, false)

const motor = loaded.find(({ type }) => type === 'starter.running-motor')!.componentPackage
const motorRunning = resolveComponentVisualRules(motor.visual, {
  attributes: {},
  properties: { running: true, fault: false },
})
const motorHousing = layerById({ ...motor, visual: motorRunning }, 'housing')
assert.equal(motorHousing.kind, 'vector')
assert.equal(motorHousing.style?.fill, '#16a34a')
assert.equal(evaluateVisualAnimations(motorRunning, { running: true, fault: false }, 500).rotor?.['transform.rotation'], 180)
const motorFault = resolveComponentVisualRules(motor.visual, {
  attributes: {},
  properties: { running: false, fault: true },
})
const motorFaultHousing = layerById({ ...motor, visual: motorFault }, 'housing')
assert.equal(motorFaultHousing.kind, 'vector')
assert.equal(motorFaultHousing.style?.fill, '#dc2626')
assert.equal(evaluateVisualAnimations(motorFault, { running: false, fault: true }, 500).housing?.visible, false)

const signal = loaded.find(({ type }) => type === 'starter.signal-quality')!.componentPackage
const weakSignal = resolveComponentVisualRules(signal.visual, { attributes: {}, properties: { quality: 10 } })
assert.equal(layerById({ ...signal, visual: weakSignal }, 'bar-2').visible, false)
assert.equal(layerById({ ...signal, visual: weakSignal }, 'bar-3').visible, false)
assert.equal(layerById({ ...signal, visual: weakSignal }, 'bar-4').visible, false)
const strongSignal = resolveComponentVisualRules(signal.visual, { attributes: {}, properties: { quality: 80 } })
assert.equal(layerById({ ...signal, visual: strongSignal }, 'bar-2').visible, true)
assert.equal(layerById({ ...signal, visual: strongSignal }, 'bar-3').visible, true)
assert.equal(layerById({ ...signal, visual: strongSignal }, 'bar-4').visible, true)

assert.equal(valve.definition.anchors.length, 2)
assert.equal(motor.definition.anchors.length, 2)
assert.equal(signal.definition.properties.quality.kind, 'number')
assert.equal(valve.definition.properties.state.kind, 'select')
assert.equal(motor.definition.properties.running.kind, 'boolean')
activationController.replace([])
for (const { type } of packageFixtures) assert.equal(registry.has(type), false)

console.log(
  'Reusable starter component checks passed: portable packages round-trip and activate generically, while the process valve proves semantic Properties can select authored Attribute-backed presentation colors without component-specific runtime code.',
)
