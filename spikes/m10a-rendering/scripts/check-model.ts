import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { assertComponentDefinition } from '../../../src/component-system/validation'
import {
  effectiveSnapshot, fixtureDefinition, setFixtureProperties, sourceValues,
} from '../src/semanticSnapshot'
import { finishGesture, verifyFixtureBytes } from '../src/experimentModel'
import type { FixtureName, Transform } from '../src/types'
import fixtures from '../src/fixtures.generated.json'

// Import the actual spike host, which itself imports the production resolver
// and RuntimeValueStore. No renderer, registry substitute or copied algorithm.
assertComponentDefinition(fixtureDefinition)
sourceValues.clear()
assert.deepEqual(effectiveSnapshot.get(), { visible: true, color: '#35c5b1', playing: false })
let referenceSnapshot: unknown
let adapterSnapshot: unknown
const stopReference = effectiveSnapshot.subscribe(() => { referenceSnapshot = effectiveSnapshot.get() })
const stopAdapter = effectiveSnapshot.subscribe(() => { adapterSnapshot = effectiveSnapshot.get() })
setFixtureProperties({ visible: false, color: '#ff0000', playing: true })
assert.strictEqual(referenceSnapshot, adapterSnapshot, 'Both presentations must consume the same settled snapshot object')
assert.strictEqual(adapterSnapshot, effectiveSnapshot.get())
assert.equal(Object.isFrozen(adapterSnapshot), true)
assert.deepEqual(adapterSnapshot, { visible: false, color: '#ff0000', playing: true })
const beforeInvalid = effectiveSnapshot.get()
setFixtureProperties({ color: 'url(https://example.invalid/image)', visible: 'bad', arbitrary: true })
assert.strictEqual(effectiveSnapshot.get(), beforeInvalid, 'Invalid controls do not update telemetry')
sourceValues.set('fixture.visible', 'not-a-boolean')
assert.equal(effectiveSnapshot.get().visible, true, 'Production resolver rejects invalid external values and restores fallback')
assert.equal(fixtureDefinition.properties.visible.defaultValue, true)
sourceValues.clear()
assert.deepEqual(effectiveSnapshot.get(), { visible: true, color: '#35c5b1', playing: false })
stopReference()
stopAdapter()
console.log('PASS: actual spike host shares one frozen production-resolved snapshot; invalid telemetry and reset preserve defaults.')

const original: Transform = { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] }
assert.equal(finishGesture(original, structuredClone(original)).kind, 'unchanged')
for (const after of [
  { ...original, position: [1, 0, 0] },
  { ...original, quaternion: [0, 0, Math.SQRT1_2, Math.SQRT1_2] },
  { ...original, scale: [2, 1, 1] },
]) {
  const result = finishGesture(original, after)
  assert.equal(result.kind, 'commit')
  if (result.kind !== 'commit') throw new Error('Expected one immutable command snapshot')
  assert.deepEqual(result.command.before, original)
  assert.deepEqual(result.command.after, after)
  after.position = [99, 0, 0]
  assert.notDeepEqual(result.command.after.position, after.position)
}
for (const invalid of [
  { ...original, position: [Infinity, 0, 0] },
  { ...original, scale: [0, 1, 1] },
  { ...original, scale: [-1, 1, 1] },
  { ...original, quaternion: [0, 0, 0, 0] },
]) assert.equal(finishGesture(original, invalid).kind, 'invalid')
console.log('PASS: actual gesture helper emits one copied command, no command for no-op, and rejects invalid transforms.')

for (const name of Object.keys(fixtures) as FixtureName[]) {
  const bytes = new Uint8Array(await readFile(new URL(`../public/fixtures/${fixtures[name].file}`, import.meta.url)))
  assert.equal((await verifyFixtureBytes(name, bytes.buffer)).digest, fixtures[name].sha256)
  const callerOwned = bytes.slice()
  const inFlight = verifyFixtureBytes(name, callerOwned.buffer)
  callerOwned[callerOwned.length - 1] ^= 1
  const admitted = await inFlight
  assert.equal(admitted.digest, fixtures[name].sha256)
  assert.deepEqual(new Uint8Array(admitted.bytes), bytes, 'The parsed snapshot must be the same bytes that were verified')
  assert.notStrictEqual(admitted.bytes, callerOwned.buffer)
  const changed = bytes.slice(); changed[changed.length - 1] ^= 1
  await assert.rejects(verifyFixtureBytes(name, changed.buffer), /FIXTURE_DIGEST_MISMATCH/)
  await assert.rejects(verifyFixtureBytes(name, bytes.slice(1).buffer), /FIXTURE_DIGEST_MISMATCH/)
}
await assert.rejects(verifyFixtureBytes('toString' as FixtureName, new ArrayBuffer(0)), /UNKNOWN_INTERNAL_FIXTURE/)
console.log('PASS: actual fixed-fixture guard admits all three exact byte sequences and rejects corruption, truncation and unknown identities before loading.')
