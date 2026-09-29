// Drag-throughput evidence for a complex imported SVG layer on the component
// artboard. This is a measurement script, not an assertion smoke: it prints
// frame-interval statistics for a scripted drag so before/after numbers can be
// compared across renderer changes.
//
// Usage: SCADA_PAGES_URL=http://localhost:5199/ node scripts/pages-component-svg-drag-perf.mjs
import { chromium } from 'playwright'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'http://localhost:5199/').replace(/\/?$/, '/')
const cpuThrottle = Number(process.env.SCADA_CPU_THROTTLE ?? '1')

// A dense illustration: 2400 tiny colored paths inside a 1920x1440 viewBox.
// This viewBox rasterizes to an oversized bitmap under the pre-clamp upscale
// rule, which is the reported "complex SVG drags sluggishly" shape.
const shapes = []
for (let i = 0; i < 2400; i += 1) {
  const x = (i % 80) * 24
  const y = Math.floor(i / 80) * 24
  shapes.push(
    `<path d="M${x} ${y} h14 l7 8 l-7 8 h-14 z" fill="hsl(${i % 360},70%,55%)" opacity="0.9"/>`,
  )
}
const svgSource = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1440" viewBox="0 0 1920 1440">${shapes.join('')}</svg>`

async function measureDrag(label) {
  // A fresh browser per pass: SPA hash routing between component editors does
  // not reload the document, so decoded rasters from a previous pass would
  // otherwise leak into this pass's numbers.
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))

  if (cpuThrottle > 1) {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottle })
  }

  try {
    return await measureDragOnPage(page, label, errors)
  } finally {
    await browser.close()
  }
}

async function measureDragOnPage(page, label, errors) {
  await page.goto(`${baseUrl}#/components/new`, { waitUntil: 'load' })
  const fileInput = page.locator('.component-palette-resource-library .component-palette-resource-input')
  await fileInput.setInputFiles({
    name: `${label}.svg`,
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(svgSource),
  })
  const resource = page.locator('.component-palette-resource-item', { hasText: label })
  await resource.waitFor()
  await resource.dblclick()
  await page.locator('.component-layer-row', { hasText: label }).waitFor()

  const artboard = page.locator('.component-artboard')
  const box = await artboard.boundingBox()
  if (!box) throw new Error('component artboard must be measurable')

  // The placed 960x720 SVG is fitted into the 480x360 design space, so the
  // artboard center is inside the layer and starts a layer drag.
  const startX = box.x + box.width / 2
  const startY = box.y + box.height / 2

  // Wait for the rasterized layer to settle before measuring.
  await page.waitForTimeout(600)

  // Warm-up drag: forces the one-time vector rasterization/decode of the SVG
  // bitmap and the full drag pipeline, so the measured window below reflects
  // steady-state drag frames instead of a single first-draw decode stall.
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  for (let step = 1; step <= 3; step += 1) {
    await page.mouse.move(startX + step, startY + step)
  }
  await page.mouse.up()
  await page.waitForTimeout(500)

  await page.evaluate(() => {
    window.__perfFrames = []
    window.__perfLongTasks = []
    window.__perfLoafs = []
    const tick = (now) => {
      window.__perfFrames.push(now)
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) window.__perfLongTasks.push(entry.duration)
      }).observe({ entryTypes: ['longtask'] })
    } catch {
      // longtask unsupported in this browser
    }
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) window.__perfLoafs.push(entry.duration)
      }).observe({ entryTypes: ['long-animation-frame'] })
    } catch {
      // long-animation-frame unsupported in this browser
    }
  })

  const dragStart = await page.evaluate(() => performance.now())
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  for (let step = 1; step <= 40; step += 1) {
    await page.mouse.move(startX + step * 5, startY + step * 3)
  }
  await page.mouse.up()
  await page.waitForTimeout(250)

  const stats = await page.evaluate((startedAt) => {
    const frames = window.__perfFrames.filter((t) => t >= startedAt)
    const intervals = []
    for (let i = 1; i < frames.length; i += 1) {
      intervals.push(frames[i] - frames[i - 1])
    }
    intervals.sort((a, b) => a - b)
    const pick = (p) => (intervals.length ? Math.round(intervals[Math.min(intervals.length - 1, Math.floor(intervals.length * p))]) : null)
    const median = pick(0.5)
    const worst = intervals.length ? Math.round(intervals[intervals.length - 1]) : null
    // Count frames slower than 2x a 60fps budget as jank frames.
    const janky = intervals.filter((v) => v > 33.4).length
    const summarize = (values) => {
      if (!values.length) return { count: 0, total: 0, max: 0 }
      const total = Math.round(values.reduce((sum, v) => sum + v, 0))
      const max = Math.round(Math.max(...values))
      return { count: values.length, total, max }
    }
    return {
      frameCount: frames.length,
      median,
      worst,
      janky,
      longTask: summarize(window.__perfLongTasks),
      loaf: summarize(window.__perfLoafs),
    }
  }, dragStart)

  console.log(
    `[${label}] rafFrames=${stats.frameCount} median=${stats.median}ms worst=${stats.worst}ms janky(>33ms)=${stats.janky}` +
    ` | longTask(count=${stats.longTask.count} total=${stats.longTask.total}ms max=${stats.longTask.max}ms)` +
    ` | loaf(count=${stats.loaf.count} total=${stats.loaf.total}ms max=${stats.loaf.max}ms)` +
    (errors.length ? ` | pageErrors=${errors.length}` : ''),
  )
  return stats
}

try {
  await measureDrag('warmup')
  await measureDrag('complex-svg-drag pass1')
  await measureDrag('complex-svg-drag pass2')
  await measureDrag('complex-svg-drag pass3')
} finally {
  // Browsers are closed per pass inside measureDrag.
}
