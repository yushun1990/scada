import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { crc32, inflateSync } from 'node:zlib'
import { checkReproducibility } from './fixtures.mjs'

// These checks describe only our three known fixture files. Independent glTF
// conformance is checked below by the pinned Khronos validator. Neither is a
// production resource admission algorithm or security acceptance result.
const require = createRequire(import.meta.url)
const validator = require('gltf-validator')
const validatorPackage = require('gltf-validator/package.json')
const { fixtures } = await checkReproducibility()
const reports = []

function knownGlb(bytes) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67)
  assert.equal(bytes.readUInt32LE(4), 2)
  assert.equal(bytes.readUInt32LE(8), bytes.length)
  const jsonLength = bytes.readUInt32LE(12)
  assert.equal(jsonLength % 4, 0)
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a)
  const doc = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'))
  const binOffset = 20 + jsonLength
  const binLength = bytes.readUInt32LE(binOffset)
  assert.equal(binLength % 4, 0)
  assert.equal(bytes.readUInt32LE(binOffset + 4), 0x004e4942)
  assert.equal(binOffset + 8 + binLength, bytes.length)
  const bin = bytes.subarray(binOffset + 8)
  assert.equal(doc.asset.version, '2.0')
  assert.equal(doc.buffers.length, 1)
  assert.ok(doc.buffers[0].byteLength <= bin.length)
  assert.ok(bin.length - doc.buffers[0].byteLength <= 3)
  for (const byte of bin.subarray(doc.buffers[0].byteLength)) assert.equal(byte, 0)
  function assertClosed(value, path = []) {
    if (!value || typeof value !== 'object') return
    for (const [key, nested] of Object.entries(value)) {
      assert.ok(!['uri', 'extensions', 'extensionsUsed', 'extensionsRequired'].includes(key), `Unexpected ${key} in fixed fixture`)
      if (key === 'extras') {
        assert.ok(path.length === 2 && path[0] === 'nodes' && /^\d+$/.test(path[1]), 'Fixed fixture extras are permitted only on nodes')
        assert.deepEqual(Object.keys(nested), ['scadaId'])
        assert.equal(typeof nested.scadaId, 'string')
        assert.ok(nested.scadaId.length > 0)
      }
      assertClosed(nested, [...path, key])
    }
  }
  assertClosed(doc)
  for (const view of doc.bufferViews) {
    assert.equal(view.buffer, 0)
    assert.equal((view.byteOffset ?? 0) % 4, 0)
    assert.ok(view.byteLength > 0)
    assert.ok((view.byteOffset ?? 0) + view.byteLength <= doc.buffers[0].byteLength)
  }
  function accessor(index) {
    const value = doc.accessors[index]
    assert.ok(value)
    const view = doc.bufferViews[value.bufferView]
    assert.ok(view)
    const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[value.type]
    const width = { 5123: 2, 5126: 4 }[value.componentType]
    assert.ok(components && width)
    const stride = components * width
    assert.equal(view.byteStride, undefined)
    assert.ok((value.byteOffset ?? 0) + value.count * stride <= view.byteLength)
    const offset = (view.byteOffset ?? 0) + (value.byteOffset ?? 0)
    assert.equal(offset % width, 0)
    return Array.from({ length: value.count }, (_, row) => Array.from({ length: components }, (_, column) => {
      const at = offset + row * stride + column * width
      const result = width === 4 ? bin.readFloatLE(at) : bin.readUInt16LE(at)
      assert.ok(Number.isFinite(result))
      return result
    }))
  }
  doc.accessors.forEach((_, index) => accessor(index))
  return { doc, bin, accessor }
}

function checkGeometry(doc, accessor) {
  for (const mesh of doc.meshes) for (const primitive of mesh.primitives) {
    assert.equal(primitive.mode ?? 4, 4)
    const positions = accessor(primitive.attributes.POSITION)
    const normals = accessor(primitive.attributes.NORMAL)
    assert.equal(normals.length, positions.length)
    for (const normal of normals) assert.ok(Math.abs(Math.hypot(...normal) - 1) < 1e-6)
    const bounds = doc.accessors[primitive.attributes.POSITION]
    for (let axis = 0; axis < 3; axis += 1) {
      assert.equal(Math.min(...positions.map((position) => position[axis])), bounds.min[axis])
      assert.equal(Math.max(...positions.map((position) => position[axis])), bounds.max[axis])
    }
    const indices = accessor(primitive.indices).flat()
    assert.equal(indices.length % 3, 0)
    for (const index of indices) assert.ok(index >= 0 && index < positions.length)
    for (let triangle = 0; triangle < indices.length; triangle += 3) {
      const [a, b, c] = indices.slice(triangle, triangle + 3).map((index) => positions[index])
      const u = b.map((value, axis) => value - a[axis])
      const v = c.map((value, axis) => value - a[axis])
      const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
      const normal = normals[indices[triangle]]
      assert.ok(cross.reduce((sum, value, axis) => sum + value * normal[axis], 0) > 0, 'Counterclockwise triangle must agree with normal')
    }
    if (primitive.attributes.TEXCOORD_0 !== undefined) {
      const uv = accessor(primitive.attributes.TEXCOORD_0)
      assert.equal(uv.length, positions.length)
      for (const coordinate of uv.flat()) assert.ok(coordinate >= 0 && coordinate <= 1)
    }
  }
}

