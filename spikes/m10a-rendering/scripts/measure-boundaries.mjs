import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, firefox } from 'playwright'
import { LinearMipmapLinearFilter, RGBAFormat, UnsignedByteType } from 'three'

// A separate observational runner for pinned internal boundary fixtures. The
// original browser capability/gesture checks remain a separate required lane.
const spikeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(spikeRoot, '../..')
const args = process.argv.slice(2)
const valueOptions = new Set(['--fixtures', '--browser', '--base-url', '--frames', '--repeats', '--timeout-ms', '--output-dir'])
const flagOptions = new Set(['--headed', '--screenshots'])
const seenOptions = new Set()
for (let index = 0; index < args.length; index++) {
  const name = args[index]
  assert(valueOptions.has(name) || flagOptions.has(name), `Unknown option ${name}`)
  assert(!seenOptions.has(name), `Duplicate option ${name}`)
  seenOptions.add(name)
  if (valueOptions.has(name)) {
    assert(args[index + 1] && !args[index + 1].startsWith('--'), `${name} requires a value`)
    index++
  }
}
function option(name, fallback) {
  const index = args.indexOf(name)
  if (index < 0) return fallback
  assert(args[index + 1] && !args[index + 1].startsWith('--'), `${name} requires a value`)
  return args[index + 1]
}
function integerOption(name, fallback, minimum, maximum) {
  const value = Number(option(name, String(fallback)))
  assert(Number.isInteger(value) && value >= minimum && value <= maximum, `${name} must be an integer ${minimum}..${maximum}`)
  return value
}
const manifest = JSON.parse(await readFile(path.join(spikeRoot, 'src/boundary-fixtures.generated.json'), 'utf8'))
const fixtureIds = option('--fixtures', Object.keys(manifest).join(',')).split(',')
assert(fixtureIds.length > 0 && new Set(fixtureIds).size === fixtureIds.length, '--fixtures must be a nonempty list of distinct IDs')
for (const id of fixtureIds) assert(Object.hasOwn(manifest, id), `Unknown boundary fixture ${id}`)
const browserOption = option('--browser', 'all')
const browserNames = browserOption === 'all' ? ['chromium', 'firefox'] : [browserOption]
assert(browserNames.every((name) => ['chromium', 'firefox'].includes(name)), '--browser must be chromium|firefox|all')
const baseURL = option('--base-url', process.env.M10A_BASE_URL ?? 'http://127.0.0.1:4175/')
const origin = new URL(baseURL).origin
const headed = args.includes('--headed')
const screenshots = args.includes('--screenshots')
const frames = integerOption('--frames', 60, 10, 600)
const repeats = integerOption('--repeats', 3, 1, 20)
const timeoutMs = integerOption('--timeout-ms', 120000, 10000, 300000)
const outputRoot = path.resolve(option('--output-dir', path.join(spikeRoot, 'artifacts/boundaries', new Date().toISOString().replaceAll(':', '-'))))
const reportPath = path.join(outputRoot, 'report.json')
assert(!(await access(reportPath).then(() => true, () => false)), `Refusing to overwrite retained evidence: ${reportPath}; use a fresh --output-dir`)
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const git = (...parameters) => execFileSync('git', parameters, { cwd: repoRoot, encoding: 'utf8' }).trim()
const errorText = (error) => error instanceof Error ? `${error.name}: ${error.message}` : String(error)
async function filesUnder(directory, prefix = '') {
  const result = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', '.git', 'artifacts', 'evidence'].includes(entry.name)) continue
    const relative = path.posix.join(prefix, entry.name)
    const absolute = path.join(directory, entry.name)
    if (absolute === outputRoot) continue
    if (entry.isDirectory()) result.push(...await filesUnder(absolute, relative))
    else if (entry.isFile()) result.push(relative)
  }
  return result.sort()
}
async function hashes(directory, files) {
  return Object.fromEntries(await Promise.all(files.map(async (file) => {
    const bytes = await readFile(path.join(directory, file))
    return [file, { byteLength: bytes.length, sha256: digest(bytes) }]
  })))
}
const distRoot = path.join(spikeRoot, 'dist')
const distFiles = await filesUnder(distRoot)
assert(distFiles.includes('index.html'), 'Build the isolated spike and its boundary fixtures first')
const sourceFiles = (await filesUnder(spikeRoot)).filter((file) => !file.startsWith('dist/'))
const buildHashes = await hashes(distRoot, distFiles)
for (const id of fixtureIds) {
  const fixture = manifest[id]
  const bytes = buildHashes[fixture.url.replace(/^\//, '')]
  assert(bytes, `The built resource closure is missing ${fixture.url}`)
  assert.equal(bytes.sha256, fixture.sha256, `Built fixture ${id} digest mismatch`)
  assert.equal(bytes.byteLength, fixture.byteLength, `Built fixture ${id} byte length mismatch`)
}
const report = {
  schemaVersion: 1,
  scope: 'M10A isolated boundary observations; no product import admission, hardware qualification, quantitative budget or gate acceptance',
  startedAt: new Date().toISOString(),
  invocation: { argv: args, baseURL, browsers: browserNames, fixtures: fixtureIds, headed, screenshots, frames, repeats, timeoutMs, outputRoot },
  revision: {
    head: git('rev-parse', 'HEAD'), branch: git('branch', '--show-current'), worktree: git('status', '--porcelain=v1'),
    trackedDiffSha256: digest(git('diff', '--binary', 'HEAD')),
    sourceFiles: await hashes(spikeRoot, sourceFiles), buildFiles: buildHashes,
  },
  environment: {
    os: { type: os.type(), release: os.release(), arch: os.arch(), platform: os.platform() },
    cpu: { model: os.cpus()[0]?.model ?? null, logicalProcessors: os.cpus().length },
    totalMemoryBytes: os.totalmem(), node: process.version,
    playwright: JSON.parse(await readFile(path.join(spikeRoot, 'node_modules/playwright/package.json'), 'utf8')).version,
    display: process.env.DISPLAY ?? null, waylandDisplay: process.env.WAYLAND_DISPLAY ?? null,
    graphicsEnvironment: Object.fromEntries(['LIBGL_ALWAYS_SOFTWARE', 'GALLIUM_DRIVER', 'MESA_LOADER_DRIVER_OVERRIDE', 'MOZ_ENABLE_WAYLAND'].map((name) => [name, process.env[name] ?? null])),
  },
  method: {
    isolation: 'Fresh browser process and non-persistent context per fixture/repeat; sequential attempts; no OS/disk cache purge.',
    bootstrap: 'Enter the existing route and load its default textured fixture, disable animation, unload, then settle two requestAnimationFrame callbacks.',
    firstTarget: 'First target load in this context after bootstrap: renderer/module/image-decoder state already warmed. This is not fully cold application/model loading.',
    firstRender: 'Adapter firstRenderMs measures CPU setup and render submission plus error checking, without a GPU completion fence.',
    repeatedTarget: 'Immediate reload of the same target in the same context. HTTP cache remains disabled by Playwright resource-closure routing for both loads.',
    frames: 'Raw requestAnimationFrame intervals and nearest-rank sample percentiles; not CPU/GPU render duration. Orbit/transform use the existing scripted adapter probe, not native pointer input.',
    percentiles: 'Small per-attempt samples are retained without tail-confidence claims; with 60 samples nearest-rank p99 is the maximum observed interval.',
    memory: 'JS heap is a browser estimate if exposed, with no forced GC. Manifest decoded/mipmap byte estimates and observed typed-array bytes do not measure GPU/process memory.',
    resourceClosure: 'HTTP requests restricted to built local files. Pinned GLB responses are independently hashed; loader-owned blob URL count must return to zero.',
    budgetVerdict: 'not evaluated; no numeric performance budget is asserted',
  },
  fixtures: Object.fromEntries(fixtureIds.map((id) => [id, manifest[id]])),
  expectedAttempts: browserNames.length * fixtureIds.length * repeats,
  attempts: [],
}
await mkdir(outputRoot, { recursive: true })
async function flushReport() {
  const temporary = `${reportPath}.tmp`
  await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`)
  await rename(temporary, reportPath)
}
class CapabilityUnavailable extends Error {}
class AttemptTimeout extends Error {}
async function bounded(promise, milliseconds, label) {
  let timer
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new AttemptTimeout(`${label} exceeded ${milliseconds} ms`)), milliseconds)
    })])
  } finally { clearTimeout(timer) }
}
async function compactState(page) {
  return page.evaluate(() => {
    const state = window.__m10a.snapshot()
    return {
      status: state.status, error: state.error, fixture: state.fixture,
      renderer: state.renderer, visual: state.visual, selectedId: state.selectedId,
      capability: state.capability, ownedObjectURLs: state.telemetry.ownedObjectURLs,
      lastLoad: state.telemetry.loads.at(-1) ?? null,
      lastDisposal: state.telemetry.disposals.at(-1) ?? null,
    }
  })
}
async function heap(page) {
  return page.evaluate(() => performance.memory ? {
    availability: 'browser estimate; no forced GC', usedJSHeapSize: performance.memory.usedJSHeapSize,
    totalJSHeapSize: performance.memory.totalJSHeapSize, jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
  } : { availability: 'not available; not verified', usedJSHeapSize: null })
}
async function settle(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}
function assertUnloaded(state) {
  assert.equal(state.fixture, null)
  for (const resource of ['geometries', 'textures', 'programs']) assert.equal(state.renderer[resource], 0, `${resource} must be released after unload`)
  assert.equal(state.ownedObjectURLs, 0, 'No loader-owned URL may remain')
}
function assertLoaded(state, fixture) {
  assert.equal(state.status, 'ready', state.error ?? 'Target did not become ready')
  assert.equal(state.fixture, fixture.id)
  assert.equal(state.ownedObjectURLs, 0)
  assert.equal(state.selectedId, null, 'No transform gizmo should add draws to measurement')
  assert.equal(state.visual.playing, false, 'Animation must be disabled during boundary measurements')
  const load = state.lastLoad
  assert.equal(load.fixture, fixture.id)
  assert.equal(load.hashVerified, true)
  assert.equal(load.sha256, fixture.sha256)
  assert.equal(load.byteLength, fixture.byteLength)
  const observed = load.resourceObservation
  assert(observed, 'Actual loaded resource observations are required')
  assert.equal(observed.meshInstances, fixture.expected.meshInstances)
  assert.equal(observed.uniqueGeometries, fixture.expected.meshes)
  assert.equal(observed.uniqueTextures, fixture.expected.textures)
  assert.equal(observed.attributeAndIndexBytes, fixture.measurement.estimates.geometryAttributeAndIndexBytes)
  assert.equal(observed.images.length, fixture.expected.images)
  for (const image of observed.images) {
    assert.equal(image.width, fixture.expected.imageWidth)
    assert.equal(image.height, fixture.expected.imageHeight)
  }
  for (const texture of observed.textures) {
    assert.equal(texture.width, fixture.expected.imageWidth)
    assert.equal(texture.height, fixture.expected.imageHeight)
    assert.equal(texture.generateMipmaps, fixture.expected.generateMipmaps)
    assert.equal(texture.minFilter, LinearMipmapLinearFilter)
    assert.equal(texture.format, RGBAFormat)
    assert.equal(texture.type, UnsignedByteType)
  }
}
function compactLoaded(state) {
  return { status: state.status, fixture: state.fixture, renderer: state.renderer, visual: state.visual, ownedObjectURLs: state.ownedObjectURLs, load: state.lastLoad }
}
async function runAttempt(browserName, fixtureId, repeat) {
  const fixture = manifest[fixtureId]
  const attempt = {
    id: `${browserName}-${fixtureId}-${repeat}`, browser: browserName, fixture: fixtureId, repeat,
    status: 'running', startedAt: new Date().toISOString(), stage: 'launch',
    requests: [], blockedRequests: [], fixtureResponses: [], pageErrors: [], console: [], measurements: {},
  }
  report.attempts.push(attempt)
  await flushReport()
  let browser
  let context
  let page
  const started = performance.now()
  const pendingResponses = new Set()
  const allowedPaths = new Set(['/', '/index.html', '/favicon.ico', ...distFiles.map((file) => `/${file}`)])
  async function perform() {
    try { browser = await ({ chromium, firefox }[browserName]).launch({ headless: !headed, timeout: Math.min(timeoutMs, 30000) }) }
    catch (error) { throw new CapabilityUnavailable(`Browser launch unavailable: ${errorText(error)}`) }
    attempt.browserVersion = browser.version()
    context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, serviceWorkers: 'block' })
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url())
      if (['data:', 'blob:', 'about:'].includes(url.protocol)) return route.continue()
      if (url.origin === origin && allowedPaths.has(url.pathname)) return route.continue()
      attempt.blockedRequests.push({ url: url.href, method: route.request().method(), stage: attempt.stage })
      return route.abort('blockedbyclient')
    })
    page = await context.newPage()
    page.setDefaultTimeout(Math.min(timeoutMs, 30000))
    page.on('request', (request) => attempt.requests.push({ stage: attempt.stage, url: request.url(), type: request.resourceType() }))
    page.on('pageerror', (error) => attempt.pageErrors.push({ stage: attempt.stage, error: errorText(error) }))
    page.on('console', (message) => {
      if (['error', 'warning'].includes(message.type())) attempt.console.push({ stage: attempt.stage, type: message.type(), text: message.text() })
    })
    page.on('response', (response) => {
      if (new URL(response.url()).pathname !== fixture.url) return
      const stage = attempt.stage
      const pending = (async () => {
        const value = { stage, url: response.url(), status: response.status() }
        try { const bytes = await response.body(); value.byteLength = bytes.length; value.sha256 = digest(bytes) }
        catch (error) { value.error = errorText(error) }
        attempt.fixtureResponses.push(value)
      })()
      pendingResponses.add(pending)
      void pending.finally(() => pendingResponses.delete(pending))
    })
    attempt.stage = 'bootstrap'
    await page.goto(baseURL, { waitUntil: 'networkidle' })
    attempt.browserEnvironment = await page.evaluate(() => ({
      userAgent: navigator.userAgent, platform: navigator.platform, hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemoryGiB: navigator.deviceMemory ?? null, viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
    }))
    await page.getByTestId('enter-3d').click()
    await page.waitForFunction(() => ['ready', 'unsupported', 'error', 'context-lost'].includes(window.__m10a?.snapshot().status))
    const bootstrap = await compactState(page)
    attempt.capability = bootstrap.capability
    const reportedRenderer = String(bootstrap.capability.unmaskedRenderer ?? bootstrap.capability.renderer ?? '')
    attempt.graphicsClassification = {
      reportedRenderer,
      classification: /swiftshader|llvmpipe|softpipe|software/i.test(reportedRenderer) ? 'reported-software-renderer' : 'hardware-unverified',
      note: 'Non-software-looking or privacy-masked driver strings do not verify physical GPU use; explicit software environment settings are recorded separately.',
    }
    if (bootstrap.status === 'unsupported') throw new CapabilityUnavailable(`Native WebGL2 unavailable: ${bootstrap.error}`)
    assert.equal(bootstrap.status, 'ready', bootstrap.error ?? 'Bootstrap failed')
    attempt.bootstrap = compactLoaded(bootstrap)
    if (fixture.expected.images > 0) {
      const limit = bootstrap.capability.maxTextureSize
      assert(Number.isInteger(limit) && limit > 0, 'Actual MAX_TEXTURE_SIZE capability must be reported')
      if (Math.max(fixture.expected.imageWidth, fixture.expected.imageHeight) > limit) {
        throw new CapabilityUnavailable(`Exact ${fixtureId} dimensions exceed native MAX_TEXTURE_SIZE ${limit}; downsampled rendering is not this fixture boundary`)
      }
    }
    await page.evaluate(() => { window.__m10a.setProperties({ visible: true, playing: false }); window.__m10a.unload() })
    await settle(page)
    const baseline = await compactState(page)
    assertUnloaded(baseline)
    attempt.measurements.beforeTarget = { renderer: baseline.renderer, ownedObjectURLs: baseline.ownedObjectURLs, heap: await heap(page) }
    for (const phase of ['first-target', 'repeated-target']) {
      attempt.stage = phase
      const loadStarted = performance.now()
      await page.evaluate((id) => window.__m10a.loadFixture(id), fixtureId)
      const state = await compactState(page)
      assertLoaded(state, fixture)
      await Promise.all(pendingResponses)
      const response = attempt.fixtureResponses.findLast((value) => value.stage === phase)
      assert(response, `No actual ${phase} HTTP response was observed`)
      assert.equal(response.status, 200)
      assert.equal(response.sha256, fixture.sha256)
      assert.equal(response.byteLength, fixture.byteLength)
      attempt.measurements[phase] = { wallMs: performance.now() - loadStarted, ...compactLoaded(state), heap: await heap(page) }
      await settle(page)
    }
    if (screenshots) {
      attempt.screenshot = `${attempt.id}.png`
      await page.screenshot({ path: path.join(outputRoot, attempt.screenshot), fullPage: true })
    }
    attempt.measurements.phases = {}
    for (const phase of ['idle', 'orbit', 'transform']) {
      attempt.stage = `measure-${phase}`
      const sample = await page.evaluate(({ phase, frames }) => window.__m10a.measure({ phase, frames }), { phase, frames })
      assert.equal(sample.frames, frames)
      assert.equal(sample.frameIntervalsMs.length, frames)
      assert(sample.frameIntervalsMs.every((value) => Number.isFinite(value) && value >= 0))
      attempt.measurements.phases[phase] = sample
    }
    attempt.stage = 'unload'
    const beforeUnload = await compactState(page)
    assertLoaded(beforeUnload, fixture)
    await page.evaluate(() => window.__m10a.unload())
    await settle(page)
    const unloaded = await compactState(page)
    assertUnloaded(unloaded)
    attempt.measurements.unload = { before: beforeUnload.renderer, after: unloaded.renderer, disposal: unloaded.lastDisposal, ownedObjectURLs: unloaded.ownedObjectURLs, heap: await heap(page) }
    await Promise.all(pendingResponses)
    assert.deepEqual(attempt.blockedRequests, [], 'No HTTP dependency outside the built local resource closure is allowed')
    assert.deepEqual(attempt.pageErrors, [], 'No uncaught page error is allowed')
  }
  try {
    await bounded(perform(), timeoutMs, attempt.id)
    attempt.status = 'passed'
  } catch (error) {
    attempt.status = error instanceof CapabilityUnavailable ? 'not-verified' : 'failed'
    attempt.error = errorText(error)
    attempt.timedOut = error instanceof AttemptTimeout
    if (page && !page.isClosed()) {
      attempt.failureState = await bounded(compactState(page), 2000, 'failure snapshot').catch((captureError) => ({ error: errorText(captureError) }))
    }
  } finally {
    // Closing the process also fences timed-out evaluate/parse/render work and
    // prevents one large fixture from carrying resources into the next attempt.
    if (context) await bounded(context.close(), 5000, 'context close').catch((error) => { attempt.cleanupError = errorText(error) })
    if (browser) await bounded(browser.close(), 10000, 'browser close').catch((error) => { attempt.cleanupError = errorText(error) })
    if (attempt.cleanupError) attempt.status = 'failed'
    attempt.elapsedMs = performance.now() - started
    attempt.completedAt = new Date().toISOString()
    console.log(`[${attempt.id}] ${attempt.status}${attempt.error ? `: ${attempt.error}` : ''}`)
    await flushReport()
  }
  return !attempt.cleanupError
}

await flushReport()
attempts: for (const browser of browserNames) {
  for (const fixture of fixtureIds) {
    for (let repeat = 1; repeat <= repeats; repeat++) {
      // Do not compound uncertain resource ownership with another large load.
      if (!await runAttempt(browser, fixture, repeat)) { report.stoppedForCleanupFailure = true; break attempts }
    }
  }
}
report.completedAt = new Date().toISOString()
report.revisionAtEnd = { head: git('rev-parse', 'HEAD'), worktree: git('status', '--porcelain=v1') }
report.summary = {
  expectedAttempts: report.expectedAttempts, completedAttempts: report.attempts.filter((attempt) => attempt.completedAt).length,
  passed: report.attempts.filter((attempt) => attempt.status === 'passed').length,
  failed: report.attempts.filter((attempt) => attempt.status === 'failed').length,
  notVerified: report.attempts.filter((attempt) => attempt.status === 'not-verified').length,
  coverage: browserNames.flatMap((browser) => fixtureIds.map((fixture) => ({
    browser, fixture, expected: repeats,
    passed: report.attempts.filter((attempt) => attempt.browser === browser && attempt.fixture === fixture && attempt.status === 'passed').length,
  }))),
  budgetVerdict: 'not evaluated; observations do not set universal safety or performance budgets',
}
await flushReport()
console.log(JSON.stringify({ report: reportPath, ...report.summary }, null, 2))
if (report.summary.failed > 0 || report.summary.completedAttempts !== report.summary.expectedAttempts) process.exitCode = 1
else if (report.summary.notVerified > 0) process.exitCode = 2
