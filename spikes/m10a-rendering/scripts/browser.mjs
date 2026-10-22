import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, firefox } from 'playwright'

// This measures the disposable spike. It does not promote a product gate or
// invent a portable GPU/frame-time budget. Missing native capability is retained
// as not-verified; a failed assertion makes the process fail.
const spikeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(spikeRoot, '../..')
const args = process.argv.slice(2)
function option(name, fallback) {
  const index = args.indexOf(name)
  return index < 0 ? fallback : args[index + 1]
}
const baseURL = option('--base-url', process.env.M10A_BASE_URL ?? 'http://127.0.0.1:4175')
const outputRoot = path.resolve(option('--output-dir', path.join(spikeRoot, 'artifacts/browser')))
const browserNames = option('--browser', 'all') === 'all'
  ? ['chromium', 'firefox'] : [option('--browser')]
const headed = args.includes('--headed')
const softwareRequested = args.includes('--swiftshader')
const executablePath = option('--executable-path')
const frames = Number(option('--frames', '180'))
assert(browserNames.every((name) => ['chromium', 'firefox'].includes(name)), 'Use --browser chromium|firefox|all')
assert(Number.isInteger(frames) && frames >= 30, '--frames must be an integer >= 30')
assert(!executablePath || browserNames.length === 1, '--executable-path requires one browser')
const origin = new URL(baseURL).origin
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const git = (...gitArgs) => execFileSync('git', gitArgs, { cwd: repoRoot, encoding: 'utf8' }).trim()

async function filesUnder(directory, prefix = '') {
  const result = []
  for (const item of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
    if (['node_modules', '.git', 'artifacts', 'evidence'].includes(item.name)) continue
    const relative = path.posix.join(prefix, item.name)
    if (item.isDirectory()) result.push(...await filesUnder(path.join(directory, item.name), relative))
    else if (item.isFile()) result.push(relative)
  }
  return result.sort()
}
async function hashes(directory, files) {
  return Object.fromEntries(await Promise.all(files.map(async (file) => {
    const bytes = await readFile(path.join(directory, file))
    return [file, { bytes: bytes.length, sha256: digest(bytes) }]
  })))
}
const distFiles = await filesUnder(path.join(spikeRoot, 'dist'))
assert(distFiles.includes('index.html'), 'Build the isolated spike before running the browser harness')
const manifest = JSON.parse(await readFile(path.join(spikeRoot, 'dist/.vite/manifest.json'), 'utf8'))
const fixtureManifest = JSON.parse(await readFile(path.join(spikeRoot, 'src/fixtures.generated.json'), 'utf8'))
const lazyChunks = Object.values(manifest).filter((entry) => entry.isDynamicEntry).map((entry) => `/${entry.file}`)
assert(lazyChunks.length > 0, 'The built manifest must identify at least one dynamic entry')
const sourceFiles = (await filesUnder(spikeRoot)).filter((file) => !file.startsWith('dist/'))
const report = {
  schemaVersion: 1,
  scope: 'isolated M10A capability/measurement spike; not product, security, performance or gate acceptance',
  startedAt: new Date().toISOString(),
  revision: {
    head: git('rev-parse', 'HEAD'), branch: git('branch', '--show-current'),
    worktree: git('status', '--porcelain=v1'),
    trackedDiffSha256: digest(git('diff', '--binary', 'HEAD')),
    sourceFiles: await hashes(spikeRoot, sourceFiles),
    buildFiles: await hashes(path.join(spikeRoot, 'dist'), distFiles),
  },
  environment: {
    os: { type: os.type(), release: os.release(), arch: os.arch(), platform: os.platform() },
    cpu: { model: os.cpus()[0]?.model, logicalProcessors: os.cpus().length },
    totalMemoryBytes: os.totalmem(), node: process.version,
    display: process.env.DISPLAY ?? null, waylandDisplay: process.env.WAYLAND_DISPLAY ?? null,
    playwright: JSON.parse(await readFile(new URL('../node_modules/playwright/package.json', import.meta.url), 'utf8').catch(
      () => readFile(path.join(spikeRoot, 'node_modules/playwright/package.json'), 'utf8'))).version,
  },
  invocation: { baseURL, browsers: browserNames, headed, softwareRequested, executablePath: executablePath ?? null, frames },
  cachePolicy: {
    cold: 'First enter in a new non-persistent browser context; no explicit disk/OS cache purge. Built shell has already loaded. HTTP cache is disabled by Playwright resource-closure routing.',
    warm: 'Reload the same fixed fixture in the same context/session after first load. JS/module/decoder state is warm; HTTP cache remains disabled by routing. This is repeated fetch plus warm-process parse, not a cached network-load measurement.',
  },
  lazyChunks,
  browsers: [],
}
await mkdir(outputRoot, { recursive: true })

