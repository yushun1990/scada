import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'https://yushun1990.github.io/scada/')
  .replace(/\/?$/, '/')
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await context.newPage()
const pageErrors = []

page.on('pageerror', (error) => pageErrors.push(error.message))

try {
  await mkdir('artifacts', { recursive: true })

  console.log(`Opening deployed SCADA workspace for add-component toast regression: ${baseUrl}#/works`)
  await page.goto(`${baseUrl}#/works`, { waitUntil: 'networkidle' })
  await page.getByText('SCADA 作品', { exact: true }).first().waitFor()
  await page.getByRole('button', { name: '+ 新建作品', exact: true }).click()
  await page.locator('.studio-shell.scada-studio-shell').waitFor()

  const toolbar = page.getByRole('toolbar', { name: 'Studio 主工具栏' })
  const canvasArea = page.getByLabel('SCADA 编辑画布')
  await toolbar.waitFor()
  await canvasArea.waitFor()

  const geometry = toolbar.locator('.scada-geometry-tool-group')
  assert.equal(await geometry.evaluate((element) => getComputedStyle(element).borderLeftWidth), '1px',
    'command families retain the shared C2 divider')

  const firstComponent = page.locator('.component-item').first()
  await firstComponent.waitFor()
  const componentLabel = (await firstComponent.locator('strong').textContent())?.trim() ?? 'component'
  await firstComponent.click()

  const toast = page.locator('.canvas-toast[role="status"]')
  await toast.waitFor()
  const [toastBox, canvasBox, toastStyles] = await Promise.all([
    toast.boundingBox(),
    canvasArea.boundingBox(),
    toast.evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        // `top:auto` is resolved to a used pixel value by getComputedStyle()
        // when the element is bottom-positioned, so keep it diagnostic only.
        top: style.top,
        bottom: style.bottom,
        height: style.height,
        backgroundColor: style.backgroundColor,
        borderTopWidth: style.borderTopWidth,
        borderRadius: style.borderRadius,
      }
    }),
  ])

  assert.ok(toastBox, 'SCADA feedback toast must be measurable after adding a component')
  assert.ok(canvasBox, 'SCADA canvas area must be measurable')
  console.log(`SCADA add-component toast (${componentLabel}): ${JSON.stringify({ toastBox, canvasBox, toastStyles })}`)

  // Capture evidence before assertions so any future regression still leaves a
  // deployed-page screenshot for visual diagnosis.
  await page.screenshot({ path: 'artifacts/scada-add-component-toast-1400.png', fullPage: true })

  const toastBottomGap = (canvasBox.y + canvasBox.height) - (toastBox.y + toastBox.height)

  assert.equal(toastStyles.bottom, '8px', 'SCADA feedback toast must stay pinned to the footer area')
  assert.ok(
    Math.abs(toastBottomGap - 8) <= 1,
    `SCADA feedback toast rendered bottom gap must remain 8px, got ${toastBottomGap}px`,
  )
  assert.equal(toastStyles.borderTopWidth, '0px', 'SCADA feedback toast must not regain the floating-pill border')
  assert.equal(toastStyles.borderRadius, '0px', 'SCADA feedback toast must not regain the floating-pill radius')
  assert.ok(
    toastStyles.backgroundColor === 'rgba(0, 0, 0, 0)' || toastStyles.backgroundColor === 'transparent',
    `SCADA feedback toast must remain transparent, got ${toastStyles.backgroundColor}`,
  )
  assert.ok(toastBox.height <= 24, `SCADA feedback toast must remain one-line height, got ${toastBox.height}px`)
  assert.ok(toastBox.width <= 380, `SCADA feedback toast must remain compact, got ${toastBox.width}px`)
  assert.ok(
    toastBox.y >= canvasBox.y + canvasBox.height * 0.8,
    `SCADA feedback toast must stay near the canvas footer instead of stretching through the center (${toastBox.y}/${canvasBox.y + canvasBox.height})`,
  )

  assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join(' | ')}`)
  console.log('Pages SCADA toast smoke passed: add-component feedback stays compact at the footer and toolbar families retain the shared C2 divider.')
} finally {
  await browser.close()
}
