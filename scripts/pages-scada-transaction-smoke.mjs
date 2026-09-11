import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import {
  readPersistedScene,
  saveSceneAndWait,
} from './pages-scene-fixture-storage.mjs'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'https://yushun1990.github.io/scada/')
  .replace(/\/?$/, '/')
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
const pageErrors = []

page.on('pageerror', (error) => pageErrors.push(error.message))

try {
  console.log(`Opening SCADA workspace: ${baseUrl}#/works`)
  await page.goto(`${baseUrl}#/works`, { waitUntil: 'networkidle' })
  await page.getByText('SCADA 作品', { exact: true }).first().waitFor()

  await page.getByRole('button', { name: '+ 新建作品', exact: true }).click()
  await page.getByText('SCADA Editor', { exact: true }).waitFor()

  const componentItem = page.locator('.component-item').first()
  assert.equal(await componentItem.count(), 1, 'SCADA component palette must contain a component')
  await componentItem.click()

  const nameField = page
    .locator('.property-panel .property-field')
    .filter({ has: page.locator('span', { hasText: /^名称$/ }) })
    .locator('input')
    .first()
  await nameField.waitFor()

  const originalName = await nameField.inputValue()
  assert.ok(originalName.length > 0, 'selected node must expose an initial name')

  await nameField.click()
  await nameField.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
  await nameField.press('Backspace')
  await nameField.pressSequentially('Transaction Name', { delay: 5 })
  assert.equal(
    await nameField.inputValue(),
    'Transaction Name',
    'controlled node name must reflect staged text before blur',
  )

  // Clicking Undo first blurs the field (committing the transaction), then
  // executes the editor command. One Undo must restore the complete before
  // snapshot rather than one character or no-op.
  await page.getByRole('button', { name: '撤销' }).click()
  await nameField.waitFor()
  assert.equal(
    await nameField.inputValue(),
    originalName,
    'one undo must restore the full pre-edit node name',
  )

  await page.getByRole('button', { name: '重做' }).click()
  await nameField.waitFor()
  assert.equal(
    await nameField.inputValue(),
    'Transaction Name',
    'redo must restore the complete committed node name edit',
  )

  await saveSceneAndWait(page)
  const storedScene = (await readPersistedScene(page)).document
  assert.equal(
    storedScene.nodes.find((node) => node.name === 'Transaction Name')?.name,
    'Transaction Name',
    'redo result must persist through the normal scene repository path',
  )

  assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join(' | ')}`)
  console.log('SCADA transaction smoke passed: staged text edit commits as one undoable history entry and survives redo/save.')
} finally {
  await browser.close()
}
