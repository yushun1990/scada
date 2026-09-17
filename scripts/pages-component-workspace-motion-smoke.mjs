import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'http://127.0.0.1:4173/').replace(/\/?$/, '/')
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
})
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const button = (name) => page.getByRole('button', { name, exact: true })

async function sampleSwitch(name, reverseName) {
  return page.evaluate(async ({ name, reverseName }) => {
    const box = (selector) => document.querySelector(selector).getBoundingClientRect()
    const click = (label) => document.querySelector(`button[aria-label="${label}"]`).click()
    const frames = []
    const start = performance.now()
    let reversed = false
    const originalNavigation = box('.component-workpage-navigation')
    const originalControl = box('.component-workpage-switch')
    click(name)
    while (performance.now() - start < 650 || document.querySelector('.component-workspace').getAnimations().some((animation) => animation.playState === 'running')) {
      await new Promise(requestAnimationFrame)
      const canvas = box('#component-canvas-page')
      const definition = box('#component-definition-page')
      const toolbar = box('.studio-main-toolbar')
      const navigation = box('.component-workpage-navigation')
      const workspace = box('.component-workspace')
      const control = box('.component-workpage-switch')
      const designSegment = box('.component-workpage-switch [aria-label="图形化设计"]')
      const definitionSegment = box('.component-workpage-switch [aria-label="Coding 开发"]')
      const controlStyle = getComputedStyle(document.querySelector('.component-workpage-switch'))
      const navigationStyle = getComputedStyle(document.querySelector('.component-workpage-navigation'))
      frames.push({
        canvas: canvas.width,
        definition: definition.width,
        total: workspace.width,
        toolbar: toolbar.width,
        navigation: navigation.width,
        toolbarConfiguration: workspace.width - toolbar.width,
        navigationOffset: navigation.x - originalNavigation.x,
        navigationResize: navigation.width - originalNavigation.width,
        controlOffsetX: control.x - originalControl.x,
        controlOffsetY: control.y - originalControl.y,
        controlResize: control.width - originalControl.width,
        divider: parseFloat(navigationStyle.borderLeftWidth),
        insetLeft: control.x - navigation.x,
        insetRight: navigation.right - control.right,
        segmentGap: definitionSegment.x - designSegment.right,
        controlLeft: control.x - workspace.x,
        controlRight: workspace.right - control.right,
        collapsedLane: navigation.width,
        controlRadius: parseFloat(controlStyle.borderTopLeftRadius),
      })
      if (reverseName && !reversed && canvas.width > navigation.width + 10 && definition.width > navigation.width + 10) {
        click(reverseName)
        reversed = true
      }
    }
    return frames
  }, { name, reverseName })
}

function assertFrames(frames, active, animated = true) {
  for (const frame of frames) {
    assert.ok(frame.canvas >= frame.navigation - 1 && frame.definition >= frame.navigation - 1, 'both pages retain at least the full navigation region width')
    assert.ok(Math.abs(frame.canvas + frame.definition - frame.total) <= 1, 'pages fill the workspace without overlap or gaps')
    assert.ok(Math.abs(frame.canvas - frame.toolbar) <= 1, 'design toolbar follows the canvas on every frame')
    assert.ok(Math.abs(frame.definition - frame.toolbarConfiguration) <= 1, 'configuration toolbar follows its page while navigation stays fixed')
    assert.ok(Math.abs(frame.navigationOffset) < 0.1 && Math.abs(frame.navigationResize) < 0.1, 'entire navigation region stays fixed throughout switching')
    assert.ok(Math.abs(frame.controlOffsetX) < 0.1 && Math.abs(frame.controlOffsetY) < 0.1 && Math.abs(frame.controlResize) < 0.1, 'segmented control position and outer size never move during switching')
    assert.equal(frame.divider, 1, 'navigation retains its visible separator from the tools')
    assert.ok(frame.insetLeft >= 3 && frame.insetRight >= 3, 'control retains its own padded region instead of touching the edges')
    assert.ok(Math.abs(frame.segmentGap) <= 1, 'segments stay joined throughout the transition')
    assert.ok(frame.controlLeft >= -1 && frame.controlRight >= -1, 'joined control remains fully within the toolbar')
    assert.ok(frame.controlRadius > 20, 'switch retains its rounded capsule shape')
  }
  const last = frames.at(-1)
  assert.ok(Math.abs(last[active === 'canvas' ? 'definition' : 'canvas'] - last.collapsedLane) <= 1, `inactive page equals the entire navigation region, including both segments and their surrounding space: ${JSON.stringify(last)}`)
  assert.ok(last[active] > last.collapsedLane, 'active page uses the remaining space')
  if (animated) {
    assert.ok(frames.some((frame) => frame.canvas > frame.navigation + 10 && frame.definition > frame.navigation + 10), 'switch must pass through intermediate widths')
  }
}