function errorText(error) { return error instanceof Error ? `${error.name}: ${error.message}` : String(error) }
function resultCheck(result, name, callback) {
  return (async () => {
    const start = performance.now()
    try {
      const details = await callback()
      result.checks.push({ name, status: 'passed', elapsedMs: performance.now() - start, details: details ?? null })
      console.log(`[${result.name}] passed: ${name}`)
      return true
    } catch (error) {
      result.checks.push({ name, status: 'failed', elapsedMs: performance.now() - start, error: errorText(error) })
      console.error(`[${result.name}] FAILED: ${name}: ${errorText(error)}`)
      return false
    }
  })()
}
function notVerified(result, name, reason) {
  result.checks.push({ name, status: 'not-verified', reason })
}
async function snapshot(page) { return page.evaluate(() => window.__m10a.snapshot()) }
async function waitSettled(page) {
  await page.waitForFunction(() => window.__m10a && ['ready', 'error', 'unsupported', 'context-lost'].includes(window.__m10a.snapshot().status), undefined, { timeout: 30000 })
  return snapshot(page)
}
async function ready(page) {
  const state = await waitSettled(page)
  assert.equal(state.status, 'ready', JSON.stringify(state))
  await page.waitForFunction(() => window.__m10a.snapshot().renderer.geometries > 0)
  return snapshot(page)
}
async function heap(page) {
  return page.evaluate(() => performance.memory ? {
    availability: 'available; browser estimate, no forced GC; not proof of absence of leaks',
    usedJSHeapSize: performance.memory.usedJSHeapSize,
    totalJSHeapSize: performance.memory.totalJSHeapSize,
    jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
  } : { availability: 'not available in this browser; not verified', usedJSHeapSize: null })
}
async function browserEnvironment(page) {
  return page.evaluate(() => ({
    userAgent: navigator.userAgent, platform: navigator.platform,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemoryGiB: navigator.deviceMemory ?? null,
    viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
    performanceTimeOrigin: performance.timeOrigin,
  }))
}
async function screenshot(page, result, name) {
  const file = `${result.name}-${name}.png`
  await page.screenshot({ path: path.join(outputRoot, file), fullPage: true })
  result.screenshots.push(file)
}
async function pointFor(page, kind) {
  const state = await snapshot(page)
  const points = state.screenPoints ?? {}
  const point = kind === 'center' ? points.center
    : points[kind] ?? points.axisX ?? points.x ?? points.handle
  assert(point && Number.isFinite(point.x) && Number.isFinite(point.y), `Missing finite screenPoints.${kind}: ${JSON.stringify(points)}`)
  return point
}
async function pickWithPointer(page) {
  const point = await pointFor(page, 'center')
  await page.mouse.click(point.x, point.y)
  const state = await snapshot(page)
  assert.equal(state.selectedId, `fixture-${state.fixture}`)
  return { input: 'Playwright mouse click dispatched through browser pointer hit testing', point, selectedId: state.selectedId }
}
function sameTransform(a, b) { return JSON.stringify(a) === JSON.stringify(b) }
async function pointerTransform(page, mode, cancel = false) {
  await page.getByTestId(`mode-${mode}`).click()
  // TransformControls updates its gizmo matrices during the demand-render
  // frame following a mode switch. Wait for that frame before hit testing.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const before = await snapshot(page)
  const point = await pointFor(page, mode)
  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  let held = true
  try {
    // The app publishes points on the actual controls; it does not accept a
    // synthetic "drag" command from this test.
    const started = await snapshot(page)
    assert.equal(started.gesture.active, true, `The ${mode} handle did not start a native pointer gesture: ${JSON.stringify(started.screenPoints)}`)
    assert.equal(started.orbitEnabled, false, 'Orbit controls must yield to a transform gesture')
    await page.mouse.move(point.x + (mode === 'rotate' ? 38 : 60), point.y + (mode === 'rotate' ? 45 : 0), { steps: 12 })
    const during = await snapshot(page)
    assert(!sameTransform(before.transform, during.transform), `${mode} must change the object during the gesture`)
    if (cancel) await page.keyboard.press('Escape')
    await page.mouse.up()
    held = false
    const after = await snapshot(page)
    assert.equal(after.gesture.active, false)
    assert.equal(after.orbitEnabled, true)
    assert.equal(after.historyDepth, before.historyDepth + (cancel ? 0 : 1), 'Exactly one history command per committed pointer gesture')
    if (cancel) assert(sameTransform(before.transform, after.transform), 'Cancelled pointer gesture must restore its starting transform')
    else {
      assert(!sameTransform(before.transform, after.transform), `${mode} committed transform must differ`)
      await page.getByTestId('undo').click()
      assert(sameTransform(before.transform, (await snapshot(page)).transform), 'Undo must restore the pre-gesture transform')
    }
    return { input: 'actual browser mouse drag; Escape keyboard for cancellation', point, before, during, after }
  } finally {
    // Failed hit tests must not leave a pressed button that changes later
    // camera/gesture checks into misleading cascaded failures.
    if (held) await page.mouse.up()
  }
}
function rendererCounts(state) { return state.renderer ?? null }

