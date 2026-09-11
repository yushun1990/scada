import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { readPersistedComponent } from './pages-component-fixture-storage.mjs'
import { readPersistedScene } from './pages-scene-fixture-storage.mjs'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'https://yushun1990.github.io/scada/')
  .replace(/\/?$/, '/')
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(error.message))

const saveStatus = () => page.locator('.document-save-status')
const saveButton = () => page.getByRole('button', { name: '保存', exact: true })
const leaveDialog = () => page.getByRole('dialog', { name: '保存修改后离开？' })

async function waitForSaveStatus(text) {
  await saveStatus().getByText(text, { exact: true }).waitFor()
}

async function delayNextWrite(storeName, delayMs = 700) {
  await page.evaluate(({ targetStore, delay }) => {
    const stateKey = '__b2TransactionDelayPatch'
    const existing = window[stateKey]
    if (!existing) {
      const original = IDBTransaction.prototype.addEventListener
      window[stateKey] = { original, targetStore: null, delay: 0 }
      IDBTransaction.prototype.addEventListener = function patched(type, listener, options) {
        const state = window[stateKey]
        if (
          type === 'complete' &&
          state.targetStore &&
          this.mode === 'readwrite' &&
          this.objectStoreNames.contains(state.targetStore)
        ) {
          const delayedBy = state.delay
          state.targetStore = null
          const transaction = this
          const wrapped = (event) => {
            window.setTimeout(() => {
              if (typeof listener === 'function') {
                listener.call(transaction, event)
              } else {
                listener.handleEvent(event)
              }
            }, delayedBy)
          }
          return original.call(this, type, wrapped, options)
        }
        return original.call(this, type, listener, options)
      }
    }
    window[stateKey].targetStore = targetStore
    window[stateKey].delay = delay
  }, { targetStore: storeName, delay: delayMs })
}

async function failNextPut(storeName) {
  await page.evaluate((targetStore) => {
    const stateKey = '__b2PutFailurePatch'
    const existing = window[stateKey]
    if (!existing) {
      const original = IDBObjectStore.prototype.put
      window[stateKey] = { original, targetStore: null }
      IDBObjectStore.prototype.put = function patched(value, key) {
        const state = window[stateKey]
        if (state.targetStore === this.name) {
          state.targetStore = null
          throw new Error(`B2 injected ${this.name} save failure`)
        }
        return key === undefined
          ? original.call(this, value)
          : original.call(this, value, key)
      }
    }
    window[stateKey].targetStore = targetStore
  }, storeName)
}

async function beforeUnloadIsBlocked() {
  return page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true })
    const allowed = window.dispatchEvent(event)
    return { allowed, defaultPrevented: event.defaultPrevented }
  })
}

async function componentRootTitleField() {
  await page.getByRole('button', { name: '组件设置', exact: true }).click()
  const rootInspector = page.locator('.component-root-inspector')
  await rootInspector.waitFor()
  const input = rootInspector
    .locator('.property-field')
    .filter({ has: page.locator('span', { hasText: /^名称$/ }) })
    .locator('input')
    .first()
  await input.waitFor()
  return input
}

async function fillAndCommit(input, value) {
  await input.fill(value)
  await input.press('Tab')
}

async function readAllPersistedComponents() {
  return page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('scada-editor-lab', 2)
      request.addEventListener('success', () => resolve(request.result), { once: true })
      request.addEventListener('error', () => reject(request.error), { once: true })
    })
    try {
      const rows = await new Promise((resolve, reject) => {
        const transaction = database.transaction('components', 'readonly')
        const request = transaction.objectStore('components').getAll()
        request.addEventListener('success', () => resolve(request.result), { once: true })
        request.addEventListener('error', () => reject(request.error), { once: true })
      })
      return rows.map((row) => ({ ...row, document: JSON.parse(row.document) }))
    } finally {
      database.close()
    }
  })
}

