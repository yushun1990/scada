import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { crc32, inflateSync } from 'node:zlib'
import { checkBoundaryReproducibility } from './boundary-fixtures.mjs'

const require = createRequire(import.meta.url)
const validator = require('gltf-validator')
const validatorVersion = require('gltf-validator/package.json').version
const { fixtures } = await checkBoundaryReproducibility()
const known = {
  'nodes-1000': { nodes: 1000, instances: 999, imageDimension: 0, geometryBytes: 648 },
  'nodes-4096': { nodes: 4096, instances: 4095, imageDimension: 0, geometryBytes: 648 },
  'texture-1024': { nodes: 2, instances: 1, imageDimension: 1024, geometryBytes: 840 },
  'texture-2048': { nodes: 2, instances: 1, imageDimension: 2048, geometryBytes: 840 },
  'texture-4096': { nodes: 2, instances: 1, imageDimension: 4096, geometryBytes: 840 },
}
assert.deepEqual(fixtures.map(({ record }) => record.id), Object.keys(known))

// This is a bounded consistency check of five known authored inputs, not a
// parser/validator that production may use to admit arbitrary models.
function parts(bytes) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67)
  assert.equal(bytes.readUInt32LE(4), 2)
  assert.equal(bytes.readUInt32LE(8), bytes.length)
  const jsonLength = bytes.readUInt32LE(12)
  assert.equal(jsonLength % 4, 0)
  assert.ok(jsonLength <= 2 * 1024 * 1024)
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a)
  const doc = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'))
  const headerOffset = 20 + jsonLength
  assert.equal(bytes.readUInt32LE(headerOffset + 4), 0x004e4942)
  const binLength = bytes.readUInt32LE(headerOffset)
  assert.equal(binLength % 4, 0)
  assert.equal(headerOffset + 8 + binLength, bytes.length)
  assert.equal(doc.asset.version, '2.0')
  assert.equal(doc.buffers.length, 1)
  assert.ok(doc.buffers[0].byteLength <= binLength)
  assert.ok(binLength - doc.buffers[0].byteLength <= 3)
  const bin = bytes.subarray(headerOffset + 8)
  for (const byte of bin.subarray(doc.buffers[0].byteLength)) assert.equal(byte, 0)
  for (const view of doc.bufferViews) {
    assert.equal(view.buffer, 0)
    assert.equal(view.byteOffset % 4, 0)
    assert.ok(view.byteLength > 0 && view.byteOffset + view.byteLength <= doc.buffers[0].byteLength)
  }
  function closed(value, path = []) {
    if (!value || typeof value !== 'object') return
    for (const [key, nested] of Object.entries(value)) {
      assert.ok(!['uri', 'extensions', 'extensionsUsed', 'extensionsRequired'].includes(key))
      if (key === 'extras') {
        assert.ok(path.length === 2 && path[0] === 'nodes' && /^\d+$/.test(path[1]))
        assert.deepEqual(Object.keys(nested), ['scadaId'])
        assert.equal(typeof nested.scadaId, 'string')
        assert.ok(nested.scadaId.length > 0)
      }
      closed(nested, [...path, key])
    }
  }
  closed(doc)
  return { doc, bin, jsonLength }
}

function checkPng(png, dimension) {
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  let offset = 8
  const chunks = []
  while (offset < png.length) {
    const length = png.readUInt32BE(offset)
    assert.ok(offset + length + 12 <= png.length)
    const type = png.subarray(offset + 4, offset + 8).toString('ascii')
    assert.equal(crc32(png.subarray(offset + 4, offset + 8 + length)), png.readUInt32BE(offset + 8 + length))
    chunks.push({ type, bytes: png.subarray(offset + 8, offset + 8 + length) })
    offset += length + 12
  }
  assert.deepEqual(chunks.map((chunk) => chunk.type), ['IHDR', 'IDAT', 'IEND'])
  const header = chunks[0].bytes
  assert.equal(header.readUInt32BE(0), dimension)
  assert.equal(header.readUInt32BE(4), dimension)
  assert.deepEqual([...header.subarray(8)], [1, 0, 0, 0, 0])
  const rowBytes = dimension / 8
  const expectedLength = (rowBytes + 1) * dimension
  const decoded = inflateSync(chunks[1].bytes, { maxOutputLength: expectedLength })
  assert.equal(decoded.length, expectedLength)
  for (let row = 0; row < dimension; row += 1) {
    assert.equal(decoded[row * (rowBytes + 1)], 0)
    for (let column = 0; column < rowBytes; column += 1) {
      const white = (Math.floor(row / 64) + Math.floor(column / 8)) % 2 === 1
      assert.equal(decoded[row * (rowBytes + 1) + column + 1], white ? 255 : 0)
    }
  }
}

