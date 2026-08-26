import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'https://yushun1990.github.io/scada/')
  .replace(/\/?$/, '/')
const componentUrl = `${baseUrl}#/components/new`
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
const pageErrors = []

page.on('pageerror', (error) => pageErrors.push(error.message))

function layerRow(name) {
  return page.locator('.component-layer-row', { hasText: name }).first()
}

async function selectLayers(names) {
  assert.ok(names.length > 0, 'selection must contain at least one layer')
  await layerRow(names[0]).click()
  for (const name of names.slice(1)) {
    await layerRow(name).click({ modifiers: ['Control'] })
  }
}

async function setGeometry(name, x, y) {
  await layerRow(name).click()
  const inputs = page.locator('.component-layer-geometry-grid input')
  assert.equal(await inputs.count(), 7, `geometry inspector missing for ${name}`)
  await inputs.nth(0).fill(String(x))
  await inputs.nth(1).fill(String(y))
}

async function readGeometry(name) {
  await layerRow(name).click()
  const inputs = page.locator('.component-layer-geometry-grid input')
  return {
    x: Number(await inputs.nth(0).inputValue()),
    y: Number(await inputs.nth(1).inputValue()),
    width: Number(await inputs.nth(2).inputValue()),
    height: Number(await inputs.nth(3).inputValue()),
  }
}

function assertClose(actual, expected, message) {
  assert.ok(
    Math.abs(actual - expected) < 0.001,
    `${message}: expected ${expected}, received ${actual}`,
  )
}

async function resetGeometry() {
  await setGeometry('Group 1', 8, 8)
  await setGeometry('Group 2', 32, 20)
  await setGeometry('Group 3', 80, 56)
}

async function assertAxis(names, axis, expected, commandName) {
  for (const name of names) {
    const geometry = await readGeometry(name)
    assertClose(geometry[axis], expected, `${commandName} ${name} ${axis}`)
  }
}

const layerNames = ['Group 1', 'Group 2', 'Group 3']
const alignCases = [
  ['左对齐', 'x', 8],
  ['水平居中', 'x', 44],
  ['右对齐', 'x', 80],
  ['顶对齐', 'y', 8],
  ['垂直居中', 'y', 32],
  ['底对齐', 'y', 56],
]

