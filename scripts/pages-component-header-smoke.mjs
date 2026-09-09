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

  const toolbarLayout = await toolbar.evaluate((element) => ({
    display: getComputedStyle(element).display,
    geometryButtons: Array.from(
      element.querySelectorAll('.component-geometry-tool-group > button'),
      (button) => {
        const rect = button.getBoundingClientRect()
        return { left: rect.left, right: rect.right, width: rect.width }
      },
    ),
  }))
  assert.equal(
    toolbarLayout.display,
    'flex',
    'component toolbar must keep the flex layout required by shared ordered spacer slots',
  )
  assert.ok(toolbarLayout.geometryButtons.length > 1, 'component geometry commands must be present')
  for (let index = 1; index < toolbarLayout.geometryButtons.length; index += 1) {
    const previous = toolbarLayout.geometryButtons[index - 1]
    const current = toolbarLayout.geometryButtons[index]
    assert.ok(
      previous.right <= current.left + 0.5,
      `component geometry buttons must not overlap: ${index - 1}/${index} (${previous.right} > ${current.left})`,
    )
    assert.ok(
      previous.width >= 29 && current.width >= 29,
      `component geometry buttons must keep their normal hit target: ${previous.width}/${current.width}`,
    )
  }

  assert.deepEqual(errors, [])
  console.log('Component header browser smoke passed: mode chrome is clean and toolbar geometry buttons stay non-overlapping under the pinned flex layout.')
} finally {
  await browser.close()
}
