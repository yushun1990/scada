import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'https://yushun1990.github.io/scada/').replace(/\/?$/, '/')
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))

try {
  await page.goto(`${baseUrl}#/components/new`, { waitUntil: 'load' })
  const shell = page.locator('.studio-shell.component-studio-shell')
  await shell.waitFor()

  const mainToolbar = shell.getByRole('toolbar', { name: 'Studio 主工具栏' })
  await mainToolbar.waitFor()

  // C1 owns the visual skin of SegmentedControl. This integration smoke only
  // verifies that Component Editor consumes that shared primitive inside C2's
  // single Studio toolbar and keeps both mode targets usable/non-overlapping.
  const modeSwitch = mainToolbar.locator('.mode-switch.ui-segmented-control')
  await modeSwitch.waitFor()
  const modeFaces = await modeSwitch.locator(':scope > .ui-segmented-item').evaluateAll((items) =>
    items.map((item) => {
      const rect = item.getBoundingClientRect()
      return {
        left: rect.left,
        right: rect.right,
        width: rect.width,
        height: rect.height,
      }
    }),
  )
  assert.equal(modeFaces.length, 2, 'Design / Preview must expose exactly two shared segmented-control faces')
  for (const face of modeFaces) {
    assert.ok(face.width >= 48, `mode face must keep a usable width, got ${face.width}`)
    assert.ok(face.height >= 28, `mode face must keep the shared control height, got ${face.height}`)
  }
  assert.ok(
    modeFaces[0].right <= modeFaces[1].left + 0.5,
    `Design / Preview mode faces must not overlap: ${modeFaces[0].right}/${modeFaces[1].left}`,
  )

  const groupPseudoContent = await mainToolbar.locator('.canvas-tool-group').evaluateAll((groups) =>
    groups.map((group) => getComputedStyle(group, '::after').content),
  )
  assert.ok(groupPseudoContent.length > 0, 'component toolbar command groups must be present in Studio main toolbar')
  assert.ok(
    groupPseudoContent.every((content) => content === 'none' || content === 'normal'),
    `component toolbar groups must not draw legacy edge separators: ${groupPseudoContent.join(', ')}`,
  )

  const toolbarLayout = await mainToolbar.evaluate((element) => ({
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
    'Studio main toolbar must keep the flex layout required by ordered command groups',
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
      previous.width >= 28 && current.width >= 28,
      `component geometry buttons must keep the C1 28px control target: ${previous.width}/${current.width}`,
    )
  }

  assert.equal(
    await page.getByRole('toolbar', { name: '组件画布工具栏' }).count(),
    0,
    'C2 must not restore the legacy second component canvas toolbar',
  )
  assert.deepEqual(errors, [])
  console.log('Component chrome browser smoke passed: Component Editor consumes the shared mode primitive inside the single Studio toolbar and geometry commands stay non-overlapping.')
} finally {
  await browser.close()
}