try {
  console.log(`Opening deployed Component Editor: ${componentUrl}`)
  await page.goto(componentUrl, { waitUntil: 'networkidle' })
  await page.getByText('Component Editor', { exact: true }).waitFor()

  const canvasToolbar = page.locator('.component-canvas-toolbar')
  assert.equal(await canvasToolbar.count(), 1, 'formal component canvas toolbar must exist')

  const snapButton = page.getByRole('button', { name: '吸附' })
  assert.equal(await snapButton.isEnabled(), true, 'snap must be available in design mode')
  assert.equal(await snapButton.getAttribute('aria-pressed'), 'true', 'snap defaults on')
  await snapButton.click()
  assert.equal(await snapButton.getAttribute('aria-pressed'), 'false', 'snap toggle turns off')
  await snapButton.click()
  assert.equal(await snapButton.getAttribute('aria-pressed'), 'true', 'snap toggle turns back on')

  const root = page.locator('.component-layer-root')
  const addLayer = page.getByRole('button', { name: '添加图层' })
  for (let index = 1; index <= 3; index += 1) {
    await root.click()
    await addLayer.click()
    await layerRow(`Group ${index}`).waitFor()
  }
  assert.equal(await page.locator('.component-layer-row').count(), 3, 'three sibling layers created')

  await resetGeometry()

  await selectLayers(['Group 1', 'Group 2'])
  assert.equal(await page.locator('.component-layer-row.active').count(), 2, 'tree multi-selection selects two layers')
  assert.equal(await page.getByRole('button', { name: '左对齐' }).isEnabled(), true, 'align enabled for 2 layers')
  assert.equal(await page.getByRole('button', { name: '水平等距分布' }).isDisabled(), true, 'distribute disabled for 2 layers')
  assert.equal(await page.getByRole('button', { name: '组合选中图层' }).isEnabled(), true, 'group enabled for sibling layers')

  await selectLayers(layerNames)
  assert.equal(await page.locator('.component-layer-row.active').count(), 3, 'tree multi-selection selects three layers')
  assert.equal(await page.getByRole('button', { name: '水平等距分布' }).isEnabled(), true, 'horizontal distribute enabled for 3 layers')
  assert.equal(await page.getByRole('button', { name: '垂直等距分布' }).isEnabled(), true, 'vertical distribute enabled for 3 layers')

  for (const [commandName, axis, expected] of alignCases) {
    await resetGeometry()
    await selectLayers(layerNames)
    const command = page.getByRole('button', { name: commandName })
    assert.equal(await command.isEnabled(), true, `${commandName} enabled`)
    await command.click()
    await assertAxis(layerNames, axis, expected, commandName)
  }

  await resetGeometry()
  await selectLayers(layerNames)
  await page.getByRole('button', { name: '水平等距分布' }).click()
  let middle = await readGeometry('Group 2')
  assertClose(middle.x, 44, 'horizontal distribution middle x')

  await resetGeometry()
  await selectLayers(layerNames)
  await page.getByRole('button', { name: '垂直等距分布' }).click()
  middle = await readGeometry('Group 2')
  assertClose(middle.y, 32, 'vertical distribution middle y')

  await resetGeometry()
  const beforeGroup = Object.fromEntries(
    await Promise.all(layerNames.map(async (name) => [name, await readGeometry(name)])),
  )
  await selectLayers(layerNames)
  await page.getByRole('button', { name: '组合选中图层' }).click()
  assert.equal(await page.locator('.component-layer-row').count(), 4, 'group wrapper added')
  assert.equal(await layerRow('Group 4').count(), 1, 'deterministic group wrapper created')
  assert.equal(await page.getByRole('button', { name: '拆分组合' }).isEnabled(), true, 'new group becomes selection')

  await page.getByRole('button', { name: '保存' }).click()
  await page.waitForFunction(() => window.location.hash !== '#/components/new')
  const savedUrl = page.url()
  assert.match(savedUrl, /#\/components\/component-/, 'save navigates to persisted component id')

  await page.reload({ waitUntil: 'networkidle' })
  await page.getByText('Component Editor', { exact: true }).waitFor()
  assert.equal(await page.locator('.component-layer-row').count(), 4, 'group hierarchy survives reload')
  assert.equal(await layerRow('Group 4').count(), 1, 'saved group survives reload')

  await layerRow('Group 4').click()
  await page.getByRole('button', { name: '拆分组合' }).click()
  assert.equal(await page.locator('.component-layer-row').count(), 3, 'ungroup removes wrapper')

  for (const name of layerNames) {
    const actual = await readGeometry(name)
    const expected = beforeGroup[name]
    assertClose(actual.x, expected.x, `ungroup preserves ${name} x`)
    assertClose(actual.y, expected.y, `ungroup preserves ${name} y`)
    assertClose(actual.width, expected.width, `ungroup preserves ${name} width`)
    assertClose(actual.height, expected.height, `ungroup preserves ${name} height`)
  }

  await selectLayers(['Group 1', 'Group 2'])
  await page.getByRole('button', { name: '预览' }).click()
  assert.equal(await page.getByRole('button', { name: '左对齐' }).isDisabled(), true, 'preview disables align')
  assert.equal(await page.getByRole('button', { name: '组合选中图层' }).isDisabled(), true, 'preview disables group')
  assert.equal(await page.getByRole('button', { name: '吸附' }).isDisabled(), true, 'preview disables snap')

  await layerRow('Group 3').click({ modifiers: ['Control'] })
  assert.equal(await page.locator('.component-layer-row.active').count(), 3, 'preview keeps Layer Tree selection navigation')

  assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join(' | ')}`)
  console.log('Pages smoke passed: component multi-select, geometry commands, group persistence, ungroup preservation and preview locking.')
  console.log(`Persisted test component URL: ${savedUrl}`)
} finally {
  await browser.close()
}
