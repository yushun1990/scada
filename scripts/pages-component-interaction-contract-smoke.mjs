import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium, firefox } from 'playwright'
import { readPersistedComponent, saveAndWait } from './pages-component-fixture-storage.mjs'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'http://127.0.0.1:4173/').replace(/\/?$/, '/')
const browserName = process.env.SCADA_BROWSER ?? 'chromium'
assert.ok(['chromium', 'firefox'].includes(browserName))
const browser = await ({ chromium, firefox })[browserName].launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
page.setDefaultTimeout(15000)
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const button = (name) => page.getByRole('button', { name, exact: true })
const contractPage = page.locator('.component-definition-page')
const tab = (name) => contractPage.getByRole('tab', { name, exact: true })

try {
  await mkdir('artifacts', { recursive: true })
  await page.goto(`${baseUrl}#/components/new`, { waitUntil: 'networkidle' })
  await page.locator('.component-palette-item[aria-label="文本"]').dblclick()
  const layerPanel = page.locator('.component-property-panel')
  await layerPanel.getByRole('tab', { name: '图层操作', exact: true }).click()
  await layerPanel.getByText(/图层操作属于组件的私有视觉实现/).waitFor()
  assert.match(await layerPanel.textContent(), /不在便携运行时执行.*\$emit 仅记录诊断/s)
  await layerPanel.getByRole('button', { name: '+ 新增', exact: true }).click()
  const modal = page.locator('.component-method-implementation-modal')
  await modal.getByRole('heading', { name: '新建图层操作', exact: true }).waitFor()
  await modal.getByLabel('图层操作标识名', { exact: true }).fill('testVisual')
  assert.match(await modal.locator('textarea.component-method-code-textarea').inputValue(), /不发布公开 Event/)
  assert.match(await modal.textContent(), /当前试运行会应用到画布，不是临时预览/)
  await modal.getByRole('button', { name: '取消', exact: true }).click()
  await modal.waitFor({ state: 'detached' })
  await page.screenshot({ path: `artifacts/component-interaction-private-${browserName}.png` })
  const seed = await saveAndWait(page)

  // Import typed legacy declarations via the real transport boundary. They
  // remain drafts, read-only except cleanup; no authored executable source.
  const fixture = {
    packageVersion: 2,
    definition: {
      ...seed.document.definition,
      type: 'custom.cio-t1-contract-fixture',
      title: 'T1 typed contract fixture',
      actions: {
        requestLevel: {
          title: '请求等级', description: '只声明输入，不写入语义状态',
          parameters: [
            { name: 'level', title: '等级', kind: 'number', description: '第一个位置参数' },
            {
              name: 'mode', title: '模式', kind: 'select', optional: true, nullable: true,
              options: [{ label: '数字一', value: 1 }, { label: '文本一', value: '1' }],
            },
          ],
        },
      },
      events: {
        observed: {
          title: '已观察到',
          payload: {
            level: { title: '等级', kind: 'number' },
            note: { title: '备注 <script>', kind: 'string', optional: true, nullable: true },
          },
        },
        tick: { title: '无载荷事件' },
        empty: { title: '空记录事件', payload: {} },
      },
    },
    visual: seed.document.visual,
    implementationDraft: '',
  }
  await page.goto(`${baseUrl}#/components`, { waitUntil: 'networkidle' })
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByLabel('选择组件包文件', { exact: true }).setInputFiles({
    name: 'cio-t1.scada-component.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(fixture)),
  })
  await page.waitForFunction(() => window.location.hash.startsWith('#/components/component-'))
  const imported = await readPersistedComponent(page)
  assert.equal(imported.document.status, 'draft')
  assert.deepEqual(imported.document.definition.actions, fixture.definition.actions)
  assert.deepEqual(imported.document.definition.events, fixture.definition.events)
  await button('Coding 开发').click()
  await tab('操作（未开放）').click()
  await contractPage.getByText(/不提供公开操作（Action）的新增、编辑或执行能力/).waitFor()
  const actionSchema = contractPage.getByRole('region', { name: '操作参数（按声明顺序）' })
  await actionSchema.waitFor()
  const fields = actionSchema.locator('.interaction-contract-schema-field')
  assert.equal(await fields.count(), 2)
  assert.match(await fields.nth(0).textContent(), /level.*number · 数字.*必填.*不允许 null/s)
  assert.match(await fields.nth(1).textContent(), /mode.*select · 枚举.*可选.*允许 null/s)
  assert.deepEqual(await fields.nth(1).locator('.interaction-contract-schema-options code').allTextContents(), ['1', '"1"'])
  assert.equal(await actionSchema.locator('input, textarea, button, select').count(), 0)
  assert.equal(await contractPage.getByRole('button').count(), 1, 'only legacy cleanup is offered')
  await contractPage.locator('.component-methods-status-banner').evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished))
  })
  await page.screenshot({ path: `artifacts/component-interaction-actions-${browserName}.png` })

  await tab('事件（未开放）').click()
  const eventCards = contractPage.locator('.contract-item')
  assert.match(await eventCards.nth(0).textContent(), /level.*必填.*不允许 null.*note.*备注 <script>.*可选.*允许 null/s)
  assert.equal(await eventCards.locator('script').count(), 0, 'schema titles render as inert text')
  assert.match(await eventCards.nth(1).textContent(), /不接受载荷/)
  assert.match(await eventCards.nth(2).textContent(), /仅接受空记录 \{\}/)
  assert.equal(await contractPage.locator('.interaction-contract-schema input, .interaction-contract-schema button').count(), 0)
  await contractPage.locator('.component-methods-status-banner').evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished))
  })
  await page.screenshot({ path: `artifacts/component-interaction-events-${browserName}.png` })

  await button('预览').click()
  assert.equal(await contractPage.getByRole('button', { name: '删除', exact: true }).count(), 0)
  await tab('操作（未开放）').click()
  assert.equal(await contractPage.getByRole('button', { name: '删除', exact: true }).count(), 0)
  await button('设计').click()
  await contractPage.getByRole('button', { name: '删除', exact: true }).click()
  await contractPage.getByText('未声明公开操作（Action）。', { exact: true }).waitFor()
  await button('图形化设计').click()
  await button('撤销').click()
  await button('Coding 开发').click()
  await actionSchema.waitFor()
  await button('图形化设计').click()
  await button('重做').click()
  await button('Coding 开发').click()
  await contractPage.getByText('未声明公开操作（Action）。', { exact: true }).waitFor()
  assert.match(await contractPage.textContent(), /当前含有旧 Action\/Event 声明，不能激活/,
    'an empty Action table alone must not claim portable activation while Events remain')
  await tab('事件（未开放）').click()
  for (let index = 0; index < 3; index++) {
    await contractPage.getByRole('button', { name: '删除', exact: true }).first().click()
  }
  await saveAndWait(page)
  const cleaned = await readPersistedComponent(page)
  assert.deepEqual(cleaned.document.definition.actions, {})
  assert.deepEqual(cleaned.document.definition.events, {})
  assert.deepEqual(cleaned.document.visual, seed.document.visual, 'contract cleanup must not edit private visuals')
  await page.reload({ waitUntil: 'networkidle' })
  await button('Coding 开发').click()
  assert.doesNotMatch(await contractPage.textContent(), /当前含有旧 Action\/Event 声明/)

  // Trusted contract consumption also remains read-only, and Scene vocabulary
  // follows the same public Action/Event contract without changing routing.
  await page.goto(`${baseUrl}#/components/builtin-pump-submersible`, { waitUntil: 'networkidle' })
  await button('Coding 开发').click()
  await tab('操作').click()
  assert.equal(await contractPage.getByRole('button').count(), 0)
  assert.match(await contractPage.textContent(), /可信内置契约 · 只读/)
  assert.equal(await contractPage.getByText('无参数。', { exact: true }).count(), 2)
  await tab('事件').click()
  assert.equal(await contractPage.getByText('不接受载荷。', { exact: true }).count(), 2)

  await page.goto(`${baseUrl}#/works`, { waitUntil: 'networkidle' })
  await button('+ 新建作品').click()
  await page.locator('.component-item').filter({ hasText: '潜水泵' }).click()
  await page.getByRole('tab', { name: '操作', exact: true }).click()
  const requests = page.getByRole('button', { name: '请求操作', exact: true })
  assert.equal(await requests.count(), 2)
  assert.equal(await requests.first().isDisabled(), true)
  await button('预览').click()
  assert.equal(await requests.first().isDisabled(), false)
  await requests.first().click()
  await page.getByRole('tab', { name: '事件', exact: true }).click()
  await page.getByText(/不映射事件载荷/).waitFor()
  assert.equal(await page.getByText('不接受载荷。', { exact: true }).count(), 2)
  assert.deepEqual(errors, [])
  console.log(`T1 interaction contract browser smoke passed (${browserName}): private operation ownership, typed read-only declarations, draft import/cleanup + undo/redo/save/reopen, Preview guards, trusted read-only contracts and Scene operation vocabulary.`)
} finally {
  await browser.close()
}
