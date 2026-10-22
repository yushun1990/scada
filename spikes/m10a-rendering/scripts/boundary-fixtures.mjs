import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { deflateSync } from 'node:zlib'
import { buildFixtureSet } from './fixtures.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = resolve(root, 'src/boundary-fixtures.generated.json')
const outputDirectory = resolve(root, 'public/boundary-fixtures')
const generator = 'm10a-self-authored-boundary-glb/1'
const profile = 'docs/architecture/adr-m10a-glb-resource-profile.md'
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')

// Only these five recipes exist. There is deliberately no user-selected size,
// arbitrary input, over-ceiling fixture or production resource validation API.
const levels = Object.freeze({ nodes: Object.freeze([1000, 4096]), texture: Object.freeze([1024, 2048, 4096]) })

function originalParts(bytes) {
  const jsonLength = bytes.readUInt32LE(12)
  const doc = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'))
  return { doc, bin: bytes.subarray(28 + jsonLength, 28 + jsonLength + doc.buffers[0].byteLength) }
}

function glb(doc, binary) {
  doc.buffers = [{ byteLength: binary.length }]
  const rawJson = Buffer.from(JSON.stringify(doc))
  const json = Buffer.concat([rawJson, Buffer.alloc((4 - rawJson.length % 4) % 4, 0x20)])
  const bin = Buffer.concat([binary, Buffer.alloc((4 - binary.length % 4) % 4)])
  assert.ok(json.length <= 2 * 1024 * 1024, 'Fixed recipe must remain within candidate JSON size')
  assert.ok(bin.length + json.length + 28 <= 32 * 1024 * 1024, 'Fixed recipe must remain within candidate encoded size')
  const header = Buffer.alloc(12)
  header.writeUInt32LE(0x46546c67, 0)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(json.length + bin.length + 28, 8)
  const jsonHeader = Buffer.alloc(8)
  jsonHeader.writeUInt32LE(json.length, 0)
  jsonHeader.writeUInt32LE(0x4e4f534a, 4)
  const binHeader = Buffer.alloc(8)
  binHeader.writeUInt32LE(bin.length, 0)
  binHeader.writeUInt32LE(0x004e4942, 4)
  return Buffer.concat([header, jsonHeader, json, binHeader, bin])
}

// The checker uses node:zlib.crc32 as a separate CRC oracle.
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value
  for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  return crc >>> 0
})
function crc32(bytes) {
  let crc = 0xffffffff
  for (const value of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ value) & 0xff]
  return (crc ^ 0xffffffff) >>> 0
}
function pngChunk(type, payload) {
  const result = Buffer.alloc(payload.length + 12)
  result.writeUInt32BE(payload.length, 0)
  result.write(type, 4, 4, 'ascii')
  payload.copy(result, 8)
  result.writeUInt32BE(crc32(result.subarray(4, 8 + payload.length)), 8 + payload.length)
  return result
}

