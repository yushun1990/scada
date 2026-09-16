import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'https://yushun1990.github.io/scada/')
  .replace(/\/?$/, '/')
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
const pageErrors = []

page.on('pageerror', (error) => pageErrors.push(error.message))

function layerRow(name) {
  return page.locator('.component-layer-row', { hasText: name }).first()
}

async function navigatorOrder() {
  return page.locator('.component-layer-row .component-layer-name').allTextContents()
}

async function selectLayers(names) {
  assert.ok(names.length > 0)
  await layerRow(names[0]).click()
  for (const name of names.slice(1)) {
    await layerRow(name).click({ modifiers: ['Control'] })
  }
}

const rowButton = (name, command) => layerRow(name).locator('..').getByRole('button', { name: `${command} · ${name}`, exact: true })
async function orderMenu(name) {
  await rowButton(name, '更多排序').click()
}
async function menuOrder(name, command) {
  await orderMenu(name)
  await page.getByRole('menuitem', { name: command, exact: true }).click()
}

async function assertOrder(expected, label) {
  assert.deepEqual(await navigatorOrder(), [...expected].reverse(), label)
}

try {
  console.log(`Opening deployed Component Editor arrange smoke: ${baseUrl}#/components/new`)
  await page.goto(`${baseUrl}#/components/new`, { waitUntil: 'networkidle' })
  await page.locator('.studio-shell.component-studio-shell').waitFor()

  assert.equal(
    await page.getByRole('button', { name: '组', exact: true }).count(),
    0,
    'Palette must not expose standalone Group creation',
  )
  const palette = page.getByRole('region', { name: '组件创作素材' })
  const addText = palette.getByRole('button', { name: '文本', exact: true })
  for (let index = 1; index <= 3; index += 1) {
    await addText.dblclick()
    await layerRow(`文本 ${index}`).waitFor()
  }

  await assertOrder(['文本 1', '文本 2', '文本 3'], 'Palette append order is the initial top-level sibling z-order')

  await layerRow('文本 1').click()
  assert.equal(await rowButton('文本 1', '上移一层').isEnabled(), true)
  assert.equal(await rowButton('文本 1', '下移一层').isDisabled(), true)
  await orderMenu('文本 1')
  assert.equal(await page.getByRole('menuitem', { name: '置于顶层', exact: true }).isEnabled(), true)
  assert.equal(await page.getByRole('menuitem', { name: '置于底层', exact: true }).isDisabled(), true)
  await page.getByRole('menuitem', { name: '置于顶层', exact: true }).click()
  await assertOrder(['文本 2', '文本 3', '文本 1'], 'bring-to-front moves the selection to the final sibling slot')

  await rowButton('文本 1', '下移一层').click()
  await assertOrder(['文本 2', '文本 1', '文本 3'], 'send-backward moves the selection one sibling step')

  await menuOrder('文本 1', '置于底层')
  await assertOrder(['文本 1', '文本 2', '文本 3'], 'send-to-back moves the selection to the first sibling slot')

  await rowButton('文本 1', '上移一层').click()
  await assertOrder(['文本 2', '文本 1', '文本 3'], 'bring-forward moves the selection one sibling step')

  await selectLayers(['文本 2', '文本 1'])
  assert.equal(await page.locator('.component-layer-row.active').count(), 2)
  await menuOrder('文本 1', '置于顶层')
  await assertOrder(
    ['文本 3', '文本 2', '文本 1'],
    'multi-selection moves as a block while preserving selected sibling order',
  )

  await menuOrder('文本 1', '置于底层')
  await assertOrder(
    ['文本 2', '文本 1', '文本 3'],
    'multi-selection send-to-back preserves selected sibling order',
  )

  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await assertOrder(['文本 3', '文本 2', '文本 1'], 'row ordering participates in document undo')
  await page.getByRole('button', { name: '重做', exact: true }).click()
  await assertOrder(['文本 2', '文本 1', '文本 3'], 'row ordering participates in document redo')
  assert.equal(await page.locator('.studio-main-toolbar .component-layer-row-actions').count(), 0)
  assert.equal(await page.locator('.studio-main-toolbar .component-group-command').count(), 1)

  await page.getByRole('button', { name: '保存', exact: true }).click()
  await page.waitForFunction(() => window.location.hash !== '#/components/new')
  const savedUrl = page.url()

  await page.reload({ waitUntil: 'networkidle' })
  await page.locator('.studio-shell.component-studio-shell').waitFor()
  await assertOrder(['文本 2', '文本 1', '文本 3'], 'saved sibling z-order survives reload')

  await layerRow('文本 1').click()
  await page.getByRole('button', { name: '预览', exact: true }).click()
  for (const commandName of ['上移一层', '下移一层']) {
    assert.equal(await rowButton('文本 1', commandName).isDisabled(), true, `${commandName} is disabled in preview`)
  }
  await orderMenu('文本 1')
  for (const commandName of ['置于顶层', '置于底层']) {
    assert.equal(await page.getByRole('menuitem', { name: commandName, exact: true }).isDisabled(), true)
  }
  await page.keyboard.press('Escape')

  assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join(' | ')}`)
  console.log('Pages component arrange smoke passed: top-level sibling order is manipulated from each layer row (frontmost first), multi-selection preserves relative order, persistence survives reload, and preview remains read-only.')
  console.log(`Persisted arrange test component URL: ${savedUrl}`)
} finally {
  await context.close()
  await browser.close()
}
