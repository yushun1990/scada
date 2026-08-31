import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { evaluateVisualAnimations } from '../src/component-system/animations'
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
import { replaceStudioUserComponentPackages } from '../src/features/component-library/runtime-activation'
import { MemoryComponentRepository } from '../src/storage/memory-repositories'

const packageFixtures = [
  {
    filename: 'process-valve.scada-component.json',
    type: 'starter.process-valve',
  },
  {
    filename: 'running-motor.scada-component.json',
    type: 'starter.running-motor',
  },
  {
    filename: 'signal-quality.scada-component.json',
    type: 'starter.signal-quality',
  },
] as const

function loadPackage(filename: string) {
  const document = readFileSync(
    resolve('public/component-packages', filename),
    'utf8',
  )
  const componentPackage = parseDistributableComponentPackageDocument(document)
  assert.ok(componentPackage, `${filename} must parse through the shared M7A codec`)
  return { document, componentPackage }
}

function layerById(componentPackage: DistributableComponentPackage, layerId: string) {
  const layer = componentPackage.visual.layers.find((candidate) => candidate.id === layerId)
  assert.ok(layer, `missing layer ${layerId} in ${componentPackage.definition.type}`)
  return layer
}

const loaded = packageFixtures.map((fixture) => ({
  ...fixture,
  ...loadPackage(fixture.filename),
}))

assert.deepEqual(
  loaded.map(({ componentPackage }) => componentPackage.definition.type),
  packageFixtures.map(({ type }) => type),
  'starter package types are stable and intentionally ordered',
)
assert.equal(
  new Set(loaded.map(({ componentPackage }) => componentPackage.definition.type)).size,
  loaded.length,
  'starter package component types must be unique',
)

for (const { filename, componentPackage } of loaded) {
  assert.equal(componentPackage.visual.mode, 'composite')
  assert.deepEqual(
    componentPackage.definition.actions,
    {},
    `${filename} must remain inside the accepted declarative user-runtime boundary`,
  )
  assert.deepEqual(
    componentPackage.definition.events,
    {},
    `${filename} must remain inside the accepted declarative user-runtime boundary`,
  )

  const canonical = serializeDistributableComponentPackage(componentPackage)
  const reparsed = parseDistributableComponentPackageDocument(canonical)
  assert.deepEqual(
    reparsed,
    componentPackage,
    `${filename} must round-trip through canonical distributable JSON`,
  )
  assert.equal(
    serializeDistributableComponentPackage(reparsed!),
    canonical,
    `${filename} canonical serialization must be deterministic`,
  )
}

const entries: ComponentLibraryEntry[] = loaded.map(({ componentPackage }, index) =>
  distributableComponentPackageToLibraryEntry(componentPackage, {
    id: `starter-import-${index + 1}`,
    updatedAt: `2026-08-31T06:0${index}:00.000Z`,
  }),
)

const repository = new MemoryComponentRepository()
for (const entry of entries) {
  await repository.put({
    id: entry.id,
    document: serializeComponentLibraryDocument(entry),
    updatedAt: entry.updatedAt,
  })
}

const persisted = await repository.list()
assert.equal(persisted.length, entries.length)
const hydrated = persisted.map((record) => {
  const entry = parseComponentLibraryDocument(record.document)
  assert.ok(entry, `persisted starter package ${record.id} must hydrate`)
  return entry
})
assert.deepEqual(
  hydrated.map((entry) => entry.definition.type).sort(),
  packageFixtures.map(({ type }) => type).sort(),
  'starter packages survive the local repository document boundary',
)

const activation = replaceStudioUserComponentPackages(hydrated)
assert.deepEqual(
  activation.activeTypes,
  packageFixtures.map(({ type }) => type).sort(),
  'all starter packages activate through the normal generic user-component registry path',
)
assert.deepEqual(activation.diagnostics, [])

const valve = loaded.find(({ type }) => type === 'starter.process-valve')!.componentPackage
const valveOpen = resolveComponentVisualRules(valve.visual, { state: 'open' })
const valveOpenBody = layerById({ ...valve, visual: valveOpen }, 'body')
const valveOpenHandle = layerById({ ...valve, visual: valveOpen }, 'handle')
assert.equal(valveOpenBody.kind, 'vector')
assert.equal(valveOpenBody.style?.fill, '#22c55e')
assert.equal(valveOpenHandle.transform.rotation, 90)

const valveFault = resolveComponentVisualRules(valve.visual, { state: 'fault' })
const valveFaultBody = layerById({ ...valve, visual: valveFault }, 'body')
assert.equal(valveFaultBody.kind, 'vector')
assert.equal(valveFaultBody.style?.fill, '#ef4444')
assert.equal(
  evaluateVisualAnimations(valveFault, { state: 'fault' }, 600).body?.visible,
  false,
  'fault valve uses the generic property-gated blink animation',
)

const motor = loaded.find(({ type }) => type === 'starter.running-motor')!.componentPackage
const motorRunning = resolveComponentVisualRules(motor.visual, {
  running: true,
  fault: false,
})
const motorHousing = layerById({ ...motor, visual: motorRunning }, 'housing')
assert.equal(motorHousing.kind, 'vector')
assert.equal(motorHousing.style?.fill, '#16a34a')
assert.equal(
  evaluateVisualAnimations(motorRunning, { running: true, fault: false }, 500).rotor?.['transform.rotation'],
  180,
  'running motor uses the generic property-gated spin animation',
)
const motorFault = resolveComponentVisualRules(motor.visual, {
  running: false,
  fault: true,
})
const motorFaultHousing = layerById({ ...motor, visual: motorFault }, 'housing')
assert.equal(motorFaultHousing.kind, 'vector')
assert.equal(motorFaultHousing.style?.fill, '#dc2626')
assert.equal(
  evaluateVisualAnimations(motorFault, { running: false, fault: true }, 500).housing?.visible,
  false,
  'fault motor uses the generic blink gate without component-specific code',
)

const signal = loaded.find(({ type }) => type === 'starter.signal-quality')!.componentPackage
const weakSignal = resolveComponentVisualRules(signal.visual, { quality: 10 })
assert.equal(layerById({ ...signal, visual: weakSignal }, 'bar-2').visible, false)
assert.equal(layerById({ ...signal, visual: weakSignal }, 'bar-3').visible, false)
assert.equal(layerById({ ...signal, visual: weakSignal }, 'bar-4').visible, false)

const strongSignal = resolveComponentVisualRules(signal.visual, { quality: 80 })
assert.equal(layerById({ ...signal, visual: strongSignal }, 'bar-2').visible, true)
assert.equal(layerById({ ...signal, visual: strongSignal }, 'bar-3').visible, true)
assert.equal(layerById({ ...signal, visual: strongSignal }, 'bar-4').visible, true)

assert.equal(valve.definition.anchors.length, 2)
assert.equal(motor.definition.anchors.length, 2)
assert.equal(signal.definition.properties.quality.kind, 'number')
assert.equal(valve.definition.properties.state.kind, 'select')
assert.equal(motor.definition.properties.running.kind, 'boolean')

replaceStudioUserComponentPackages([])

console.log(
  'Reusable starter component checks passed: three portable packages parse and round-trip through the shared M7A codec, persist/hydrate through the repository document boundary, activate through the generic user-component registry, and exercise select/boolean/number Properties, Anchors, visual rules, spin and blink behavior without component-specific runtime code.',
)
