import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
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
  return currentPage.getByRole('region', { name: '组件创作素材' })
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
  if (title === '视觉规则') await currentPage.getByRole('tab', { name: '行为', exact: true }).click()
  const group = currentPage.locator('.inspector-collapsible')
    .filter({ has: currentPage.locator('.inspector-group-title', { hasText: title }) })
    .first()
  const header = group.locator('.inspector-group-header')
  if ((await header.getAttribute('aria-expanded')) !== 'true') {
    await header.click()
  }
  return group
}

// The managed-SVG inner element editor is retired; authorRef authoring now
// goes through the SVG source marking workbench (id tags carry authorRef).
async function authorTagViaMarkingWorkbench(currentPage, tagId, name) {
  // The header button's accessible name is shadowed by its parent group
  // header, so target the dedicated class instead of a role query.
  await currentPage.locator('.component-svg-header-code-btn').click()
  const modal = currentPage.locator('.component-svg-modal-popup')
  await modal.waitFor()
  await modal.locator(`[data-scada-tag="${tagId}"]`).click()
  const nameInput = modal.locator('input[placeholder="如 fan, alarmLed"]')
  await nameInput.waitFor()
  await nameInput.fill(name)
  await modal.getByRole('button', { name: '确定标记', exact: true }).click()
  await modal.locator('.component-svg-modal-status-message', { hasText: '已为' }).waitFor()
  await modal.getByRole('button', { name: '应用', exact: true }).click()
  await modal.waitFor({ state: 'detached' })
}

