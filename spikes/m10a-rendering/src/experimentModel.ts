import { fixtures } from './fixtureCatalog'
import type { FixtureName, Transform } from './types'

export function finishGesture(before: Transform, after: Transform) {
  const valid = before.position.length === 3 && before.quaternion.length === 4 && before.scale.length === 3
    && after.position.length === 3 && after.quaternion.length === 4 && after.scale.length === 3
    && [...after.position, ...after.quaternion, ...after.scale].every(Number.isFinite)
    && after.scale.every((value) => value > 0)
    && Math.abs(Math.hypot(...after.quaternion) - 1) < 1e-5
  if (!valid) return { kind: 'invalid' as const }
  if (JSON.stringify(before) === JSON.stringify(after)) return { kind: 'unchanged' as const }
  return { kind: 'commit' as const, command: structuredClone({ before, after }) }
}

// Exact trusted fixture admission only. This does not validate arbitrary GLB.
export async function verifyFixtureBytes(name: FixtureName, bytes: ArrayBuffer) {
  if (!Object.hasOwn(fixtures, name)) throw new Error('UNKNOWN_INTERNAL_FIXTURE')
  const expected = fixtures[name]
  if (bytes.byteLength !== expected.byteLength) throw new Error('FIXTURE_DIGEST_MISMATCH')
  const verifiedBytes = bytes.slice(0)
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', verifiedBytes)), (value) => value.toString(16).padStart(2, '0')).join('')
  if (digest !== expected.sha256) throw new Error('FIXTURE_DIGEST_MISMATCH')
  return { digest, bytes: verifiedBytes }
}
