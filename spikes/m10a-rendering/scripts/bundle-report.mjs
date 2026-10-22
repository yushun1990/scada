import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { resolve, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const spike = fileURLToPath(new URL('..', import.meta.url))
const repo = resolve(spike, '../..')
const args = process.argv.slice(2)
const value = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback
const directory = resolve(value('--dist', resolve(spike, 'dist')))
const output = resolve(value('--out', resolve(spike, 'evidence/bundle.json')))
const files = []
async function visit(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const full = resolve(path, entry.name)
    if (entry.isDirectory()) await visit(full)
    else if (/\.(js|css|wasm|html)$/.test(entry.name)) {
      const bytes = await readFile(full)
      files.push({ file: relative(directory, full), bytes: bytes.length,
        gzipBytes: gzipSync(bytes, { level: 9 }).length,
        sha256: createHash('sha256').update(bytes).digest('hex') })
    }
  }
}
await visit(directory)
files.sort((a, b) => a.file.localeCompare(b.file))
const report = {
  format: 1,
  capturedAt: new Date().toISOString(),
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
  worktreeStatus: execFileSync('git', ['status', '--porcelain=v1'], { cwd: repo, encoding: 'utf8' }).trim(),
  node: process.version,
  directory: relative(repo, directory),
  bytes: files.reduce((n, file) => n + file.bytes, 0), files,
}
if (args.includes('--compare')) {
  const before = JSON.parse(await readFile(resolve(value('--compare')), 'utf8'))
  assert.deepEqual(files, before.files, 'Product build bytes changed; do not call the 2D route unaffected')
  report.identicalTo = { revision: before.revision, fileCount: files.length }
}
if (!args.includes('--root')) {
  const chunks = JSON.parse(await readFile(resolve(directory, 'chunk-evidence.json'), 'utf8'))
  const initial = new Set()
  function trace(file) {
    if (initial.has(file)) return
    initial.add(file)
    const chunk = chunks.find(item => item.file === file)
    assert.ok(chunk, `Missing chunk ${file}`)
    for (const dependency of chunk.imports) trace(dependency)
  }
  for (const entry of chunks.filter(item => item.isEntry)) trace(entry.file)
  const heavy = chunks.filter(chunk => chunk.modules.some(id => /node_modules\/(?:three\/|@react-three\/fiber\/)/.test(id)))
  assert.ok(heavy.length, 'Expected a measured Three/R3F adapter chunk')
  assert.ok(heavy.every(chunk => !initial.has(chunk.file)), 'Three/R3F must be absent from the initial static import closure')
  report.initialJs = [...initial]
  report.lazyJs = chunks.filter(chunk => !initial.has(chunk.file)).map(chunk => chunk.file)
  report.initialJsBytes = files.filter(file => initial.has(file.file)).reduce((n, file) => n + file.bytes, 0)
  report.lazyJsBytes = files.filter(file => report.lazyJs.includes(file.file)).reduce((n, file) => n + file.bytes, 0)
  report.chunks = chunks
}
await mkdir(dirname(output), { recursive: true })
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify({ output, bytes: report.bytes, initialJsBytes: report.initialJsBytes, lazyJsBytes: report.lazyJsBytes, identicalTo: report.identicalTo }))