try {
  console.log(`Verifying managed SVG author refs and UX1.5 rule-target convergence: ${baseUrl}#/components/new`)
  await page.goto(`${baseUrl}#/components/new`, { waitUntil: 'networkidle' })
  await page.locator('.studio-shell.component-studio-shell').waitFor()

  // Component contracts live on the central Coding 开发 work page.
  await page.getByRole('button', { name: 'Coding 开发', exact: true }).click()
  const publicProperties = page.locator('.component-root-public-properties')
  await publicProperties.waitFor()
  await publicProperties.getByRole('button', { name: '+ 添加属性', exact: true }).click()
  await publicProperties.locator('.property-contract-item').waitFor()
  await page.getByRole('button', { name: '图形化设计', exact: true }).click()

  const importControl = globalAssetImportControl(page)
  const input = importControl.locator('.component-palette-resource-library input[type="file"]')
  await input.waitFor({ state: 'attached' })
  await input.setInputFiles({
    name: 'ux1.3-author-ref.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(svgSource),
  })

  await page.locator('.component-palette-resource-item', { hasText: 'ux1.3-author-ref' }).dblclick()
  await page.locator('.component-layer-row', { hasText: 'ux1.3-author-ref' }).waitFor()
  await page.locator('.component-svg-inspector-group').waitFor()
  assert.equal(
    await page.getByText('SVG 内部元素', { exact: true }).count(),
    0,
    'the retired managed-SVG inner element inspector group must stay removed',
  )
  assert.equal(
    await page.getByLabel('ux1.3-author-ref 资源填充模式', { exact: true }).count(),
    0,
    'the retired asset style group must stay removed for SVG layers',
  )

  await authorTagViaMarkingWorkbench(page, 'svg-tag-000003', `  ${authorRef}  `)
  await page.locator('.component-svg-tag-card', { hasText: authorRef }).waitFor()

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
  // The marking workbench authors aliases as real SVG id attributes (peer to
  // ids carried by imported files), so the alias legitimately round-trips in
  // the serialized bytes; runtime identity stays the canonical svgTagId below.
  assert.match(
    svgLayer.assetRef,
    new RegExp(`id%3D%22${authorRef}%22`),
    'the marking workbench id must round-trip through the serialized SVG',
  )
  assert.ok(
    svgLayer.assetRef.includes('data-scada-tag%3D%22svg-tag-000003%22'),
    'serialized runtime identity stays the canonical svgTagId, not the alias',
  )

  await page.goto(savedUrl, { waitUntil: 'networkidle' })
  await page.locator('.studio-shell.component-studio-shell').waitFor()
  await page.locator('.component-layer-row', { hasText: 'ux1.3-author-ref' }).click()
  await page.locator('.component-svg-tag-card', { hasText: authorRef }).waitFor()

  const ruleGroup = await openInspectorGroup(page, '视觉规则')
  await ruleGroup.getByRole('button', { name: '+ 添加视觉规则', exact: true }).click()

  const ruleItem = ruleGroup.locator('.component-rule-item').first()
  await ruleItem.waitFor()
  assert.equal(
    await ruleItem.getAttribute('data-svg-tag-id'),
    null,
    'a fresh rule stays layer-scoped while no managed-SVG selection exists',
  )
  await chooseSelectOption(page, 'rule1 作用对象', `@${authorRef}`)
  await page.locator('.component-canvas-status', { hasText: 'SVG svg-tag-000003' }).waitFor()
  assert.equal(await ruleItem.getAttribute('data-svg-tag-id'), 'svg-tag-000003')
  await waitForDenseCanvasColor(page, {
    alphaMin: 80,
    redMin: 105,
    redMax: 145,
    greenMin: 35,
    greenMax: 85,
    blueMin: 210,
    blueMax: 255,
  })

  await ruleGroup.getByRole('button', { name: '+ 添加视觉规则', exact: true }).click()
  const ruleItemTwo = ruleGroup.locator('.component-rule-item').nth(1)
  await ruleItemTwo.waitFor()
  assert.equal(
    await ruleItemTwo.getAttribute('data-svg-tag-id'),
    'svg-tag-000003',
    'new rules default to the current canonical managed-SVG selection',
  )

  await chooseSelectOption(page, 'rule1 作用对象', 'svg-tag-000002')
  await page.locator('.component-canvas-status', { hasText: 'SVG svg-tag-000002' }).waitFor()
  assert.equal(await ruleItem.getAttribute('data-svg-tag-id'), 'svg-tag-000002')

  await chooseSelectOption(page, 'rule1 作用对象', `@${authorRef}`)
  await page.locator('.component-canvas-status', { hasText: 'SVG svg-tag-000003' }).waitFor()
  assert.equal(await ruleItem.getAttribute('data-svg-tag-id'), 'svg-tag-000003')

  await page.getByRole('tab', { name: '属性', exact: true }).click()
  await authorTagViaMarkingWorkbench(page, 'svg-tag-000003', renamedAuthorRef)
  await page.locator('.component-svg-tag-card', { hasText: renamedAuthorRef }).waitFor()
  await openInspectorGroup(page, '视觉规则')
  const ruleTarget = ruleItem.getByLabel('rule1 作用对象', { exact: true })
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
  await page.locator('.studio-shell.component-studio-shell').waitFor()
  await page.locator('.component-layer-row', { hasText: 'ux1.3-author-ref' }).click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  await page.locator('.component-svg-tag-card', { hasText: renamedAuthorRef }).waitFor()
  const reopenedRuleGroup = await openInspectorGroup(page, '视觉规则')
  const reopenedRule = reopenedRuleGroup.locator('.component-rule-item[data-svg-tag-id="svg-tag-000003"]').first()
  await reopenedRule.waitFor()
  const reopenedRuleTarget = reopenedRule.getByLabel('rule1 作用对象', { exact: true })
  await reopenedRuleTarget.waitFor()
  assert.match(await reopenedRuleTarget.textContent() ?? '', new RegExp(`@${renamedAuthorRef}`))
  await chooseSelectOption(page, 'rule1 作用对象', 'svg-tag-000002')
  await page.locator('.component-canvas-status', { hasText: 'SVG svg-tag-000002' }).waitFor()
  await chooseSelectOption(page, 'rule1 作用对象', `@${renamedAuthorRef}`)
  await page.locator('.component-canvas-status', { hasText: 'SVG svg-tag-000003' }).waitFor()

  await page.getByLabel('预览', { exact: true }).click()
  await page.locator('.status-mode', { hasText: '预览' }).waitFor()
  assert.equal(
    await reopenedRuleTarget.isDisabled(),
    true,
    'Preview keeps Visual Rule target authoring read-only',
  )
  await mkdir('artifacts', { recursive: true })
  await page.screenshot({ path: 'artifacts/managed-svg-rules-preview.png' })

  assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join(' | ')}`)
  console.log(
    'Managed SVG author-reference and UX1.5 target-convergence browser proof passed: a real root Property authoring flow drives Rule creation; the marking workbench authors authorRef ids; Rule target changes drive the same Canvas/Inspector selection and new rules default to it; authorRef labels rename without rewriting svgTagId; save/reopen preserves both authorities; and Preview remains read-only.',
  )
} finally {
  await browser.close()
}
