import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import {
  readPersistedComponent,
  saveAndWait,
} from './pages-component-fixture-storage.mjs'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'https://yushun1990.github.io/scada/')
  .replace(/\/?$/, '/')
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(error.message))

const authorRef = 'statusLamp'
const renamedAuthorRef = 'runLamp'
const svgSource = `
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80">
  <g id="status">
    <rect id="indicator" x="10" y="10" width="100" height="60" fill="#ef4444"/>
  </g>
</svg>
`.trim()

function globalAssetImportControl(currentPage) {
  return currentPage.locator('.component-asset-import-control')
    .filter({ hasText: '导入 SVG / 图片' })
    .first()
}

function findVisualLayer(document, kind, name) {
  return document.visual.layers.find((layer) => layer.kind === kind && layer.name === name)
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

async function waitForDenseCanvasColor(currentPage, matcher) {
  await currentPage.waitForFunction((expected) => {
    const canvases = [...document.querySelectorAll('canvas')]
    return canvases.some((canvas) => {
      const context = canvas.getContext('2d')
      if (!context || canvas.width <= 0 || canvas.height <= 0) return false
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      for (let index = 0; index < pixels.length; index += 4) {
        const red = pixels[index]
        const green = pixels[index + 1]
        const blue = pixels[index + 2]
        const alpha = pixels[index + 3]
        if (
          alpha >= expected.alphaMin &&
          red >= expected.redMin && red <= expected.redMax &&
          green >= expected.greenMin && green <= expected.greenMax &&
          blue >= expected.blueMin && blue <= expected.blueMax
        ) return true
      }
      return false
    })
  }, matcher)
}

async function chooseSelectOption(currentPage, ariaLabel, optionName) {
  const trigger = currentPage.getByLabel(ariaLabel, { exact: true })
  await trigger.click()
  await currentPage.getByRole('option', { name: optionName, exact: false }).click()
}

async function openInspectorGroup(currentPage, title) {
  const group = currentPage.locator('.inspector-collapsible')
    .filter({ has: currentPage.locator('.inspector-group-title', { hasText: title }) })
    .first()
  const header = group.locator('.inspector-group-header')
  if ((await header.getAttribute('aria-expanded')) !== 'true') {
    await header.click()
  }
  return group
}

try {
  console.log(`Verifying managed SVG author refs and UX1.5 rule-target convergence: ${baseUrl}#/components/new`)
  await page.goto(`${baseUrl}#/components/new`, { waitUntil: 'networkidle' })
  await page.getByText('Component Editor', { exact: true }).waitFor()

  const publicProperties = page.locator('.component-root-public-properties')
  await publicProperties.waitFor()
  await publicProperties.getByRole('button', { name: '+ 添加属性', exact: true }).click()
  await publicProperties.locator('.property-contract-item').waitFor()

  const importControl = globalAssetImportControl(page)
  const input = importControl.locator('input[type="file"]')
  await input.waitFor({ state: 'attached' })
  await input.setInputFiles({
    name: 'ux1.3-author-ref.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(svgSource),
  })

  await page.locator('.component-layer-row', { hasText: 'ux1.3-author-ref' }).waitFor()
  await page.locator('.component-managed-svg-editor').waitFor()

  const rectRow = page.locator('.component-managed-svg-row', { hasText: 'svg-tag-000003' })
  await rectRow.click()
  await page.locator('.component-canvas-status', { hasText: 'SVG svg-tag-000003' }).waitFor()
  await waitForDenseCanvasColor(page, {
    alphaMin: 80,
    redMin: 105,
    redMax: 145,
    greenMin: 35,
    greenMax: 85,
    blueMin: 210,
    blueMax: 255,
  })

  const authorRefField = page.locator('.component-managed-svg-properties .property-field')
    .filter({ hasText: '引用名称' })
    .first()
  const authorRefInput = authorRefField.locator('input')
  assert.equal(await authorRefInput.inputValue(), '')
  await authorRefInput.fill(`  ${authorRef}  `)
  await authorRefInput.blur()
  await page.locator('.component-managed-svg-message', { hasText: '引用名称已更新' }).waitFor()
  await page.locator('.component-managed-svg-row', { hasText: `@${authorRef}` }).waitFor()

  await saveAndWait(page)
  const savedUrl = page.url()
  const persisted = await readPersistedComponent(page)
  assert.ok(
    persisted.document.definition.properties.property1,
    'the real root Property authoring flow persists a Rule-driving Property',
  )
  const svgLayer = findVisualLayer(persisted.document, 'svg', 'ux1.3-author-ref')
  assert.ok(svgLayer?.document)
  const persistedRect = findManagedTag(svgLayer.document, 'svg-tag-000003')
  assert.ok(persistedRect)
  assert.equal(persistedRect.authorRef, authorRef)
  assert.match(svgLayer.assetRef, /^data:image\/svg\+xml;charset=utf-8,/)
  assert.doesNotMatch(
    svgLayer.assetRef,
    new RegExp(authorRef),
    'authoring alias must not become serialized SVG/runtime resource identity',
  )

  await page.goto(savedUrl, { waitUntil: 'networkidle' })
  await page.getByText('Component Editor', { exact: true }).waitFor()
  await page.locator('.component-layer-row', { hasText: 'ux1.3-author-ref' }).click()
  const reloadedRow = page.locator('.component-managed-svg-row', { hasText: `@${authorRef}` })
  await reloadedRow.waitFor()
  assert.ok((await reloadedRow.textContent())?.includes('svg-tag-000003'))
  await reloadedRow.click()
  await page.locator('.component-canvas-status', { hasText: 'SVG svg-tag-000003' }).waitFor()

  const reloadedAuthorRefField = page.locator('.component-managed-svg-properties .property-field')
    .filter({ hasText: '引用名称' })
    .first()
  assert.equal(await reloadedAuthorRefField.locator('input').inputValue(), authorRef)

  const ruleGroup = await openInspectorGroup(page, '视觉规则')
  await ruleGroup.getByRole('button', { name: '+ 添加视觉规则', exact: true }).click()

  const ruleItem = ruleGroup.locator('.component-rule-item').first()
  await ruleItem.waitFor()
  assert.equal(
    await ruleItem.getAttribute('data-svg-tag-id'),
    'svg-tag-000003',
    'new rule defaults to the current canonical managed-SVG selection',
  )
  const ruleTarget = ruleItem.getByLabel('rule1 作用对象', { exact: true })
  await ruleTarget.waitFor()
  assert.match(await ruleTarget.textContent() ?? '', new RegExp(`@${authorRef}`))

  await chooseSelectOption(page, 'rule1 作用对象', 'svg-tag-000002')
  await page.locator('.component-canvas-status', { hasText: 'SVG svg-tag-000002' }).waitFor()
  assert.equal(await ruleItem.getAttribute('data-svg-tag-id'), 'svg-tag-000002')

  await chooseSelectOption(page, 'rule1 作用对象', `@${authorRef}`)
  await page.locator('.component-canvas-status', { hasText: 'SVG svg-tag-000003' }).waitFor()
  assert.equal(await ruleItem.getAttribute('data-svg-tag-id'), 'svg-tag-000003')

  const currentAliasInput = page.locator('.component-managed-svg-properties .property-field')
    .filter({ hasText: '引用名称' })
    .first()
    .locator('input')
  await currentAliasInput.fill(renamedAuthorRef)
  await currentAliasInput.blur()
  await page.locator('.component-managed-svg-message', { hasText: '引用名称已更新' }).waitFor()
  assert.match(await ruleTarget.textContent() ?? '', new RegExp(`@${renamedAuthorRef}`))
  assert.equal(await ruleItem.getAttribute('data-svg-tag-id'), 'svg-tag-000003')

  await saveAndWait(page)
  const convergedPersisted = await readPersistedComponent(page)
  const convergedSvg = findVisualLayer(convergedPersisted.document, 'svg', 'ux1.3-author-ref')
  assert.ok(convergedSvg?.document)
  assert.equal(
    findManagedTag(convergedSvg.document, 'svg-tag-000003')?.authorRef,
    renamedAuthorRef,
  )
  const persistedRule = convergedPersisted.document.visual.rules?.find((rule) => rule.id === 'rule1')
  assert.ok(persistedRule)
  assert.equal(persistedRule.svgTagId, 'svg-tag-000003')
  assert.equal(
    Object.prototype.hasOwnProperty.call(persistedRule, 'authorRef'),
    false,
    'Visual Rule persistence must not gain an authorRef runtime address',
  )

  await page.goto(savedUrl, { waitUntil: 'networkidle' })
  await page.getByText('Component Editor', { exact: true }).waitFor()
  await page.locator('.component-layer-row', { hasText: 'ux1.3-author-ref' }).click()
  await page.locator('.component-managed-svg-row', { hasText: `@${renamedAuthorRef}` }).click()
  const reopenedRuleGroup = await openInspectorGroup(page, '视觉规则')
  const reopenedRule = reopenedRuleGroup.locator('.component-rule-item[data-svg-tag-id="svg-tag-000003"]')
  await reopenedRule.waitFor()
  const reopenedRuleTarget = reopenedRule.getByLabel('rule1 作用对象', { exact: true })
  await reopenedRuleTarget.waitFor()
  assert.match(await reopenedRuleTarget.textContent() ?? '', new RegExp(`@${renamedAuthorRef}`))
  await page.locator('.component-canvas-status', { hasText: 'SVG svg-tag-000003' }).waitFor()

  await page.getByLabel('预览', { exact: true }).click()
  await page.locator('.status-mode', { hasText: '预览' }).waitFor()
  assert.equal(
    await reopenedRuleTarget.isDisabled(),
    true,
    'Preview keeps Visual Rule target authoring read-only',
  )

  assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join(' | ')}`)
  console.log(
    'Managed SVG author-reference and UX1.5 target-convergence browser proof passed: a real root Property authoring flow drives Rule creation; current SVG selection defaults new Visual Rules to canonical tagId; Rule target changes drive the same Canvas/Inspector selection; authorRef labels rename without rewriting svgTagId; save/reopen preserves both authorities; and Preview remains read-only.',
  )
} finally {
  await browser.close()
}
