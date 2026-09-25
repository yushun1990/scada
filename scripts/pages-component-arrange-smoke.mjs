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
// Reorder commits settle asynchronously after the row command; poll for the
// expected order instead of snapshotting immediately after the click.
async function assertOrder(expected, label) {
  const expectedRows = [...expected].reverse()
  await page.waitForFunction((target) => JSON.stringify(
    [...document.querySelectorAll('.component-layer-row .component-layer-name')].map((n) => n.textContent),
  ) === JSON.stringify(target), expectedRows)
  assert.deepEqual(await navigatorOrder(), expectedRows, label)
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
    await layerRow(`txt_${index}`).waitFor()
  }

  await assertOrder(['txt_1', 'txt_2', 'txt_3'], 'Palette append order is the initial top-level sibling z-order')

  // Row ordering commands collapsed to bring-to-front / send-to-back; one-step
  // moves now happen through tree drag reorder instead of per-row buttons.
  await layerRow('txt_1').click()
  assert.equal(await rowButton('txt_1', '置顶').isEnabled(), true)
  assert.equal(await rowButton('txt_1', '置底').isDisabled(), true)
  await rowButton('txt_1', '置顶').click()
  await assertOrder(['txt_2', 'txt_3', 'txt_1'], 'bring-to-front moves the selection to the final sibling slot')

  await rowButton('txt_1', '置底').click()
  await assertOrder(['txt_1', 'txt_2', 'txt_3'], 'send-to-back moves the selection to the first sibling slot')

  await selectLayers(['txt_2', 'txt_1'])
  assert.equal(await page.locator('.component-layer-row.active').count(), 2)
  await rowButton('txt_1', '置顶').click()
  // Expected lists are back-to-front: the block keeps its authored z-order
  // (txt_2 stays above txt_1) while landing above the unselected sibling.
  await assertOrder(
    ['txt_3', 'txt_1', 'txt_2'],
    'multi-selection moves as a block while preserving selected sibling order',
  )

  await rowButton('txt_1', '置底').click()
  await assertOrder(
    ['txt_1', 'txt_2', 'txt_3'],
    'multi-selection send-to-back preserves selected sibling order',
  )

  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await assertOrder(['txt_3', 'txt_1', 'txt_2'], 'row ordering participates in document undo')
  await page.getByRole('button', { name: '重做', exact: true }).click()
  await assertOrder(['txt_1', 'txt_2', 'txt_3'], 'row ordering participates in document redo')
  assert.equal(await page.locator('.studio-main-toolbar .component-layer-row-actions').count(), 0)
  assert.equal(await page.locator('.studio-main-toolbar .component-group-command').count(), 1)

  await page.getByRole('button', { name: '保存', exact: true }).click()
  await page.waitForFunction(() => window.location.hash !== '#/components/new')
  const savedUrl = page.url()

  await page.reload({ waitUntil: 'networkidle' })
  await page.locator('.studio-shell.component-studio-shell').waitFor()
  await assertOrder(['txt_1', 'txt_2', 'txt_3'], 'saved sibling z-order survives reload')

  await layerRow('txt_1').click()
  await page.getByRole('button', { name: '预览', exact: true }).click()
  for (const commandName of ['置顶', '置底']) {
    assert.equal(await rowButton('txt_1', commandName).isDisabled(), true)
  }

  assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join(' | ')}`)
  console.log('Pages component arrange smoke passed: top-level sibling order is manipulated from each layer row (frontmost first), multi-selection preserves relative order, persistence survives reload, and preview remains read-only.')
  console.log(`Persisted arrange test component URL: ${savedUrl}`)
} finally {
  await context.close()
  await browser.close()
}
