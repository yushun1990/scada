import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import {
  readPersistedComponent,
  saveAndWait,
} from './pages-component-fixture-storage.mjs'

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
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
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
  return page.getByRole('region', { name: '组件创作素材' })
}

function selectedAssetReplacementControl() {
  return page.locator('.component-layer-inspector .component-asset-import-control')
    .filter({ hasText: '替换文件' })
    .first()
}

async function waitForAssetInputReady() {
  await page.waitForFunction(() => {
    const input = document.querySelector('.component-palette-resource-library .component-palette-resource-input')
    return input instanceof HTMLInputElement && !input.disabled && input.value === ''
  })
}

function findVisualSvgLayer(document, name) {
  return document.visual.layers.find((layer) => layer.kind === 'svg' && layer.name === name)
}

function findManagedTag(document, tagId) {
  const visit = (node) => {
    if (!node || node.kind !== 'element') return null
    if (node.tagId === tagId) return node
    for (const child of node.children ?? []) {
      const found = visit(child)
      if (found) return found
    }
    return null
  }
  return visit(document.root)
}

function managedAttribute(node, name) {
  return node?.attributes.find((attribute) => attribute.name === name)?.value ?? null
}

function collectElementTagNames(node, acc = new Set()) {
  if (!node || node.kind !== 'element') return acc
  acc.add(node.tagName)
  for (const child of node.children ?? []) collectElementTagNames(child, acc)
  return acc
}

function findManagedElementBy(document, predicate) {
  const visit = (node) => {
    if (!node || node.kind !== 'element') return null
    if (predicate(node)) return node
    for (const child of node.children ?? []) {
      const found = visit(child)
      if (found) return found
    }
    return null
  }
  return visit(document.root)
}

try {
  console.log(`Checking real-world SVG stylesheet compatibility: ${baseUrl}#/components/new`)
  await page.goto(`${baseUrl}#/components/new`, { waitUntil: 'networkidle' })
  await page.locator('.studio-shell.component-studio-shell').waitFor()
  await waitForAssetInputReady()

  await globalAssetImportControl().locator('.component-palette-resource-library input[type="file"]').setInputFiles({
    name: 'unsafe-stylesheet.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(unsafeStyledSvg),
  })
  await globalAssetImportControl().locator('.component-palette-message').waitFor()
  assert.equal(
    await page.locator('.component-layer-row').count(),
    0,
    'external CSS resources remain fail-closed',
  )
  await waitForAssetInputReady()

  await globalAssetImportControl().locator('.component-palette-resource-library input[type="file"]').setInputFiles({
    name: 'styled-inkscape-like.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(styledSvg),
  })
  await page.locator('.component-palette-resource-item', { hasText: 'styled-inkscape-like' }).dblclick()
  await page.locator('.component-layer-row', { hasText: 'styled-inkscape-like' }).waitFor()
  await page.locator('.component-svg-inspector-group').waitFor()

  // The managed-SVG inner element editor is retired; controlled presentation
  // stays verifiable through the persisted document's discrete attributes.
  await saveAndWait(page)
  let persisted = await readPersistedComponent(page)
  let svgLayer = findVisualSvgLayer(persisted.document, 'styled-inkscape-like')
  assert.ok(svgLayer?.document, 'styled SVG must persist as a managed SVG document')
  const styledRect = findManagedTag(svgLayer.document, 'svg-tag-000003')
  assert.ok(styledRect, 'styled rect must keep its canonical managed tag')
  assert.equal(managedAttribute(styledRect, 'fill'), '#22c55e')
  assert.equal(managedAttribute(styledRect, 'stroke'), '#0f172a')
  assert.equal(managedAttribute(styledRect, 'stroke-width'), '2')
  assert.equal(managedAttribute(styledRect, 'opacity'), '0.75')

  // Saving advances the route off #/components/new and remounts the editor;
  // reselect the layer so the Inspector resource control is mounted again.
  await page.locator('.component-layer-row', { hasText: 'styled-inkscape-like' }).click()

  // Palette import is creation-only under UX1. Replace the selected managed SVG
  // through the Inspector resource control so this smoke exercises the accepted
  // Palette -> Navigator/Canvas -> Inspector authoring authority.
  const replacementControl = selectedAssetReplacementControl()
  const replacementInput = replacementControl.locator('input[type="file"]')
  await replacementInput.waitFor({ state: 'attached' })
  await replacementInput.setInputFiles({
    name: 'static-mask-filter.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(staticStructuralSvg),
  })

  await replacementControl
    .locator('.component-asset-import-message', { hasText: '资源已替换' })
    .waitFor()
  assert.equal(await page.locator('.component-layer-row').count(), 1)

  await saveAndWait(page)
  persisted = await readPersistedComponent(page)
  // Replacement preserves layer identity, so the layer keeps its original name.
  svgLayer = findVisualSvgLayer(persisted.document, 'styled-inkscape-like')
  assert.ok(svgLayer?.document, 'replaced SVG must persist as a managed SVG document')
  const tagNames = collectElementTagNames(svgLayer.document.root)
  for (const structuralTag of ['mask', 'filter', 'feGaussianBlur', 'defs']) {
    assert.ok(tagNames.has(structuralTag), `static ${structuralTag} structure must survive replacement`)
  }
  const mainRect = findManagedElementBy(
    svgLayer.document,
    (node) => node.tagName === 'rect' && managedAttribute(node, 'mask') === 'url(#cutout)',
  )
  assert.ok(mainRect, 'replaced main rect must keep its canonical managed tag')
  assert.equal(managedAttribute(mainRect, 'mask'), 'url(#cutout)')
  assert.equal(managedAttribute(mainRect, 'filter'), 'url(#soften)')

  assert.deepEqual(pageErrors, [])
  console.log(
    'SVG import compatibility smoke passed: controlled presentation persists as discrete managed attributes, safe residual style/attributes and static mask/filter structures survive managed Inspector replacement, and external CSS resources remain blocked.',
  )
} finally {
  await context.close()
  await browser.close()
}