function grayscaleCheckerPng(dimension) {
  assert.ok(levels.texture.includes(dimension))
  const rowBytes = dimension / 8
  const rawLength = (rowBytes + 1) * dimension
  assert.ok(rawLength <= 2_101_248, 'Maximum authored PNG scanline allocation is bounded')
  const scanlines = Buffer.alloc(rawLength)
  for (let row = 0; row < dimension; row += 1) {
    const offset = row * (rowBytes + 1)
    // Filter zero, 1-bit grayscale, 64 x 64 black/white squares.
    for (let columnByte = 0; columnByte < rowBytes; columnByte += 1) {
      scanlines[offset + 1 + columnByte] = ((row >> 6) + (columnByte >> 3)) % 2 ? 255 : 0
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(dimension, 0)
  header.writeUInt32BE(dimension, 4)
  header[8] = 1 // 1 bit per pixel.
  header[9] = 0 // Grayscale; no alpha, palette or interlace.
  const png = Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', header),
    // Stored DEFLATE blocks avoid relying on compressor heuristics and keep
    // every encoded input bounded despite the large decoded RGBA8 estimate.
    pngChunk('IDAT', deflateSync(scanlines, { level: 0 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
  assert.ok(png.length <= 8 * 1024 * 1024)
  return png
}

function metadata(id, bytes, expected, measurement, source) {
  return {
    id,
    file: `${id}.glb`,
    url: `/boundary-fixtures/${id}.glb`,
    sha256: digest(bytes),
    byteLength: bytes.length,
    logicalId: `fixture-${id}`,
    generator,
    provenance: 'Self-authored project geometry and checker pixels, derived from the original fixed spike recipe; no external source asset.',
    sourceFixture: { id: source.record.id, sha256: source.record.sha256 },
    expected,
    measurement: {
      ...measurement,
      scope: 'candidate-input-measurement-only',
      candidateProfile: profile,
      estimateNote: 'Analytical RGBA8 image/mip estimates and shared source geometry bytes only; not measured native/GPU memory or a complete session accounting policy. Geometry is shared, not counted once per node.',
    },
  }
}

function nodeFixture(count, source) {
  assert.ok(levels.nodes.includes(count))
  const id = `nodes-${count}`
  const { doc, bin } = originalParts(source.bytes)
  const instances = count - 1
  const columns = Math.ceil(Math.sqrt(instances))
  const rows = Math.ceil(instances / columns)
  const centerColumn = Math.floor(columns / 2)
  const centerRow = Math.floor(rows / 2)
  const centerIndex = centerRow * columns + centerColumn
  assert.ok(centerIndex < instances)
  doc.asset.generator = generator
  doc.scenes = [{ name: `${count} total nodes, shared cube mesh`, nodes: [0] }]
  doc.nodes = [{ name: `fixture-${id}`, extras: { scadaId: `fixture-${id}` }, children: Array.from({ length: instances }, (_, index) => index + 1) }]
  for (let index = 0; index < instances; index += 1) {
    const name = `${id}-cube-${index}`
    doc.nodes.push({
      name,
      extras: { scadaId: name },
      mesh: 0,
      translation: [((index % columns) - centerColumn) * 1.4, 0, (Math.floor(index / columns) - centerRow) * 1.4],
      scale: [0.85, 0.85, 0.85],
    })
  }
  doc.materials[0].name = `${id}-material`
  const bytes = glb(doc, bin)
  const expected = {
    nodes: count, meshInstances: instances, meshes: 1, primitives: 1, materials: 1,
    textures: 0, images: 0, clips: 0, clipNames: [], triangles: instances * 12,
    primaryNodeId: `${id}-cube-${centerIndex}`, primaryMaterialId: `${id}-material`,
  }
  return { bytes, record: metadata(id, bytes, expected, {
    axis: 'nodes', level: count, atCandidateCeiling: count === 4096,
    recipe: `${count} total nodes including one root; ${instances} direct mesh children reference one cube mesh, one material and one shared geometry allocation.`,
    estimates: { decodedImageRgba8Bytes: 0, textureBaseLevelRgba8Bytes: 0, textureMipChainRgba8Bytes: 0, geometryAttributeAndIndexBytes: bin.length },
  }, source) }
}

function textureFixture(dimension, source) {
  assert.ok(levels.texture.includes(dimension))
  const id = `texture-${dimension}`
  const original = originalParts(source.bytes)
  const doc = original.doc
  doc.asset.generator = generator
  doc.scenes = [{ name: `${dimension} square grayscale texture with full mips`, nodes: [0] }]
  doc.nodes = [
    { name: `fixture-${id}`, extras: { scadaId: `fixture-${id}` }, children: [1] },
    { name: `${id}-cube`, extras: { scadaId: `${id}-cube` }, mesh: 0 },
  ]
  delete doc.animations
  // The original cube has POSITION, NORMAL, TEXCOORD_0 and index accessors.
  // Keep exactly those source bytes, replacing its image and omitting animation.
  doc.accessors = doc.accessors.slice(0, 4)
  doc.bufferViews = doc.bufferViews.slice(0, 4)
  const geometryLength = Math.max(...doc.bufferViews.map((view) => view.byteOffset + view.byteLength))
  assert.equal(geometryLength % 4, 0)
  const png = grayscaleCheckerPng(dimension)
  const bin = Buffer.concat([original.bin.subarray(0, geometryLength), png])
  doc.bufferViews.push({ buffer: 0, byteOffset: geometryLength, byteLength: png.length })
  doc.images = [{ name: `${id}-self-authored-checker`, bufferView: 4, mimeType: 'image/png' }]
  doc.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }]
  doc.materials[0].name = `${id}-material`
  const bytes = glb(doc, bin)
  const rgba8Bytes = dimension * dimension * 4
  let mipBytes = 0
  for (let size = dimension; size >= 1; size /= 2) mipBytes += size * size * 4
  const expected = {
    nodes: 2, meshInstances: 1, meshes: 1, primitives: 1, materials: 1,
    textures: 1, images: 1, clips: 0, clipNames: [], triangles: 12,
    primaryNodeId: `${id}-cube`, primaryMaterialId: `${id}-material`,
    imageWidth: dimension, imageHeight: dimension, imageBitDepth: 1, imageColorType: 0,
    mipLevels: Math.log2(dimension) + 1, generateMipmaps: true,
  }
  return { bytes, record: metadata(id, bytes, expected, {
    axis: 'image-dimension', level: dimension, atCandidateCeiling: dimension === 4096,
    recipe: `${dimension} x ${dimension} original 1-bit grayscale checker PNG, non-interlaced, filter zero, stored DEFLATE; one fixed cube; LINEAR_MIPMAP_LINEAR and full mip chain.`,
    encodedImageBytes: png.length,
    estimates: { decodedImageRgba8Bytes: rgba8Bytes, textureBaseLevelRgba8Bytes: rgba8Bytes, textureMipChainRgba8Bytes: mipBytes, geometryAttributeAndIndexBytes: geometryLength },
  }, source) }
}

export function buildBoundaryFixtureSet() {
  const original = buildFixtureSet()
  const reference = original.fixtures.find((fixture) => fixture.record.id === 'reference')
  const textured = original.fixtures.find((fixture) => fixture.record.id === 'textured')
  assert.ok(reference && textured)
  const fixtures = [
    ...levels.nodes.map((level) => nodeFixture(level, reference)),
    ...levels.texture.map((level) => textureFixture(level, textured)),
  ]
  assert.equal(fixtures.length, 5)
  const totalBytes = fixtures.reduce((sum, fixture) => sum + fixture.bytes.length, 0)
  assert.ok(totalBytes < 5 * 1024 * 1024, 'Combined authored fixture output bytes must stay below the fixed 5 MiB bound')
  const manifest = Object.fromEntries(fixtures.map(({ record }) => [record.id, record]))
  return { fixtures, manifest, manifestText: `${JSON.stringify(manifest, null, 2)}\n` }
}

export async function checkBoundaryReproducibility() {
  const first = buildBoundaryFixtureSet()
  const second = buildBoundaryFixtureSet()
  assert.equal(first.manifestText, second.manifestText, 'Boundary manifest must generate deterministically')
  assert.equal(await readFile(manifestPath, 'utf8'), first.manifestText, 'Committed boundary manifest differs; updates require explicit --update-manifest')
  for (let index = 0; index < first.fixtures.length; index += 1) {
    const { bytes, record } = first.fixtures[index]
    assert.ok(bytes.equals(second.fixtures[index].bytes), `${record.id}: generation differs between runs`)
    const generated = await readFile(resolve(outputDirectory, record.file))
    assert.ok(bytes.equals(generated), `${record.id}: generate ignored output with node scripts/boundary-fixtures.mjs`)
  }
  return first
}

async function main() {
  const args = process.argv.slice(2)
  assert.ok(args.every((arg) => ['--check', '--update-manifest'].includes(arg)), 'Only --check or --update-manifest is supported; fixture sizes are fixed')
  assert.ok(!(args.includes('--check') && args.includes('--update-manifest')), 'Check and manifest update are separate operations')
  if (args.includes('--check')) {
    const { fixtures } = await checkBoundaryReproducibility()
    console.log(JSON.stringify({ reproducible: true, fixtureCount: fixtures.length, manifestUpdated: false }))
    return
  }
  const { fixtures, manifestText } = buildBoundaryFixtureSet()
  if (args.includes('--update-manifest')) await writeFile(manifestPath, manifestText)
  else assert.equal(await readFile(manifestPath, 'utf8'), manifestText, 'Committed boundary manifest differs; updates require explicit --update-manifest')
  await mkdir(outputDirectory, { recursive: true })
  for (const { bytes, record } of fixtures) await writeFile(resolve(outputDirectory, record.file), bytes)
  console.log(JSON.stringify({ generated: fixtures.length, encodedBytes: fixtures.reduce((sum, fixture) => sum + fixture.bytes.length, 0), manifestUpdated: args.includes('--update-manifest') }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()
