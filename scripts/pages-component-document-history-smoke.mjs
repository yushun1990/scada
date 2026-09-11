import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import {
  readPersistedComponent,
  saveAndWait,
} from './pages-component-fixture-storage.mjs'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'https://yushun1990.github.io/scada/')
  .replace(/\/?$/, '/')
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
const pageErrors = []

page.on('pageerror', (error) => pageErrors.push(error.message))

try {
  await page.goto(`${baseUrl}#/components/new`, { waitUntil: 'load' })
  await page.getByText('Component Editor', { exact: true }).waitFor()

  const palette = page.getByRole('region', { name: '组件创作素材' })
  const textTool = palette.getByRole('button', { name: '文本', exact: true })
  const rows = page.locator('.component-layer-row')
  const row = (name) => rows.filter({ hasText: name })
  const undo = page.getByRole('button', { name: '撤销', exact: true })
  const redo = page.getByRole('button', { name: '重做', exact: true })

  await textTool.waitFor()
  await textTool.dblclick()
  await row('文本 1').waitFor()
  assert.equal(await rows.count(), 1, 'visual creation must produce one layer')

  await page.getByRole('button', { name: '组件设置', exact: true }).click()
  const rootInspector = page.locator('.component-root-inspector')
  await rootInspector.waitFor()
  const titleField = rootInspector
    .locator('.property-field')
    .filter({ has: page.locator('span', { hasText: /^名称$/ }) })
    .locator('input')
    .first()
  await titleField.waitFor()

  const originalTitle = await titleField.inputValue()
  assert.ok(originalTitle.length > 0, 'new component must have a title')

  await titleField.click()
  await titleField.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
  await titleField.press('Backspace')
  await titleField.pressSequentially('History Component', { delay: 5 })
  assert.equal(await titleField.inputValue(), 'History Component')

  // Clicking the toolbar first blurs/commits the focused document field, then
  // invokes the same full-document undo authority used for visual operations.
  await undo.click()
  await titleField.waitFor()
  assert.equal(
    await titleField.inputValue(),
    originalTitle,
    'first undo must revert the complete Component definition field transaction',
  )
  assert.equal(
    await rows.count(),
    1,
    'undoing the definition transaction must preserve the earlier visual edit',
  )

  await undo.click()
  assert.equal(
    await rows.count(),
    0,
    'second undo must cross the document boundary and undo the earlier visual edit',
  )

  await redo.click()
  await row('文本 1').waitFor()
  assert.equal(
    await titleField.inputValue(),
    originalTitle,
    'first redo must restore only the visual edit',
  )

  await redo.click()
  await titleField.waitFor()
  assert.equal(
    await titleField.inputValue(),
    'History Component',
    'second redo must restore the Component definition edit',
  )
  assert.equal(await rows.count(), 1, 'visual and definition edits must coexist after redo')

  // Text Ctrl/Cmd+Z remains owned by the focused input rather than jumping
  // across the Component document history stack.
  await titleField.focus()
  await titleField.press('End')
  await titleField.pressSequentially('X')
  await titleField.press(process.platform === 'darwin' ? 'Meta+Z' : 'Control+Z')
  assert.notEqual(
    await titleField.inputValue(),
    originalTitle,
    'text undo must not invoke Component document undo',
  )
  await titleField.press('Escape')
  assert.equal(
    await titleField.inputValue(),
    'History Component',
    'Escape must cancel the staged Component field transaction',
  )

  await saveAndWait(page)
  const persisted = (await readPersistedComponent(page)).document
  assert.equal(persisted.definition.title, 'History Component')
  assert.equal(persisted.visual.layers.length, 1)

  assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join(' | ')}`)
  console.log('Component document history smoke passed: visual and definition edits share one ordered undo/redo authority, text shortcuts stay local, Escape cancels staged fields, and save preserves the redone document.')
} finally {
  await browser.close()
}
