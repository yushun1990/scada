import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'https://yushun1990.github.io/scada/').replace(/\/?$/, '/')
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))

try {
  await page.goto(`${baseUrl}#/components/new`, { waitUntil: 'load' })
  await page.getByText('Component Editor', { exact: true }).waitFor()

  const modeSwitch = page.locator('.component-editor-header > .mode-switch')
  await modeSwitch.waitFor()
  const modeBorder = await modeSwitch.evaluate((element) => {
    const style = getComputedStyle(element)
    return [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth]
  })
  assert.deepEqual(modeBorder, ['0px', '0px', '0px', '0px'], 'Design / Preview must not have a redundant outer outline')

  const toolbar = page.getByRole('toolbar', { name: '组件画布工具栏' })
  const groupPseudoContent = await toolbar.locator(':scope > .canvas-tool-group').evaluateAll((groups) =>
    groups.map((group) => getComputedStyle(group, '::after').content),
  )
  assert.ok(groupPseudoContent.length > 0, 'component toolbar command groups must be present')
  assert.ok(
    groupPseudoContent.every((content) => content === 'none' || content === 'normal'),
    `component toolbar groups must not draw legacy edge separators: ${groupPseudoContent.join(', ')}`,
  )

  assert.deepEqual(errors, [])
  console.log('Component header browser smoke passed: no mode-switch outer outline and no legacy group-edge separator.')
} finally {
  await browser.close()
}