try {
  await page.goto(`${baseUrl}#/components/new`, { waitUntil: 'networkidle' })
  await page.locator('.component-artboard').waitFor()
  const palette = page.getByRole('region', { name: '组件创作素材' })
  await palette.getByRole('button', { name: '矩形', exact: true }).dblclick()
  const selected = page.locator('.component-layer-row.active')
  const selectedText = await selected.textContent()
  const artboard = await page.locator('.component-artboard').elementHandle()
  const commands = await page.locator('.component-edit-command-host').elementHandle()

  assertFrames(await sampleSwitch('Coding 开发'), 'definition')
  assert.equal(await selected.textContent(), selectedText, 'switch preserves layer selection')
  assert.equal(await artboard.evaluate((element) => element.isConnected), true, 'canvas stays mounted')
  assert.equal(await commands.evaluate((element) => element.isConnected), true, 'toolbar hosts stay mounted')
  assert.equal(await button('撤销').count(), 0, 'collapsed commands are absent from the accessibility tree')
  assert.equal(await page.locator('.component-canvas-page-content').evaluate((element) => element.inert), true)

  const name = page.locator('.component-root-inspector label').filter({ has: page.getByText('名称', { exact: true }) }).locator('input')
  await name.fill('伸缩切换测试')
  await name.press('Tab')
  const definition = await page.locator('.component-definition-page-content').elementHandle()
  const scrollTop = await definition.evaluate((element) => {
    element.scrollTop = 180
    return element.scrollTop
  })
  assert.ok(scrollTop > 0)
  assertFrames(await sampleSwitch('图形化设计'), 'canvas')
  assert.equal(await page.locator('.component-definition-page-content').evaluate((element) => element.inert), true)
  assertFrames(await sampleSwitch('Coding 开发'), 'definition')
  assert.equal(await name.inputValue(), '伸缩切换测试', 'configuration draft survives a round trip')
  assert.equal(await definition.evaluate((element) => element.scrollTop), scrollTop, 'configuration scroll position survives a round trip')

  assertFrames(await sampleSwitch('图形化设计', 'Coding 开发'), 'definition')
  for (const width of [1200, 1000, 600]) {
    await page.setViewportSize({ width, height: 800 })
    // Responsive dock changes are separate from switching pages. Establish
    // the new viewport's settled coordinates before asserting a fixed switch.
    await page.evaluate(async () => {
      let stableFrames = 0
      while (stableFrames < 3) {
        await new Promise(requestAnimationFrame)
        const moving = [...document.querySelectorAll('.studio-canvas-toolbar-row, .component-workspace')]
          .some((element) => element.getAnimations().some((animation) => animation.playState === 'running'))
        stableFrames = moving ? 0 : stableFrames + 1
      }
    })
    assertFrames(await sampleSwitch('图形化设计'), 'canvas')
    assertFrames(await sampleSwitch('Coding 开发'), 'definition')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `no page overflow at ${width}px`)
  }

  await page.emulateMedia({ reducedMotion: 'reduce' })
  assertFrames(await sampleSwitch('图形化设计'), 'canvas', false)
  assert.equal(await page.locator('.component-workspace').evaluate((element) => getComputedStyle(element).transitionDuration), '0s')
  await button('Coding 开发').focus()
  await page.keyboard.press('Enter')
  assert.equal(await button('Coding 开发').getAttribute('aria-pressed'), 'true', 'segmented control supports keyboard activation')
  assert.equal(await page.locator('.component-workpage-switch').count(), 1, 'one joined control owns switching')
  assert.equal(await page.locator('.component-workpage-trigger, .component-work-page-rail').count(), 0, 'no split buttons or extra rail contents')
  assert.equal(await page.locator('.component-canvas-page-content').evaluate((element) => getComputedStyle(element).opacity), '0', 'collapsed contents stay blank for now')
  assert.deepEqual(errors, [])
  console.log('Component workspace motion passed: fixed navigation with separator and padding, compressed pages matching the entire navigation region, synchronized frames, retained state/scroll, interrupted transitions, responsive widths, keyboard activation and reduced motion.')
} finally {
  await browser.close()
}
