import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'https://yushun1990.github.io/scada/')
  .replace(/\/?$/, '/')

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1366, height: 768 } })
const page = await context.newPage()
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(error.message))

function hexToRgb(hex) {
  const value = hex.trim().replace('#', '')
  assert.match(value, /^[0-9a-f]{6}$/i)
  return [0, 2, 4].map((index) => Number.parseInt(value.slice(index, index + 2), 16))
}

function luminance([red, green, blue]) {
  const channel = (value) => {
    const normalized = value / 255
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)
}

function contrast(first, second) {
  const a = luminance(hexToRgb(first))
  const b = luminance(hexToRgb(second))
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

async function styles(locator, properties) {
  return locator.evaluate((element, requested) => {
    const computed = getComputedStyle(element)
    return Object.fromEntries(requested.map((property) => [property, computed.getPropertyValue(property)]))
  }, properties)
}

async function waitForAttribute(locator, name, value) {
  await locator.evaluate(async (element, { attributeName, expected }) => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (element.getAttribute(attributeName) === expected) return
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    throw new Error(`Expected ${attributeName}=${expected}, got ${element.getAttribute(attributeName)}`)
  }, { attributeName: name, expected: value })
}

try {
  await page.goto(`${baseUrl}#/__ui-states`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Studio primitive states' }).waitFor()

  const tokenValues = await page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement)
    const names = [
      '--ui-color-panel',
      '--ui-color-text-subtle',
      '--ui-color-border-strong',
      '--ui-color-accent',
      '--ui-color-accent-soft',
      '--ui-color-danger',
    ]
    return Object.fromEntries(names.map((name) => [name, styles.getPropertyValue(name).trim()]))
  })

  assert.equal(tokenValues['--ui-color-panel'], '#f2f3f5')
  assert.equal(tokenValues['--ui-color-accent'], '#1769aa')
  assert.equal(tokenValues['--ui-color-accent-soft'], '#e7f0fa')
  assert.ok(
    contrast(tokenValues['--ui-color-text-subtle'], tokenValues['--ui-color-panel']) >= 4.5,
    'text-subtle on panel must satisfy ordinary text contrast',
  )
  assert.ok(
    contrast(tokenValues['--ui-color-border-strong'], tokenValues['--ui-color-panel']) >= 3,
    'border-strong on panel must satisfy non-text contrast',
  )

  const interactionButton = page.getByTestId('state-button-interaction')
  let buttonStyles = await styles(interactionButton, [
    'height',
    'font-size',
    'line-height',
    'border-radius',
    'border-top-color',
    'background-color',
  ])
  assert.equal(buttonStyles.height.trim(), '28px')
  assert.equal(buttonStyles['font-size'].trim(), '12px')
  assert.equal(buttonStyles['line-height'].trim(), '18px')
  assert.equal(buttonStyles['border-radius'].trim(), '2px')
  assert.equal(buttonStyles['border-top-color'].trim(), 'rgb(133, 140, 150)')

  await interactionButton.hover()
  buttonStyles = await styles(interactionButton, ['border-top-color', 'background-color'])
  assert.equal(buttonStyles['border-top-color'].trim(), 'rgb(23, 105, 170)')
  assert.equal(buttonStyles['background-color'].trim(), 'rgb(247, 248, 250)')

  await interactionButton.focus()
  buttonStyles = await styles(interactionButton, ['outline-width', 'outline-style', 'outline-color'])
  assert.equal(buttonStyles['outline-width'].trim(), '2px')
  assert.equal(buttonStyles['outline-style'].trim(), 'solid')
  assert.equal(buttonStyles['outline-color'].trim(), 'rgb(23, 105, 170)')

  const buttonBox = await interactionButton.boundingBox()
  assert.ok(buttonBox)
  await page.mouse.move(buttonBox.x + buttonBox.width / 2, buttonBox.y + buttonBox.height / 2)
  await page.mouse.down()
  buttonStyles = await styles(interactionButton, ['border-top-color', 'background-color'])
  assert.equal(buttonStyles['border-top-color'].trim(), 'rgb(16, 71, 115)')
  assert.equal(buttonStyles['background-color'].trim(), 'rgb(231, 240, 250)')
  await page.mouse.up()

  const disabledButton = page.getByTestId('state-button-disabled')
  assert.equal(await disabledButton.isDisabled(), true)
  assert.equal(
    (await styles(disabledButton, ['color'])).color.trim(),
    'rgb(138, 144, 153)',
  )

  const readonlyInput = page.getByTestId('state-input-readonly')
  assert.equal(await readonlyInput.isEditable(), false)
  const readonlyStyles = await styles(readonlyInput, ['color', 'background-color', 'font-size'])
  assert.equal(readonlyStyles.color.trim(), 'rgb(32, 36, 40)')
  assert.equal(readonlyStyles['background-color'].trim(), 'rgb(247, 248, 250)')
  assert.equal(readonlyStyles['font-size'].trim(), '12px')

  const errorInput = page.getByTestId('state-input-error')
  assert.equal(
    (await styles(errorInput, ['border-top-color']))['border-top-color'].trim(),
    'rgb(180, 35, 24)',
  )

  const mixedCheckbox = page.locator('.state-mixed-checkbox .ui-checkbox')
  await mixedCheckbox.waitFor()
  assert.notEqual(await mixedCheckbox.getAttribute('data-indeterminate'), null)

  const designMode = page.getByRole('button', { name: '设计', exact: true })
  assert.equal(
    (await styles(designMode, ['background-color', 'color']))['background-color'].trim(),
    'rgb(231, 240, 250)',
  )

  const menuTrigger = page.getByTestId('state-menu-trigger')
  await menuTrigger.click()
  const menuPopup = page.locator('.ui-menu-popup')
  await menuPopup.waitFor()
  const menuStyles = await styles(menuPopup, ['border-radius', 'box-shadow'])
  assert.equal(menuStyles['border-radius'].trim(), '4px')
  assert.notEqual(menuStyles['box-shadow'].trim(), 'none')
  await page.keyboard.press('Escape')
  await menuPopup.waitFor({ state: 'hidden' })

  await page.getByTestId('state-dialog-trigger').click()
  const dialog = page.locator('.ui-dialog-popup')
  await dialog.waitFor()
  assert.equal((await styles(dialog, ['border-radius']))['border-radius'].trim(), '4px')
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })

  const splitter = page.getByRole('separator', { name: '样本面板宽度' })
  assert.equal(await splitter.getAttribute('aria-valuenow'), '220')
  await splitter.focus()
  await page.keyboard.press('ArrowRight')
  await waitForAttribute(splitter, 'aria-valuenow', '228')
  await page.keyboard.press('Home')
  await waitForAttribute(splitter, 'aria-valuenow', '180')
  await page.keyboard.press('End')
  await waitForAttribute(splitter, 'aria-valuenow', '320')

  const statusBar = page.getByTestId('state-status-bar')
  const statusStyles = await styles(statusBar, ['height', 'font-size', 'background-color'])
  assert.equal(statusStyles.height.trim(), '26px')
  assert.equal(statusStyles['font-size'].trim(), '11px')
  assert.equal(statusStyles['background-color'].trim(), 'rgb(242, 243, 245)')

  assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join(' | ')}`)
  await page.screenshot({ path: 'artifacts/ui-foundation-state-samples.png', fullPage: true })
  console.log('C1 UI foundation smoke passed: token values, contrast, primitive interaction states, floating surfaces, split keyboard semantics and status density are correct.')
} finally {
  await browser.close()
}
