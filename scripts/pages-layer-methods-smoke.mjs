import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'
import {
  readPersistedComponent,
  saveAndWait,
} from './pages-component-fixture-storage.mjs'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'https://yushun1990.github.io/scada/')
  .replace(/\/?$/, '/')
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(error.message))

// The SVG carries semantic theme classes so built-in theme functions appear.
const svgSource = `
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80">
  <g id="body">
    <rect id="lamp" class="scada-theme-base" x="10" y="10" width="100" height="60" fill="#64748b"/>
  </g>
</svg>
`.trim()

function globalAssetImportControl(currentPage) {
  return currentPage.getByRole('region', { name: '组件创作素材' })
}

function findVisualLayer(document, kind, name) {
  return document.visual.layers.find((layer) => layer.kind === kind && layer.name === name)
}

async function waitForDenseCanvasColor(currentPage, matcher) {
  await currentPage.waitForFunction((expected) => {
    const canvases = [...document.querySelectorAll('canvas')]
    return canvases.some((canvas) => {
      const context = canvas.getContext('2d')
      if (!context || canvas.width <= 0 || canvas.height <= 0) return false
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      for (let index = 0; index < pixels.length; index += 4) {
        const red = pixels[index]
        const green = pixels[index + 1]
        const blue = pixels[index + 2]
        const alpha = pixels[index + 3]
        if (
          alpha >= expected.alphaMin &&
          red >= expected.redMin && red <= expected.redMax &&
          green >= expected.greenMin && green <= expected.greenMax &&
          blue >= expected.blueMin && blue <= expected.blueMax
        ) return true
      }
      return false
    })
  }, matcher)
}

try {
  console.log(`Verifying SVG layer methods (issue #209 behavior tab): ${baseUrl}#/components/new`)
  await page.goto(`${baseUrl}#/components/new`, { waitUntil: 'networkidle' })
  await page.locator('.studio-shell.component-studio-shell').waitFor()

  const importControl = globalAssetImportControl(page)
  const input = importControl.locator('.component-palette-resource-library input[type="file"]')
  await input.waitFor({ state: 'attached' })
  await input.setInputFiles({
    name: 'theme-lamp.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(svgSource),
  })
  await page.locator('.component-palette-resource-item', { hasText: 'theme-lamp' }).dblclick()
  await page.locator('.component-layer-row', { hasText: 'theme-lamp' }).waitFor()

  // 属性 tab: the SVG group lists auto-detected ids/classes and no resource group.
  await page.locator('.component-svg-tag-card')
    .filter({ has: page.locator('.component-svg-tag-name', { hasText: /^lamp$/ }) })
    .first()
    .waitFor()
  assert.equal(
    await page.locator('.inspector-group-title', { hasText: '资源' }).count(),
    0,
    'SVG layers must not render a standalone resource group',
  )

  // 行为 tab: built-in theme functions appear with edit and run actions.
  await page.getByRole('tab', { name: '行为', exact: true }).click()
  const methodsGroup = page.locator('.inspector-collapsible')
    .filter({ has: page.locator('.inspector-group-title', { hasText: 'SVG 图层函数' }) })
    .first()
  await methodsGroup.waitFor()
  const setRunningRow = methodsGroup.locator('.component-method-item', { hasText: 'setRunning' })
  await setRunningRow.waitFor()
  await setRunningRow.getByLabel('setRunning 运行预览').click()
  await setRunningRow.locator('.component-method-run-result.is-ok').waitFor()
  await waitForDenseCanvasColor(page, {
    alphaMin: 80,
    redMin: 0,
    redMax: 90,
    greenMin: 120,
    greenMax: 255,
    blueMin: 0,
    blueMax: 120,
  })

  // 新增函数: author a custom function through the 198-style code modal.
  await methodsGroup.getByRole('button', { name: '+ 新增函数' }).click()
  const modal = page.locator('.component-method-implementation-modal')
  await modal.waitFor()
  await modal.getByLabel('函数标识名').fill('applyLevel')
  await modal.getByLabel('函数简介说明').fill('应用等级')
  await modal.getByRole('button', { name: '⚙️ 多态切换 (运行/待机)' }).click()
  const codeArea = modal.locator('.component-method-code-textarea')
  await codeArea.waitFor()
  await codeArea.fill(`/**
 * 等级驱动主题
 */
function applyLevel(state = 'running') {
  const validThemes = ['running', 'alarm', 'warning', 'standby', 'offline', 'default'];
  if (validThemes.includes(state)) {
    $emit('LEVEL_APPLIED', { state });
    console.log('theme applied');
    return $self.setTheme(state);
  }
  return $self.setTheme('default');
}`)
  await modal.getByRole('button', { name: '保存方法实现' }).click()
  await modal.waitFor({ state: 'detached' })

  const customRow = methodsGroup.locator('.component-method-item', { hasText: 'applyLevel' })
  await customRow.waitFor()
  await customRow.getByLabel('applyLevel 运行预览').click()
  const customResult = customRow.locator('.component-method-run-result.is-ok')
  await customResult.waitFor()
  assert.match(await customResult.textContent() ?? '', /running/)
  assert.match(await customResult.textContent() ?? '', /\[emit\] LEVEL_APPLIED/)
  assert.match(await customResult.textContent() ?? '', /\[log\] theme applied/)

  // The theme ops applied to the canvas keep the running-green rendering.
  await waitForDenseCanvasColor(page, {
    alphaMin: 80,
    redMin: 0,
    redMax: 90,
    greenMin: 120,
    greenMax: 255,
    blueMin: 0,
    blueMax: 120,
  })

  await saveAndWait(page)
  const persisted = await readPersistedComponent(page)
  const svgLayer = findVisualLayer(persisted.document, 'svg', 'theme-lamp')
  assert.ok(svgLayer?.methods, 'authored methods must persist on the SVG layer')
  assert.equal(svgLayer.methods.length, 1)
  assert.equal(svgLayer.methods[0].name, 'applyLevel')
  assert.equal(svgLayer.methods[0].title, '应用等级')
  assert.match(svgLayer.methods[0].implementation, /function applyLevel/)
  assert.equal(
    Object.keys(persisted.document.definition.actions).length,
    0,
    'layer methods must not become public Actions',
  )

  // Reload: the custom function survives and still runs.
  const savedUrl = page.url()
  await page.goto(savedUrl, { waitUntil: 'networkidle' })
  await page.locator('.studio-shell.component-studio-shell').waitFor()
  await page.locator('.component-layer-row', { hasText: 'theme-lamp' }).click()
  await page.getByRole('tab', { name: '行为', exact: true }).click()
  const reloadedRow = page.locator('.component-method-item', { hasText: 'applyLevel' })
  await reloadedRow.waitFor()
  await reloadedRow.getByLabel('applyLevel 运行预览').click()
  await reloadedRow.locator('.component-method-run-result.is-ok').waitFor()

  await mkdir('artifacts', { recursive: true })
  await page.screenshot({ path: 'artifacts/layer-methods-behavior-tab-1440.png' })

  assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join(' | ')}`)
  console.log(
    'SVG layer methods browser proof passed: built-in theme functions run in the controlled sandbox and recolor the canvas, custom functions are authored through the code modal (quick presets included), run with $emit/console results, persist as private layer data without becoming public Actions, and survive reload.',
  )
} finally {
  await browser.close()
}