async function runBrowser(name) {
  const result = { name, checks: [], screenshots: [], requests: [], blockedRequests: [], console: [], pageErrors: [], measurements: {} }
  report.browsers.push(result)
  let browser
  const launchOptions = {
    headless: !headed,
    ...(executablePath ? { executablePath } : {}),
    ...(name === 'chromium' && softwareRequested ? { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } : {}),
  }
  result.launchOptions = launchOptions
  try { browser = await ({ chromium, firefox }[name]).launch(launchOptions) }
  catch (error) {
    result.nativeCapability = { status: 'not-verified', reason: `Browser launch unavailable: ${errorText(error)}` }
    notVerified(result, 'native-rendering', result.nativeCapability.reason)
    notVerified(result, 'injected-unsupported-ui', 'Browser could not launch; UI was not observed')
    return
  }
  result.browserVersion = browser.version()
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, serviceWorkers: 'block' })
  const allowedPaths = new Set(['/', '/index.html', '/favicon.ico', ...distFiles.map((file) => `/${file}`)])
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (['data:', 'blob:', 'about:'].includes(url.protocol)) return route.continue()
    if (url.origin === origin && allowedPaths.has(url.pathname)) return route.continue()
    result.blockedRequests.push({ url: url.href, method: route.request().method(), reason: 'not in built local resource closure' })
    return route.abort('blockedbyclient')
  })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  let stage = 'initial-shell'
  page.on('request', (request) => result.requests.push({ stage, url: request.url(), type: request.resourceType(), method: request.method() }))
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) result.console.push({ stage, type: message.type(), text: message.text() })
  })
  page.on('pageerror', (error) => result.pageErrors.push({ stage, error: errorText(error) }))
  try {
    await page.goto(baseURL, { waitUntil: 'networkidle' })
    result.browserEnvironment = await browserEnvironment(page)
    result.measurements.heapBeforeEnter = await heap(page)
    await resultCheck(result, 'built-shell-does-not-fetch-lazy-adapter-or-GLB', async () => {
      assert.equal((await snapshot(page)).status, 'shell')
      const initial = result.requests.filter((request) => request.stage === 'initial-shell')
      assert(!initial.some((request) => lazyChunks.includes(new URL(request.url).pathname)), 'A dynamic renderer entry was requested before entering 3D')
      assert(!initial.some((request) => /\.glb(?:\?|$)/.test(request.url)), 'GLB fetched before entering 3D')
      await screenshot(page, result, 'shell')
      return { requests: initial, lazyChunks }
    })
    stage = 'cold-first-enter'
    const enterStart = performance.now()
    await page.getByTestId('enter-3d').click()
    let entered = await waitSettled(page)
    if (entered.status === 'ready') entered = await ready(page)
    result.measurements.coldFirstEnter = { wallMs: performance.now() - enterStart, cacheState: report.cachePolicy.cold, telemetry: entered.telemetry }
    result.nativeCapability = { status: entered.status === 'ready' ? 'available' : 'not-verified', state: entered }
    const rendererIdentity = String(entered.capability?.unmaskedRenderer ?? entered.capability?.renderer ?? '')
    result.graphicsClassification = {
      reportedRenderer: rendererIdentity,
      classification: /swiftshader|llvmpipe|softpipe|software/i.test(rendererIdentity) ? 'reported-software-renderer' : 'hardware-unverified',
      note: 'Driver strings may be privacy masked. A non-software-looking string does not verify physical GPU use; headless is recorded separately.',
    }
    if (entered.status === 'ready') {
      await resultCheck(result, 'native-GLB-rendering-and-lazy-entry', async () => {
        assert.equal(new URL(page.url()).hash, '#/3d', 'Entering 3D must cross the isolated route boundary')
        assert(result.requests.some((request) => lazyChunks.includes(new URL(request.url).pathname)), 'No dynamic renderer entry requested')
        assert(result.requests.some((request) => request.url.endsWith('.glb')), 'No fixed GLB requested')
        assert(entered.renderer?.geometries > 0, 'Loaded GLB must allocate geometry')
        assert(entered.visual.materialMapCount > 0, 'The pinned textured fixture must have an actual decoded material map')
        assert.equal(entered.visual.clipCount, 1, 'The pinned textured fixture must retain its animation clip')
        const load = entered.telemetry.loads.at(-1)
        assert.equal(load.hashVerified, true)
        assert.equal(load.sha256, fixtureManifest[entered.fixture].sha256)
        assert.equal(load.byteLength, fixtureManifest[entered.fixture].byteLength)
        await screenshot(page, result, 'native-ready')
        return entered
      })
      stage = 'warm-reload'
      await resultCheck(result, 'warm-fixed-fixture-reload', async () => {
        const start = performance.now()
        await page.evaluate(() => window.__m10a.loadFixture('textured'))
        const state = await ready(page)
        result.measurements.warmReload = { wallMs: performance.now() - start, cacheState: report.cachePolicy.warm, telemetry: state.telemetry }
        return result.measurements.warmReload
      })
      stage = 'properties'
      await resultCheck(result, 'one-runtime-property-snapshot-drives-presentation', async () => {
        await page.evaluate(() => window.__m10a.setProperties({ visible: false, color: '#11aa55', playing: false }))
        await page.waitForFunction(() => {
          const visual = window.__m10a.snapshot().visual
          return visual.visible === false && visual.color === '#11aa55' && visual.playing === false
        })
        const hidden = await snapshot(page)
        assert.equal(hidden.visual.visible, false)
        assert.equal(hidden.visual.color.toLowerCase(), '#11aa55')
        assert.equal(hidden.visual.playing, false)
        assert.equal(hidden.visual.snapshotFrozen, true)
        assert.equal(hidden.visual.groupVisible, false, 'Actual Three group must receive visibility')
        assert.equal(hidden.visual.materialColor, '#11aa55', 'Actual Three material must receive color')
        assert.equal(hidden.visual.mixerTimeScale, 0, 'Actual Three mixer must pause')
        assert.deepEqual({ visible: hidden.effective.visible, color: hidden.effective.color, playing: hidden.effective.playing }, { visible: false, color: '#11aa55', playing: false })
        const referenceHidden = await page.getByTestId('reference-2d').locator('.reference-shape').evaluate((element) => ({ visibility: getComputedStyle(element).visibility, color: getComputedStyle(element).backgroundColor }))
        assert.deepEqual(referenceHidden, { visibility: 'hidden', color: 'rgb(17, 170, 85)' })
        await screenshot(page, result, 'properties-hidden')
        await page.evaluate(() => window.__m10a.setProperties({ visible: true, color: '#dd4422', playing: true }))
        await page.waitForFunction(() => {
          const visual = window.__m10a.snapshot().visual
          return visual.visible === true && visual.color === '#dd4422' && visual.playing === true
        })
        const active = await snapshot(page)
        assert.equal(active.visual.visible, true)
        assert.equal(active.visual.color.toLowerCase(), '#dd4422')
        assert.equal(active.visual.playing, true)
        assert.equal(active.visual.groupVisible, true)
        assert.equal(active.visual.materialColor, '#dd4422')
        assert.equal(active.visual.mixerTimeScale, 1)
        await page.waitForTimeout(180)
        const animated = await snapshot(page)
        assert.notEqual(animated.visual.animationTime, active.visual.animationTime, 'The loaded clip must advance while playing')
        await page.evaluate(() => window.__m10a.setProperties({ playing: false }))
        await page.waitForFunction(() => window.__m10a.snapshot().visual.playing === false)
        const paused = await snapshot(page)
        await page.waitForTimeout(100)
        assert.equal((await snapshot(page)).visual.animationTime, paused.visual.animationTime, 'Paused clip must stop advancing')
        return { hidden, active, animated, paused }
      })
      stage = 'pointer'
      const picked = await resultCheck(result, 'raycast-maps-native-pointer-to-logical-id', () => pickWithPointer(page))
      if (picked) {
        for (const mode of ['translate', 'rotate', 'scale']) {
          await resultCheck(result, `pointer-${mode}-arbitration-one-history-command`, () => pointerTransform(page, mode))
        }
        await resultCheck(result, 'escape-cancels-pointer-gesture-without-history', () => pointerTransform(page, 'translate', true))
      } else notVerified(result, 'native-transform-gestures', 'Picking prerequisite failed')
      stage = 'reference-measurement'
      await resultCheck(result, 'reference-fixture-frame-and-resource-measurements', async () => {
        await page.evaluate(() => window.__m10a.loadFixture('reference'))
        const state = await ready(page)
        result.measurements.referenceLoaded = { state, heap: await heap(page) }
        for (const phase of ['idle', 'orbit', 'transform']) {
          result.measurements[phase] = {
            input: phase === 'idle' ? 'idle requestAnimationFrame scheduler cadence with demand rendering' : 'scripted adapter motion; not a native pointer benchmark',
            measuredQuantity: 'requestAnimationFrame intervals in milliseconds, not CPU/GPU render duration; renderedFrames reports demand-render activity separately',
            result: await page.evaluate(({ phase, frames }) => window.__m10a.measure({ phase, frames }), { phase, frames }),
          }
        }
        await screenshot(page, result, 'reference-scene')
        return { renderer: state.renderer, framesPerPhase: frames }
      })
      stage = 'disposal'
      await resultCheck(result, 'repeated-model-unload-reload-disposal', async () => {
        const cycles = []
        for (let cycle = 0; cycle < 3; cycle++) {
          await page.evaluate(() => window.__m10a.loadFixture('textured'))
          const loaded = await ready(page)
          await page.evaluate(() => window.__m10a.unload())
          const unloaded = await snapshot(page)
          cycles.push({ cycle, loaded: rendererCounts(loaded), unloaded: rendererCounts(unloaded), telemetry: unloaded.telemetry })
          assert.equal(unloaded.renderer.geometries, 0, 'Model geometry must be released after unload')
          assert.equal(unloaded.renderer.textures, 0, 'Model textures must be released after unload')
        }
        result.measurements.disposal = { cycles, heapAfterUnload: await heap(page), note: 'Renderer-owned counters and browser heap estimates; no forced GC or process-wide leak claim' }
        return result.measurements.disposal
      })
      stage = 'load-cancellation'
      await resultCheck(result, 'delayed-load-cannot-repopulate-after-unload', async () => {
        let requestReached
        const reached = new Promise((resolve) => { requestReached = resolve })
        let release
        const released = new Promise((resolve) => { release = resolve })
        const routePattern = '**/fixtures/triangle.glb'
        await page.route(routePattern, async (route) => {
          requestReached()
          await released
          await route.fulfill({ status: 200, contentType: 'model/gltf-binary', body: await readFile(path.join(spikeRoot, 'dist/fixtures/triangle.glb')) }).catch(() => {})
        })
        await page.evaluate(() => { void window.__m10a.loadFixture('triangle') })
        try {
          await Promise.race([reached, new Promise((_, reject) => setTimeout(() => reject(new Error('Delayed request did not begin')), 10000))])
          await page.evaluate(() => window.__m10a.unload())
        } finally { release() }
        await page.waitForTimeout(300)
        await page.unroute(routePattern)
        const state = await snapshot(page)
        assert.equal(state.renderer.geometries, 0)
        assert.equal(state.renderer.textures, 0)
        assert.notEqual(state.status, 'ready', 'A stale load must not publish ready state')
        return { input: 'real HTTP response delayed by Playwright route, then explicit user unload', state }
      })
      stage = 'digest-rejection'
      await resultCheck(result, 'modified-fixed-GLB-rejected-before-loader', async () => {
        const body = Buffer.from(await readFile(path.join(spikeRoot, 'dist/fixtures/triangle.glb')))
        body[body.length - 1] ^= 1
        await page.route('**/fixtures/triangle.glb', (route) => route.fulfill({ status: 200, contentType: 'model/gltf-binary', body }))
        try {
          await page.evaluate(() => window.__m10a.loadFixture('triangle'))
          const state = await waitSettled(page)
          assert.equal(state.status, 'error')
          assert.match(JSON.stringify(state), /FIXTURE_DIGEST_MISMATCH/)
          await page.getByTestId('status').filter({ hasText: 'FIXTURE_DIGEST_MISMATCH' }).waitFor()
          assert.equal(state.renderer.geometries, 0)
          assert.equal(state.renderer.textures, 0)
          await screenshot(page, result, 'digest-rejection')
          return state
        } finally { await page.unroute('**/fixtures/triangle.glb') }
      })
      stage = 'context-loss'
      await resultCheck(result, 'webgl-lose-context-error-ui', async () => {
        await page.evaluate(() => window.__m10a.loadFixture('textured'))
        await ready(page)
        await page.evaluate(() => window.__m10a.forceContextLoss())
        await page.waitForFunction(() => window.__m10a.snapshot().status === 'context-lost')
        await page.getByTestId('status').filter({ hasText: 'context-lost' }).waitFor()
        const state = await snapshot(page)
        await screenshot(page, result, 'context-loss')
        return { trigger: 'WEBGL_lose_context / Three forceContextLoss; deterministic injection, not spontaneous GPU failure', state }
      })
      stage = 'exit-reentry'
      await resultCheck(result, 'adapter-exit-and-fresh-reentry', async () => {
        await page.getByTestId('exit-3d').click()
        await page.waitForFunction(() => window.__m10a.snapshot().status === 'shell')
        const exited = await snapshot(page)
        assert.notEqual(new URL(page.url()).hash, '#/3d', 'Leaving 3D must leave the route')
        await page.getByTestId('enter-3d').click()
        const reentered = await ready(page)
        return { exited, reentered }
      })
      stage = 'context-loss-during-load'
      await resultCheck(result, 'delayed-load-cannot-publish-after-context-loss', async () => {
        let requestReached
        const reached = new Promise((resolve) => { requestReached = resolve })
        let release
        const released = new Promise((resolve) => { release = resolve })
        const routePattern = '**/fixtures/triangle.glb'
        await page.route(routePattern, async (route) => {
          requestReached()
          await released
          await route.fulfill({ status: 200, contentType: 'model/gltf-binary', body: await readFile(path.join(spikeRoot, 'dist/fixtures/triangle.glb')) }).catch(() => {})
        })
        try {
          await page.evaluate(() => { void window.__m10a.loadFixture('triangle') })
          await Promise.race([reached, new Promise((_, reject) => setTimeout(() => reject(new Error('Delayed request did not begin')), 10000))])
          await page.evaluate(() => window.__m10a.forceContextLoss())
          await page.waitForFunction(() => window.__m10a.snapshot().status === 'context-lost')
        } finally { release() }
        await page.waitForTimeout(300)
        await page.unroute(routePattern)
        const state = await snapshot(page)
        assert.equal(state.status, 'context-lost', 'A stale response must not resurrect a lost context')
        assert.equal(state.fixture, null)
        assert.equal(state.renderer.geometries, 0)
        return { trigger: 'delayed real HTTP response and injected WEBGL_lose_context', state }
      })
      stage = 'decode-cancellation'
      await resultCheck(result, 'decoded-stale-model-releases-bitmap-and-cannot-publish', async () => {
        await page.addInitScript(() => {
          if (new URLSearchParams(location.search).get('decodeDelay') !== '1') return
          let release
          const gate = new Promise((resolve) => { release = resolve })
          const probe = { entered: false, bitmapsClosed: 0, release: () => release() }
          window.__m10aDecodeProbe = probe
          const nativeDecode = window.createImageBitmap.bind(window)
          const nativeClose = ImageBitmap.prototype.close
          ImageBitmap.prototype.close = function () { probe.bitmapsClosed++; return nativeClose.call(this) }
          window.createImageBitmap = async (...parameters) => {
            const bitmap = await nativeDecode(...parameters)
            probe.entered = true
            await gate
            return bitmap
          }
        })
        const url = new URL(baseURL)
        url.searchParams.set('decodeDelay', '1')
        await page.goto(url.href, { waitUntil: 'networkidle' })
        await page.getByTestId('enter-3d').click()
        await page.waitForFunction(() => window.__m10aDecodeProbe?.entered === true)
        await page.evaluate(() => window.__m10a.unload())
        await page.evaluate(() => window.__m10aDecodeProbe.release())
        await page.waitForFunction(() => window.__m10a.snapshot().telemetry.staleDiscards > 0)
        const state = await snapshot(page)
        const probe = await page.evaluate(() => ({ entered: window.__m10aDecodeProbe.entered, bitmapsClosed: window.__m10aDecodeProbe.bitmapsClosed }))
        assert.notEqual(state.status, 'ready')
        assert.equal(state.fixture, null)
        assert.equal(state.renderer.geometries, 0)
        assert(probe.bitmapsClosed > 0, 'Decoded stale ImageBitmap must be explicitly closed')
        assert.equal(state.telemetry.ownedObjectURLs, 0, 'Decoded stale image must leave no loader-owned URL')
        return { input: 'real native bitmap decode completed, return to GLTFLoader gated by test script until user unload; then normal stale-generation branch runs', probe, state }
      })
      stage = 'texture-decode-failure'
      await resultCheck(result, 'texture-decode-failure-does-not-publish-ready-or-leak-object-URLs', async () => {
        await page.addInitScript(() => {
          if (new URLSearchParams(location.search).get('decodeFailure') !== '1') return
          window.createImageBitmap = async () => { throw new Error('INJECTED_TEXTURE_DECODE_FAILURE') }
        })
        const url = new URL(baseURL)
        url.searchParams.set('decodeFailure', '1')
        await page.goto(url.href, { waitUntil: 'networkidle' })
        await page.getByTestId('enter-3d').click()
        const state = await waitSettled(page)
        assert.equal(state.status, 'error', 'A required texture decode failure must not publish ready')
        assert.match(state.error, /TEXTURE|RESOURCE|DECODE/i)
        await page.getByTestId('status').filter({ hasText: 'error' }).waitFor()
        assert.equal(state.renderer.geometries, 0)
        assert.equal(state.telemetry.ownedObjectURLs, 0, 'Every loader-owned object URL must be revoked on failure')
        await screenshot(page, result, 'texture-decode-failure')
        return { input: 'createImageBitmap deterministic rejection injected before loading the trusted fixed fixture', state }
      })
      stage = 'texture-capability-boundary'
      await resultCheck(result, 'oversized-for-device-fixture-rejected-before-fetch', async () => {
        await page.addInitScript(() => {
          if (new URLSearchParams(location.search).get('textureLimit') !== '1') return
          const prototype = WebGL2RenderingContext.prototype
          const getParameter = prototype.getParameter
          prototype.getParameter = function (parameter) {
            return parameter === this.MAX_TEXTURE_SIZE ? 2048 : getParameter.call(this, parameter)
          }
        })
        const url = new URL(baseURL)
        url.searchParams.set('textureLimit', '1')
        await page.goto(url.href, { waitUntil: 'networkidle' })
        await page.getByTestId('enter-3d').click()
        await ready(page)
        const requestsBefore = result.requests.length
        await page.evaluate(() => window.__m10a.loadFixture('texture-4096'))
        const state = await snapshot(page)
        assert.equal(state.status, 'unsupported')
        assert.equal(state.error, 'FIXTURE_TEXTURE_EXCEEDS_DEVICE_CAPABILITY')
        assert.equal(state.capability.maxTextureSize, 2048)
        assert.equal(state.fixture, null)
        assert.equal(state.renderer.geometries, 0)
        assert.equal(state.renderer.textures, 0)
        assert.equal(state.renderer.programs, 0)
        assert.equal(state.telemetry.ownedObjectURLs, 0)
        assert(!result.requests.slice(requestsBefore).some((request) => request.url.includes('/boundary-fixtures/')), 'Unsupported dimensions must be rejected before fetching target bytes')
        return { input: 'MAX_TEXTURE_SIZE report injected as 2048; actual device limit remains separately recorded', state }
      })
      stage = 'first-render-allocation-failure'
      await resultCheck(result, 'first-render-failure-releases-attached-model', async () => {
        await page.addInitScript(() => {
          if (new URLSearchParams(location.search).get('renderFailure') !== '1') return
          const probe = { drew: false, injected: false }
          window.__m10aRenderProbe = probe
          const prototype = WebGL2RenderingContext.prototype
          const drawElements = prototype.drawElements
          const getError = prototype.getError
          prototype.drawElements = function (...parameters) {
            const value = drawElements.apply(this, parameters)
            probe.drew = true
            return value
          }
          prototype.getError = function () {
            if (probe.drew && !probe.injected) { probe.injected = true; return this.OUT_OF_MEMORY }
            return getError.call(this)
          }
        })
        const url = new URL(baseURL)
        url.searchParams.set('renderFailure', '1')
        await page.goto(url.href, { waitUntil: 'networkidle' })
        await page.getByTestId('enter-3d').click()
        const state = await waitSettled(page)
        assert.equal(state.status, 'error')
        assert.equal(state.error, 'WEBGL_FIRST_RENDER_ERROR_1285')
        assert.equal(state.fixture, null)
        assert.equal(state.renderer.geometries, 0)
        assert.equal(state.renderer.textures, 0)
        assert.equal(state.renderer.programs, 0)
        assert.equal(state.telemetry.ownedObjectURLs, 0)
        assert.equal(state.telemetry.loads.length, 0, 'A failed first submission must not publish successful load telemetry')
        const disposal = state.telemetry.disposals.at(-1)
        assert.equal(disposal.released.imagesClosed, 1)
        const probe = await page.evaluate(() => window.__m10aRenderProbe)
        assert.equal(probe.injected, true)
        await screenshot(page, result, 'first-render-failure')
        return { input: 'OUT_OF_MEMORY return injected once after a real indexed draw; not an actual memory-exhaustion test', probe, state }
      })
    } else {
      notVerified(result, 'native-rendering-and-interaction', `Native renderer did not become ready: ${JSON.stringify(entered)}`)
      await resultCheck(result, 'native-unavailable-is-explicit-ui', async () => {
        assert.equal(entered.status, 'unsupported')
        await page.getByRole('alert').first().waitFor()
        await screenshot(page, result, 'native-unavailable')
        return entered
      })
    }
    stage = 'injected-unsupported'
    await resultCheck(result, 'injected-unsupported-ui', async () => {
      const url = new URL(baseURL)
      url.searchParams.set('unsupported', '1')
      await page.goto(url.href, { waitUntil: 'networkidle' })
      await page.getByTestId('enter-3d').click()
      const state = await waitSettled(page)
      assert.equal(state.status, 'unsupported')
      await page.getByRole('alert').first().waitFor()
      await screenshot(page, result, 'injected-unsupported')
      return { nativeCapabilityEvidence: false, input: '?unsupported=1 deterministic test injection', state }
    })
    await resultCheck(result, 'no-hidden-network-dependencies-or-page-errors', async () => {
      assert.deepEqual(result.blockedRequests, [], 'Requests outside built local resources are forbidden')
      assert.deepEqual(result.pageErrors, [], 'Unexpected uncaught browser errors')
      return { requestCount: result.requests.length, blockedCount: result.blockedRequests.length, console: result.console }
    })
  } catch (error) {
    result.checks.push({ name: `unhandled-${stage}`, status: 'failed', error: errorText(error) })
    await screenshot(page, result, 'failure').catch(() => {})
  } finally {
    await context.close()
    await browser.close()
  }
}

for (const name of browserNames) {
  await runBrowser(name)
  await writeFile(path.join(outputRoot, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
}
report.completedAt = new Date().toISOString()
report.summary = {
  passed: report.browsers.flatMap((browser) => browser.checks).filter((check) => check.status === 'passed').length,
  failed: report.browsers.flatMap((browser) => browser.checks).filter((check) => check.status === 'failed').length,
  notVerified: report.browsers.flatMap((browser) => browser.checks).filter((check) => check.status === 'not-verified').length,
  budgetVerdict: 'not evaluated; target hardware and later quantitative budgets require a separate decision',
}
await writeFile(path.join(outputRoot, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify({ report: path.join(outputRoot, 'report.json'), ...report.summary }, null, 2))
if (report.summary.failed > 0) process.exitCode = 1
else if (report.summary.notVerified > 0) process.exitCode = 2
