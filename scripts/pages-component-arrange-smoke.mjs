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

async function assertOrder(expected, label) {
  assert.deepEqual(await navigatorOrder(), expected, label)
}

try {
  console.log(`Opening deployed Component Editor arrange smoke: ${baseUrl}#/components/new`)
  await page.goto(`${baseUrl}#/components/new`, { waitUntil: 'networkidle' })
  await page.getByText('Component Editor', { exact: true }).waitFor()

  const addGroup = page.getByRole('button', { name: '组', exact: true })
  for (let index = 1; index <= 3; index += 1) {
    await addGroup.click()
    await layerRow(`组 ${index}`).waitFor()
  }

  await assertOrder(['组 1', '组 2', '组 3'], 'Palette append order is the initial sibling z-order')

  await layerRow('组 1').click()
  assert.equal(await page.getByRole('button', { name: '置于顶层' }).isEnabled(), true)
  assert.equal(await page.getByRole('button', { name: '上移一层' }).isEnabled(), true)
  assert.equal(await page.getByRole('button', { name: '下移一层' }).isDisabled(), true)
  assert.equal(await page.getByRole('button', { name: '置于底层' }).isDisabled(), true)

  await page.getByRole('button', { name: '置于顶层' }).click()
  await assertOrder(['组 2', '组 3', '组 1'], 'bring-to-front moves the selection to the final sibling slot')

  await page.getByRole('button', { name: '下移一层' }).click()
  await assertOrder(['组 2', '组 1', '组 3'], 'send-backward moves the selection one sibling step')

  await page.getByRole('button', { name: '置于底层' }).click()
  await assertOrder(['组 1', '组 2', '组 3'], 'send-to-back moves the selection to the first sibling slot')

  await page.getByRole('button', { name: '上移一层' }).click()
  await assertOrder(['组 2', '组 1', '组 3'], 'bring-forward moves the selection one sibling step')

  await selectLayers(['组 2', '组 1'])
  assert.equal(await page.locator('.component-layer-row.active').count(), 2)
  await page.getByRole('button', { name: '置于顶层' }).click()
  await assertOrder(
    ['组 3', '组 2', '组 1'],
    'multi-selection moves as a block while preserving selected sibling order',
  )

  await page.getByRole('button', { name: '置于底层' }).click()
  await assertOrder(
    ['组 2', '组 1', '组 3'],
    'multi-selection send-to-back preserves selected sibling order',
  )

  await page.getByRole('button', { name: '保存', exact: true }).click()
  await page.waitForFunction(() => window.location.hash !== '#/components/new')
  await page.getByText('组件已保存', { exact: true }).waitFor()
  const savedUrl = page.url()

  await page.reload({ waitUntil: 'networkidle' })
  await page.getByText('Component Editor', { exact: true }).waitFor()
  await assertOrder(['组 2', '组 1', '组 3'], 'saved sibling z-order survives reload')

  await layerRow('组 1').click()
  await page.getByRole('button', { name: '预览', exact: true }).click()
  for (const commandName of ['置于顶层', '上移一层', '下移一层', '置于底层']) {
    assert.equal(
      await page.getByRole('button', { name: commandName }).isDisabled(),
      true,
      `${commandName} is disabled in preview mode`,
    )
  }

  assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join(' | ')}`)
  console.log('Pages component arrange smoke passed: sibling order is manipulated from the Canvas toolbar, multi-selection preserves relative order, persistence survives reload, and preview remains read-only.')
  console.log(`Persisted arrange test component URL: ${savedUrl}`)
} finally {
  await context.close()
  await browser.close()
}
