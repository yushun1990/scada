// Reproduce the reported regression: dragging SIMPLE svg / plain image layers
// feels like it can't keep up with the pointer, while complex SVGs are smooth.
// Measures rAF frame intervals and pointermove delivery during a scripted drag
// for two fixtures: a small simple SVG and a plain PNG image.
import { chromium } from 'playwright'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'http://localhost:5199/').replace(/\/?$/, '/')
const cpuThrottle = Number(process.env.SCADA_CPU_THROTTLE ?? '1')

const simpleSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80"><rect id="body" x="10" y="10" width="100" height="60" fill="#94a3b8" rx="6"/><circle cx="35" cy="40" r="12" fill="#475569"/><rect x="70" y="30" width="24" height="20" fill="#38bdf8"/></svg>`

// The dense bystander: placed on the canvas but never dragged. Its raster
// repaints every frame while OTHER layers drag, which is the reported
// "every layer goes sluggish once a complex SVG is on the canvas" shape.
const bystanderShapes = []
for (let i = 0; i < 2400; i += 1) {
  const x = (i % 80) * 24
  const y = Math.floor(i / 80) * 24
  bystanderShapes.push(`<path d="M${x} ${y} h14 l7 8 l-7 8 h-14 z" fill="hsl(${i % 360},70%,55%)" opacity="0.9"/>`)
}
const bystanderSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1440" viewBox="0 0 1920 1440">${bystanderShapes.join('')}</svg>`

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
const cdp = await page.context().newCDPSession(page)
if (cpuThrottle > 1) {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottle })
}

// Produce a plain PNG (400x300 photo-like gradient) inside the browser.
await page.goto(baseUrl, { waitUntil: 'load' })
const pngBuffer = Buffer.from(
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 400
    canvas.height = 300
    const ctx = canvas.getContext('2d')
    const gradient = ctx.createLinearGradient(0, 0, 400, 300)
    gradient.addColorStop(0, '#0ea5e9')
    gradient.addColorStop(1, '#1e293b')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 400, 300)
    ctx.fillStyle = '#f8fafc'
    for (let i = 0; i < 40; i += 1) ctx.fillRect((i * 37) % 380, (i * 53) % 280, 14, 9)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
    const arrayBuffer = await blob.arrayBuffer()
    return Array.from(new Uint8Array(arrayBuffer))
  }),
)

async function placeFile(label, file) {
  const fileInput = page.locator('.component-palette-resource-library .component-palette-resource-input')
  await fileInput.setInputFiles(file)
  const resource = page.locator('.component-palette-resource-item', { hasText: label })
  await resource.waitFor()
  await resource.dblclick()
  await page.locator('.component-layer-row', { hasText: label }).waitFor()
}

async function measureDrag(label, file, bystander) {
  await page.goto(`${baseUrl}#/components/new`, { waitUntil: 'load' })
  if (bystander) {
    await placeFile(bystander.label, bystander.file)
  }
  await placeFile(label, file)

  const artboard = page.locator('.component-artboard')
  const box = await artboard.boundingBox()
  const startX = box.x + box.width / 2
  const startY = box.y + box.height / 2
  await page.waitForTimeout(600)

  // warm-up drag
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  for (let step = 1; step <= 3; step += 1) await page.mouse.move(startX + step, startY + step)
  await page.mouse.up()
  await page.waitForTimeout(400)

  await page.evaluate(() => {
    window.__perfFrames = []
    window.__perfMoves = 0
    window.__perfLongTasks = []
    const tick = (now) => {
      window.__perfFrames.push(now)
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    window.addEventListener('pointermove', () => { window.__perfMoves += 1 })
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) window.__perfLongTasks.push(entry.duration)
      }).observe({ entryTypes: ['longtask'] })
    } catch { /* unsupported */ }
  })

  const dragStart = await page.evaluate(() => performance.now())
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  // Real mice fire 125-1000Hz; step-interpolated moves approximate that rate
  // so per-event queueing (the "can't keep up with the pointer" mechanism)
  // shows up in frame pacing.
  for (let step = 1; step <= 40; step += 1) {
    await page.mouse.move(startX + step * 5, startY + step * 3, { steps: 8 })
  }
  await page.mouse.up()
  await page.waitForTimeout(250)

  const stats = await page.evaluate((startedAt) => {
    const frames = window.__perfFrames.filter((t) => t >= startedAt)
    const intervals = []
    for (let i = 1; i < frames.length; i += 1) intervals.push(frames[i] - frames[i - 1])
    intervals.sort((a, b) => a - b)
    const pick = (p) => (intervals.length ? Math.round(intervals[Math.min(intervals.length - 1, Math.floor(intervals.length * p))]) : null)
    const janky = intervals.filter((v) => v > 33.4).length
    const lt = window.__perfLongTasks
    return {
      frameCount: frames.length,
      median: pick(0.5),
      p95: pick(0.95),
      worst: intervals.length ? Math.round(intervals[intervals.length - 1]) : null,
      janky,
      moves: window.__perfMoves,
      longTasks: lt.length ? `${lt.length}x total=${Math.round(lt.reduce((s, v) => s + v, 0))}ms max=${Math.round(Math.max(...lt))}ms` : 'none',
    }
  }, dragStart)

  console.log(
    `[${label}] frames=${stats.frameCount} median=${stats.median}ms p95=${stats.p95}ms worst=${stats.worst}ms janky=${stats.janky} pointermoves=${stats.moves} longTask=${stats.longTasks}`,
  )
}

try {
  await measureDrag('warmup-only', { name: 'warmup-only.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(simpleSvg) })
  await measureDrag('simple-shape', { name: 'simple-shape.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(simpleSvg) })
  await measureDrag('plain-photo', { name: 'plain-photo.png', mimeType: 'image/png', buffer: pngBuffer })
  await measureDrag(
    'target-simple',
    { name: 'target-simple.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(simpleSvg) },
    { label: 'dense-bystander', file: { name: 'dense-bystander.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(bystanderSvg) } },
  )
} finally {
  await browser.close()
}
