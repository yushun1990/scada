import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'https://yushun1990.github.io/scada/').replace(/\/?$/, '/')
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))

try {
  await page.goto(`${baseUrl}#/components/new`, { waitUntil: 'load' })
  await page.locator('.studio-shell.component-studio-shell').waitFor()

  const modeSwitch = page.locator('.component-editor-header > .mode-switch')
  await modeSwitch.waitFor()
  const modeChrome = await modeSwitch.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      border: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
      padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft],
      columnGap: style.columnGap,
      rowGap: style.rowGap,
      borderRadius: style.borderRadius,
      backgroundColor: style.backgroundColor,
      boxShadow: style.boxShadow,
    }
  })
  assert.deepEqual(
    modeChrome.border,
    ['0px', '0px', '0px', '0px'],
    'Design / Preview wrapper must not draw an outer outline',
  )
  assert.deepEqual(
    modeChrome.padding,
    ['0px', '0px', '0px', '0px'],
    'Design / Preview wrapper must not leave a padded shell around the mode faces',
  )
  assert.equal(modeChrome.columnGap, '0px', 'Design / Preview mode faces must touch horizontally')
  assert.equal(modeChrome.rowGap, '0px', 'Design / Preview wrapper must not retain segmented-control gap')
  assert.equal(modeChrome.borderRadius, '0px', 'Design / Preview wrapper itself must not look like a rounded control')
  assert.ok(
    modeChrome.backgroundColor === 'rgba(0, 0, 0, 0)' || modeChrome.backgroundColor === 'transparent',
    `Design / Preview wrapper must be transparent, got ${modeChrome.backgroundColor}`,
  )
  assert.equal(modeChrome.boxShadow, 'none', 'Design / Preview wrapper must not have a surrounding shadow')

  const modeFaces = await modeSwitch.locator(':scope > .ui-segmented-item').evaluateAll((items) =>
    items.map((item) => {
      const rect = item.getBoundingClientRect()
      const style = getComputedStyle(item)
      return {
        left: rect.left,
        right: rect.right,
        width: rect.width,
        borderTopLeftRadius: style.borderTopLeftRadius,
        borderTopRightRadius: style.borderTopRightRadius,
        borderBottomRightRadius: style.borderBottomRightRadius,
        borderBottomLeftRadius: style.borderBottomLeftRadius,
      }
    }),
  )
  assert.equal(modeFaces.length, 2, 'Design / Preview must expose exactly two adjacent mode faces')
  assert.ok(
    Math.abs(modeFaces[0].right - modeFaces[1].left) <= 0.5,
    `Design / Preview mode faces must meet without a visual gap: ${modeFaces[0].right}/${modeFaces[1].left}`,
  )
  assert.equal(modeFaces[0].borderTopRightRadius, '0px', 'Design inner edge must stay square')
  assert.equal(modeFaces[0].borderBottomRightRadius, '0px', 'Design inner edge must stay square')
  assert.equal(modeFaces[1].borderTopLeftRadius, '0px', 'Preview inner edge must stay square')
  assert.equal(modeFaces[1].borderBottomLeftRadius, '0px', 'Preview inner edge must stay square')

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
  console.log('Component header browser smoke passed: mode faces are contiguous without an outer shell and toolbar geometry buttons stay non-overlapping.')
} finally {
  await browser.close()
}
