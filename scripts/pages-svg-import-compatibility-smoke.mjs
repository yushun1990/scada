import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'https://yushun1990.github.io/scada/')
  .replace(/\/?$/, '/')
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await context.newPage()
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(error.message))

const unsafeStyledSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
  <style>.bad { fill: url(https://example.com/paint.svg#red); }</style>
  <rect class="bad" width="40" height="40"/>
</svg>
`.trim()

const styledSvg = `
<svg
  xmlns="http://www.w3.org/2000/svg"
  xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
  xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
  width="120"
  height="80"
  viewBox="0 0 120 80"
  style="enable-background:new 0 0 120 80;shape-rendering:geometricPrecision"
>
  <style type="text/css">
    .st0 { fill: #22c55e; stroke: #0f172a; stroke-width: 2; paint-order: stroke fill markers; }
    #lamp { opacity: 0.75; }
  </style>
  <sodipodi:namedview pagecolor="#ffffff"/>
  <g inkscape:label="Layer 1">
    <rect id="lamp" class="st0" x="10" y="10" width="100" height="60" rx="8"/>
  </g>
</svg>
`.trim()

const staticStructuralSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="96" height="64" viewBox="0 0 96 64">
  <defs>
    <mask id="cutout">
      <rect width="96" height="64" fill="#fff"/>
      <circle cx="48" cy="32" r="10" fill="#000"/>
    </mask>
    <filter id="soften" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur stdDeviation="0.6"/>
    </filter>
  </defs>
  <rect
    x="8"
    y="8"
    width="80"
    height="48"
    rx="6"
    fill="#38bdf8"
    mask="url(#cutout)"
    filter="url(#soften)"
    paint-order="stroke fill markers"
  />
</svg>
`.trim()

function globalAssetImportControl() {
  return page.locator('.component-asset-import-control')
    .filter({ hasText: '导入 SVG / 图片' })
    .first()
}

async function waitForAssetInputReady() {
  await page.waitForFunction(() => {
    const control = [...document.querySelectorAll('.component-asset-import-control')]
      .find((candidate) => candidate.textContent?.includes('导入 SVG / 图片'))
    const input = control?.querySelector('input[type="file"]')
    return input instanceof HTMLInputElement && !input.disabled && input.value === ''
  })
}

function managedField(label) {
  return page.locator('.component-managed-svg-properties .property-field')
    .filter({ hasText: label })
    .first()
    .locator('input')
}

try {
  console.log(`Checking real-world SVG stylesheet compatibility: ${baseUrl}#/components/new`)
  await page.goto(`${baseUrl}#/components/new`, { waitUntil: 'networkidle' })
  await page.getByText('Component Editor', { exact: true }).waitFor()
  await waitForAssetInputReady()

  await globalAssetImportControl().locator('input[type="file"]').setInputFiles({
    name: 'unsafe-stylesheet.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(unsafeStyledSvg),
  })
  await globalAssetImportControl().locator('.component-asset-import-message').waitFor()
  assert.equal(
    await page.locator('.component-layer-row').count(),
    0,
    'external CSS resources remain fail-closed',
  )
  await waitForAssetInputReady()

  await globalAssetImportControl().locator('input[type="file"]').setInputFiles({
    name: 'styled-inkscape-like.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(styledSvg),
  })
  await page.locator('.component-layer-row', { hasText: 'styled-inkscape-like' }).waitFor()
  await page.locator('.component-managed-svg-editor').waitFor()
  await page.locator('.component-managed-svg-row', { hasText: 'svg-tag-000003' }).click()

  assert.equal(await managedField('Fill').inputValue(), '#22c55e')
  assert.equal(await managedField('Stroke').inputValue(), '#0f172a')
  assert.equal(await managedField('Stroke width').inputValue(), '2')
  assert.equal(await managedField('Opacity').inputValue(), '0.75')

  await waitForAssetInputReady()
  await globalAssetImportControl().locator('input[type="file"]').setInputFiles({
    name: 'static-mask-filter.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(staticStructuralSvg),
  })

  // The first imported SVG remains selected, so a second SVG import intentionally
  // replaces that layer instead of creating a second row. Verify replacement
  // semantics and inspect the new managed tree rather than waiting for a new name.
  await globalAssetImportControl()
    .locator('.component-asset-import-message', { hasText: '资源已替换' })
    .waitFor()
  assert.equal(await page.locator('.component-layer-row').count(), 1)
  await page.locator('.component-managed-svg-row', { hasText: '<mask>' }).waitFor()
  await page.locator('.component-managed-svg-row', { hasText: '#cutout' }).waitFor()
  await page.locator('.component-managed-svg-row', { hasText: '<filter>' }).waitFor()
  await page.locator('.component-managed-svg-row', { hasText: '#soften' }).waitFor()
  await page.locator('.component-managed-svg-row', { hasText: '<feGaussianBlur>' }).waitFor()

  assert.deepEqual(pageErrors, [])
  console.log(
    'SVG import compatibility smoke passed: controlled presentation stays editable, safe residual style/attributes and static mask/filter structures survive managed replacement, and external CSS resources remain blocked.',
  )
} finally {
  await context.close()
  await browser.close()
}