const reports = []
for (const { bytes, record } of fixtures) {
  const fixed = known[record.id]
  const { doc, bin, jsonLength } = parts(bytes)
  assert.equal(bytes.length, record.byteLength)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256)
  assert.equal(doc.nodes.length, fixed.nodes)
  assert.deepEqual(doc.scenes[doc.scene].nodes, [0])
  assert.equal(doc.nodes[0].extras.scadaId, record.logicalId)
  assert.deepEqual(doc.nodes[0].children, Array.from({ length: fixed.instances }, (_, index) => index + 1))
  assert.equal(new Set(doc.nodes.map((node) => node.extras.scadaId)).size, fixed.nodes)
  for (const node of doc.nodes.slice(1)) {
    assert.equal(node.mesh, 0)
    assert.equal(node.children, undefined)
  }
  const primary = doc.nodes.find((node) => node.extras.scadaId === record.expected.primaryNodeId)
  assert.ok(primary)
  assert.deepEqual(primary.translation ?? [0, 0, 0], [0, 0, 0])
  assert.equal(doc.meshes.length, 1)
  assert.equal(doc.meshes[0].primitives.length, 1)
  assert.equal(doc.materials.length, 1)
  assert.equal(doc.materials[0].name, record.expected.primaryMaterialId)
  assert.equal(doc.animations, undefined)
  const geometry = doc.meshes[0].primitives[0]
  assert.equal(doc.accessors[geometry.attributes.POSITION].count, 24)
  assert.equal(doc.accessors[geometry.attributes.NORMAL].count, 24)
  assert.equal(doc.accessors[geometry.indices].count, 36)
  assert.equal(doc.accessors[geometry.indices].componentType, 5123)
  assert.equal(record.expected.triangles, fixed.instances * 12)
  assert.equal(record.expected.meshInstances, fixed.instances)
  assert.equal(record.expected.nodes, fixed.nodes)
  assert.equal(record.expected.clips, 0)
  assert.deepEqual(record.expected.clipNames, [])
  const estimates = record.measurement.estimates
  assert.equal(estimates.geometryAttributeAndIndexBytes, fixed.geometryBytes)
  let encodedImageBytes = 0
  if (fixed.imageDimension) {
    assert.equal(doc.images.length, 1)
    assert.equal(doc.textures.length, 1)
    assert.equal(doc.images[0].mimeType, 'image/png')
    assert.equal(doc.images[0].bufferView, 4)
    assert.deepEqual(doc.samplers, [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }])
    const view = doc.bufferViews[4]
    encodedImageBytes = view.byteLength
    assert.equal(view.byteOffset, fixed.geometryBytes)
    checkPng(bin.subarray(view.byteOffset, view.byteOffset + view.byteLength), fixed.imageDimension)
    assert.equal(record.expected.imageWidth, fixed.imageDimension)
    assert.equal(record.expected.imageHeight, fixed.imageDimension)
    assert.equal(record.expected.imageBitDepth, 1)
    assert.equal(record.expected.imageColorType, 0)
    assert.equal(record.expected.mipLevels, Math.log2(fixed.imageDimension) + 1)
    assert.equal(record.expected.generateMipmaps, true)
    assert.equal(record.measurement.encodedImageBytes, encodedImageBytes)
    const baseBytes = fixed.imageDimension ** 2 * 4
    assert.equal(estimates.decodedImageRgba8Bytes, baseBytes)
    assert.equal(estimates.textureBaseLevelRgba8Bytes, baseBytes)
    assert.equal(estimates.textureMipChainRgba8Bytes, (baseBytes * 4 - 4) / 3)
    assert.ok(encodedImageBytes <= 8 * 1024 * 1024)
    assert.ok(baseBytes <= 64 * 1024 * 1024)
    assert.ok(estimates.textureMipChainRgba8Bytes <= 192 * 1024 * 1024)
  } else {
    assert.equal(doc.images, undefined)
    assert.equal(doc.textures, undefined)
    assert.equal(bin.length, fixed.geometryBytes)
    assert.equal(estimates.decodedImageRgba8Bytes, 0)
    assert.equal(estimates.textureMipChainRgba8Bytes, 0)
  }
  assert.equal(record.expected.images, fixed.imageDimension ? 1 : 0)
  assert.equal(record.expected.textures, fixed.imageDimension ? 1 : 0)
  let externalResourceAttempts = 0
  const conformance = await validator.validateBytes(new Uint8Array(bytes), {
    uri: record.file,
    maxIssues: 100,
    externalResourceFunction: async () => { externalResourceAttempts += 1; throw new Error('Fixed boundary fixture must not resolve external resources') },
  })
  assert.equal(externalResourceAttempts, 0)
  assert.equal(conformance.issues.numErrors, 0, JSON.stringify(conformance.issues))
  assert.equal(conformance.issues.numWarnings, 0, JSON.stringify(conformance.issues))
  reports.push({
    id: record.id, byteLength: bytes.length, sha256: record.sha256, jsonChunkBytes: jsonLength,
    counts: { nodes: fixed.nodes, meshInstances: fixed.instances, uniqueMeshes: 1, uniqueMaterials: 1, triangles: record.expected.triangles, textures: record.expected.textures, images: record.expected.images },
    image: fixed.imageDimension ? { width: fixed.imageDimension, height: fixed.imageDimension, bitDepth: 1, colorType: 0, encodedBytes: encodedImageBytes, mipLevels: record.expected.mipLevels } : null,
    estimates,
    conformance: { validator: `gltf-validator@${validatorVersion}`, errors: conformance.issues.numErrors, warnings: conformance.issues.numWarnings, infos: conformance.issues.numInfos, messages: conformance.issues.messages, externalResourceAttempts },
  })
}
const sourceHashes = {}
for (const relative of ['./boundary-fixtures.mjs', './check-boundary-fixtures.mjs', '../src/boundary-fixtures.generated.json']) {
  sourceHashes[relative] = createHash('sha256').update(await readFile(new URL(relative, import.meta.url))).digest('hex')
}
console.log(JSON.stringify({
  scope: 'Five fixed authored M10A boundary inputs; no production admission, hostile corpus, native memory, hardware budget or gate acceptance.',
  reproducible: true,
  fixtureCount: reports.length,
  sourceHashes,
  fixtures: reports,
}, null, 2))