function checkPng(bytes) {
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  let offset = 8
  const chunks = []
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset)
    const type = bytes.subarray(offset + 4, offset + 8).toString('ascii')
    const payload = bytes.subarray(offset + 8, offset + 8 + length)
    assert.ok(offset + 12 + length <= bytes.length)
    // Independent zlib CRC oracle, separate from the generator's bitwise CRC.
    assert.equal(crc32(bytes.subarray(offset + 4, offset + 8 + length)), bytes.readUInt32BE(offset + 8 + length))
    chunks.push({ type, payload })
    offset += length + 12
  }
  assert.deepEqual(chunks.map((chunk) => chunk.type), ['IHDR', 'IDAT', 'IEND'])
  const header = chunks[0].payload
  assert.equal(header.readUInt32BE(0), 2)
  assert.equal(header.readUInt32BE(4), 2)
  assert.deepEqual([...header.subarray(8)], [8, 6, 0, 0, 0])
  const pixels = inflateSync(chunks[1].payload)
  assert.deepEqual([...pixels], [0, 37, 99, 235, 255, 219, 234, 254, 255, 0, 219, 234, 254, 255, 37, 99, 235, 255])
}

for (const { bytes, record } of fixtures) {
  assert.equal(bytes.length, record.byteLength)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256)
  const { doc, bin, accessor } = knownGlb(bytes)
  const expected = record.expected
  const counts = {
    nodes: doc.nodes.length,
    meshInstances: doc.nodes.filter((node) => node.mesh !== undefined).length,
    meshes: doc.meshes.length,
    primitives: doc.meshes.reduce((sum, mesh) => sum + mesh.primitives.length, 0),
    materials: doc.materials.length,
    textures: (doc.textures ?? []).length,
    images: (doc.images ?? []).length,
    clips: (doc.animations ?? []).length,
    triangles: doc.nodes.reduce((sum, node) => sum + (node.mesh === undefined ? 0 : doc.meshes[node.mesh].primitives.reduce((total, primitive) => total + doc.accessors[primitive.indices].count / 3, 0)), 0),
  }
  for (const [key, count] of Object.entries(counts)) assert.equal(count, expected[key], `${record.id} ${key}`)
  assert.deepEqual(doc.scenes[doc.scene].nodes, [0])
  assert.equal(doc.nodes[0].extras.scadaId, record.logicalId)
  const ids = doc.nodes.map((node) => node.extras.scadaId)
  assert.equal(new Set(ids).size, ids.length)
  const primary = doc.nodes.find((node) => node.extras.scadaId === expected.primaryNodeId)
  assert.ok(primary)
  assert.deepEqual(primary.translation ?? [0, 0, 0], [0, 0, 0])
  assert.equal(doc.materials[0].name, expected.primaryMaterialId)
  assert.deepEqual((doc.animations ?? []).map((animation) => animation.name), expected.clipNames)
  assert.deepEqual(doc.nodes[0].children, Array.from({ length: expected.meshInstances }, (_, index) => index + 1))
  for (const child of doc.nodes.slice(1)) assert.equal(child.children, undefined)
  checkGeometry(doc, accessor)
  for (const image of doc.images ?? []) {
    assert.equal(image.mimeType, 'image/png')
    const view = doc.bufferViews[image.bufferView]
    checkPng(bin.subarray(view.byteOffset, view.byteOffset + view.byteLength))
  }
  for (const animation of doc.animations ?? []) {
    assert.deepEqual(animation.channels, [{ sampler: 0, target: { node: 1, path: 'rotation' } }])
    assert.equal(animation.samplers[0].interpolation, 'LINEAR')
    assert.deepEqual(accessor(animation.samplers[0].input).flat(), [0, 1, expected.animationSeconds])
    const rotations = accessor(animation.samplers[0].output)
    assert.equal(rotations.length, 3)
    for (const rotation of rotations) assert.ok(Math.abs(Math.hypot(...rotation) - 1) < 1e-6)
  }
  let externalResourceAttempts = 0
  const conformance = await validator.validateBytes(new Uint8Array(bytes), {
    uri: record.file,
    maxIssues: 100,
    externalResourceFunction: async () => {
      externalResourceAttempts += 1
      throw new Error('Fixed fixture must not request an external resource')
    },
  })
  assert.equal(externalResourceAttempts, 0)
  assert.equal(conformance.issues.numErrors, 0, JSON.stringify(conformance.issues))
  assert.equal(conformance.issues.numWarnings, 0, JSON.stringify(conformance.issues))
  reports.push({
    id: record.id,
    byteLength: bytes.length,
    sha256: record.sha256,
    counts,
    logicalId: record.logicalId,
    primaryNodeId: expected.primaryNodeId,
    conformance: { validator: `gltf-validator@${validatorPackage.version}`, errors: conformance.issues.numErrors, warnings: conformance.issues.numWarnings, infos: conformance.issues.numInfos, messages: conformance.issues.messages, externalResourceAttempts },
  })
}

console.log(JSON.stringify({ scope: 'Fixed self-authored M10A spike fixtures only; not production admission or security acceptance.', reproducible: true, fixtureCount: reports.length, fixtures: reports }, null, 2))