try {
  // SCADA: initial persisted baseline -> dirty -> save snapshot while newer edit remains dirty.
  await page.goto(`${baseUrl}#/works`, { waitUntil: 'networkidle' })
  await page.getByText('SCADA 作品', { exact: true }).first().waitFor()
  await page.getByRole('button', { name: '+ 新建作品', exact: true }).click()
  await page.getByText('SCADA Editor', { exact: true }).waitFor()
  const scadaEditorUrl = page.url()
  await waitForSaveStatus('已保存')

  await page.locator('.component-item').first().click()
  const sceneNameField = page
    .locator('.property-panel .property-field')
    .filter({ has: page.locator('span', { hasText: /^名称$/ }) })
    .locator('input')
    .first()
  await sceneNameField.waitFor()
  await fillAndCommit(sceneNameField, 'B2 Snapshot A')
  await waitForSaveStatus('未保存')
  assert.deepEqual(await beforeUnloadIsBlocked(), { allowed: false, defaultPrevented: true })

  await delayNextWrite('scenes')
  await saveButton().click()
  await waitForSaveStatus('保存中…')
  await fillAndCommit(sceneNameField, 'B2 Snapshot B')
  await waitForSaveStatus('保存中 · 有新修改')
  await waitForSaveStatus('未保存')
  assert.equal(await sceneNameField.inputValue(), 'B2 Snapshot B')
  let persistedScene = (await readPersistedScene(page)).document
  assert.ok(
    persistedScene.nodes.some((node) => node.name === 'B2 Snapshot A'),
    'first SCADA save must persist only its captured snapshot',
  )
  assert.equal(
    persistedScene.nodes.some((node) => node.name === 'B2 Snapshot B'),
    false,
    'new edit made during save must remain memory-only and dirty',
  )

  await saveButton().click()
  await waitForSaveStatus('已保存')
  persistedScene = (await readPersistedScene(page)).document
  assert.ok(persistedScene.nodes.some((node) => node.name === 'B2 Snapshot B'))
  assert.deepEqual(await beforeUnloadIsBlocked(), { allowed: true, defaultPrevented: false })

  // SCADA failure: error state is retryable and never rolls the document back.
  await fillAndCommit(sceneNameField, 'B2 Failure Retained')
  await failNextPut('scenes')
  await saveButton().click()
  await waitForSaveStatus('保存失败')
  assert.equal(await sceneNameField.inputValue(), 'B2 Failure Retained')
  persistedScene = (await readPersistedScene(page)).document
  assert.ok(persistedScene.nodes.some((node) => node.name === 'B2 Snapshot B'))
  await saveButton().click()
  await waitForSaveStatus('已保存')
  persistedScene = (await readPersistedScene(page)).document
  assert.ok(persistedScene.nodes.some((node) => node.name === 'B2 Failure Retained'))

  // Workspace exit: Cancel keeps editing, Save-and-continue persists then leaves.
  await fillAndCommit(sceneNameField, 'B2 Leave Saved')
  await page.getByRole('button', { name: '返回 SCADA 作品工作台' }).click()
  await leaveDialog().waitFor()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  assert.equal(page.url(), scadaEditorUrl)
  assert.equal(await sceneNameField.inputValue(), 'B2 Leave Saved')
  await waitForSaveStatus('未保存')

  await page.getByRole('button', { name: '返回 SCADA 作品工作台' }).click()
  await leaveDialog().waitFor()
  await page.getByRole('button', { name: '保存并继续', exact: true }).click()
  await page.getByText('SCADA 作品', { exact: true }).first().waitFor()
  assert.match(page.url(), /#\/works$/)

  // Browser Back: dirty editor stays mounted until Cancel/Discard resolves the same guard.
  const scadaEditorHash = new URL(scadaEditorUrl).hash
  await page.evaluate((targetHash) => { window.location.hash = targetHash }, scadaEditorHash)
  await page.getByText('SCADA Editor', { exact: true }).waitFor()
  const backNameField = page
    .locator('.property-panel .property-field')
    .filter({ has: page.locator('span', { hasText: /^名称$/ }) })
    .locator('input')
    .first()
  await fillAndCommit(backNameField, 'B2 Back Guard')
  await page.evaluate(() => history.back())
  await leaveDialog().waitFor()
  assert.match(page.url(), /#\/scada\//)
  await page.getByRole('button', { name: '取消', exact: true }).click()
  assert.equal(await backNameField.inputValue(), 'B2 Back Guard')
  assert.deepEqual(await beforeUnloadIsBlocked(), { allowed: false, defaultPrevented: true })
  await page.evaluate(() => history.back())
  await leaveDialog().waitFor()
  await page.getByRole('button', { name: '放弃修改', exact: true }).click()
  await page.getByText('SCADA 作品', { exact: true }).first().waitFor()

  // Component new-document race: an older completed save must not overwrite or remount newer edits.
  await page.goto(`${baseUrl}#/components/new`, { waitUntil: 'networkidle' })
  await page.getByText('Component Editor', { exact: true }).waitFor()
  await waitForSaveStatus('未保存')
  let componentTitle = await componentRootTitleField()
  await fillAndCommit(componentTitle, 'B2 Component Snapshot A')
  await delayNextWrite('components')
  await saveButton().click()
  await waitForSaveStatus('保存中…')
  await fillAndCommit(componentTitle, 'B2 Component Snapshot B')
  await waitForSaveStatus('保存中 · 有新修改')
  await waitForSaveStatus('未保存')
  assert.match(page.url(), /#\/components\/new$/)
  assert.equal(await componentTitle.inputValue(), 'B2 Component Snapshot B')
  const savedAfterFirstComponentWrite = await readAllPersistedComponents()
  assert.ok(
    savedAfterFirstComponentWrite.some(
      (record) => record.document.definition.title === 'B2 Component Snapshot A',
    ),
    'first Component save must persist the captured older snapshot',
  )
  assert.equal(
    savedAfterFirstComponentWrite.some(
      (record) => record.document.definition.title === 'B2 Component Snapshot B',
    ),
    false,
    'newer Component edit must not be overwritten or silently persisted',
  )

  await saveButton().click()
  await page.waitForFunction(() => /^#\/components\/(?!new$)[^/]+$/.test(window.location.hash))
  await page.getByText('Component Editor', { exact: true }).waitFor()
  await waitForSaveStatus('已保存')
  componentTitle = await componentRootTitleField()
  assert.equal(await componentTitle.inputValue(), 'B2 Component Snapshot B')
  let persistedComponent = (await readPersistedComponent(page)).document
  assert.equal(persistedComponent.definition.title, 'B2 Component Snapshot B')

  // Component failure remains in memory and can be retried.
  await fillAndCommit(componentTitle, 'B2 Component Failure Retained')
  await failNextPut('components')
  await saveButton().click()
  await waitForSaveStatus('保存失败')
  assert.equal(await componentTitle.inputValue(), 'B2 Component Failure Retained')
  persistedComponent = (await readPersistedComponent(page)).document
  assert.equal(persistedComponent.definition.title, 'B2 Component Snapshot B')
  await saveButton().click()
  await waitForSaveStatus('已保存')
  persistedComponent = (await readPersistedComponent(page)).document
  assert.equal(persistedComponent.definition.title, 'B2 Component Failure Retained')

  // Component uses the same guarded exit lifecycle.
  await fillAndCommit(componentTitle, 'B2 Component Discard')
  await page.getByRole('button', { name: '返回组件库工作台' }).click()
  await leaveDialog().waitFor()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  assert.equal(await componentTitle.inputValue(), 'B2 Component Discard')
  await page.getByRole('button', { name: '返回组件库工作台' }).click()
  await leaveDialog().waitFor()
  await page.getByRole('button', { name: '放弃修改', exact: true }).click()
  await page.getByRole('heading', { name: '组件库开发', exact: true }).waitFor()

  assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join(' | ')}`)
  console.log('B2 save/leave smoke passed: snapshot revisions survive edit-during-save, failures retain documents, retry succeeds, workspace/back navigation is guarded, beforeunload is dirty-aware, and Component stale-save overwrite is closed.')
} finally {
  await browser.close()
}
