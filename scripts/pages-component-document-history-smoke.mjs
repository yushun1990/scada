import assert from 'node:assert/strict'
import { chromium, firefox } from 'playwright'
import {
  readPersistedComponent,
  saveAndWait,
  writePersistedComponent,
} from './pages-component-fixture-storage.mjs'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'https://yushun1990.github.io/scada/')
  .replace(/\/?$/, '/')
const browserName = process.env.SCADA_BROWSER ?? 'chromium'
assert.ok(['chromium', 'firefox'].includes(browserName))
const browser = await ({ chromium, firefox })[browserName].launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
const pageErrors = []

page.on('pageerror', (error) => pageErrors.push(error.message))

try {
  await page.goto(`${baseUrl}#/components/new`, { waitUntil: 'load' })
  await page.locator('.studio-shell.component-studio-shell').waitFor()

  const palette = page.getByRole('region', { name: '组件创作素材' })
  const textTool = palette.getByRole('button', { name: '文本', exact: true })
  const rows = page.locator('.component-layer-row')
  const row = (name) => rows.filter({ hasText: name })
  const undo = page.getByRole('button', { name: '撤销', exact: true })
  const redo = page.getByRole('button', { name: '重做', exact: true })

  // Component contracts live on the central definition work page, while the
  // canvas toolbar keeps the document-level undo/redo authority. Switching
  // back to the canvas page also blurs/commits any focused definition field,
  // preserving the legacy toolbar-click commit path.
  const openDefinitionPage = () => page.getByRole('button', { name: 'Coding 开发', exact: true }).click()
  const openCanvasPage = () => page.getByRole('button', { name: '图形化设计', exact: true }).click()
  const undoViaCanvasToolbar = async () => {
    await openCanvasPage()
    await undo.click()
  }
  const redoViaCanvasToolbar = async () => {
    await openCanvasPage()
    await redo.click()
  }

  await textTool.waitFor()
  await textTool.dblclick()
  await row('txt_1').waitFor()
  assert.equal(await rows.count(), 1, 'visual creation must produce one layer')

  await openDefinitionPage()
  const rootInspector = page.locator('.component-root-inspector')
  await rootInspector.waitFor()
  const titleDisplay = page.locator('.component-definition-title-display')
  await titleDisplay.waitFor()
  const originalTitle = (await page.locator('.component-definition-title-text').textContent()).trim()
  assert.ok(originalTitle.length > 0, 'new component must have a title')

  await titleDisplay.click()
  const titleField = page.locator('.component-definition-title-input')
  await titleField.waitFor()
  await titleField.click()
  await titleField.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
  await titleField.press('Backspace')
  await titleField.pressSequentially('History Component', { delay: 5 })
  await titleField.press('Enter')

  // Switching to the canvas page first blurs/commits the focused document
  // field, then the toolbar invokes the same full-document undo authority
  // used for visual operations.
  await undoViaCanvasToolbar()
  await openDefinitionPage()
  await page.locator('.component-definition-title-text').waitFor()
  assert.equal(
    (await page.locator('.component-definition-title-text').textContent()).trim(),
    originalTitle,
    'first undo must revert the complete Component definition field transaction',
  )
  assert.equal(
    await rows.count(),
    1,
    'undoing the definition transaction must preserve the earlier visual edit',
  )

  await undoViaCanvasToolbar()
  assert.equal(
    await rows.count(),
    0,
    'second undo must cross the document boundary and undo the earlier visual edit',
  )

  await redoViaCanvasToolbar()
  await row('txt_1').waitFor()
  await openDefinitionPage()
  await page.locator('.component-definition-title-text').waitFor()
  assert.equal(
    (await page.locator('.component-definition-title-text').textContent()).trim(),
    originalTitle,
    'first redo must restore only the visual edit',
  )

  await redoViaCanvasToolbar()
  await openDefinitionPage()
  await page.locator('.component-definition-title-text').waitFor()
  assert.equal(
    (await page.locator('.component-definition-title-text').textContent()).trim(),
    'History Component',
    'second redo must restore the Component definition edit',
  )
  assert.equal(await rows.count(), 1, 'visual and definition edits must coexist after redo')

  // Text Ctrl/Cmd+Z remains owned by the focused input rather than jumping
  // across the Component document history stack.
  await titleDisplay.click()
  await titleField.focus()
  await titleField.press('End')
  await titleField.pressSequentially('X')
  await titleField.press(process.platform === 'darwin' ? 'Meta+Z' : 'Control+Z')
  assert.notEqual(
    await titleField.inputValue(),
    originalTitle,
    'text undo must not invoke Component document undo',
  )
  await titleField.pressSequentially(' cancelled')
  await titleField.press('Escape')
  await titleField.waitFor({ state: 'detached' })
  assert.equal(
    (await page.locator('.component-definition-title-text').textContent()).trim(),
    'History Component',
    'Escape must cancel the staged Component field transaction',
  )

  await saveAndWait(page)
  const persisted = (await readPersistedComponent(page)).document
  assert.equal(persisted.definition.title, 'History Component')
  assert.equal(persisted.visual.layers.length, 1)

  // Seed one real Property -> Visual Rule reference, then exercise the real
  // contract-key editor. This proves history restores the reconciled document
  // snapshot rather than only the visible Canvas.
  const layerId = persisted.visual.layers[0]?.id
  assert.ok(layerId, 'history fixture requires the persisted text layer')
  const seeded = structuredClone(persisted)
  seeded.definition.properties = {
    ...seeded.definition.properties,
    state: {
      title: 'State',
      kind: 'boolean',
      defaultValue: false,
      bindable: true,
    },
  }
  seeded.visual.rules = [
    ...(seeded.visual.rules ?? []),
    {
      id: 'history-rule',
      enabled: true,
      propertyKey: 'state',
      operator: 'equals',
      compareValue: false,
      layerId,
      target: 'visible',
      value: true,
    },
  ]
  seeded.visual.animations = [
    ...seeded.visual.animations,
    {
      id: 'history-animation', kind: 'fade', enabled: true, layerId,
      opacityMultiplier: 0.5,
      timing: { durationMs: 1000, delayMs: 0, iterations: 1, direction: 'normal', easing: 'linear' },
      activation: { kind: 'property', propertyKey: 'state', operator: 'equals', compareValue: false },
    },
  ]
  await writePersistedComponent(page, seeded)
  await page.reload({ waitUntil: 'load' })
  await page.locator('.studio-shell.component-studio-shell').waitFor()
  await openDefinitionPage()
  await rootInspector.waitFor()

  const propertyItemFor = (key) => rootInspector
    .locator('.component-root-public-properties .contract-row-item')
    .filter({ has: page.locator('.contract-row-name', { hasText: new RegExp(`^${key}$`) }) })
    .first()

  let propertyItem = propertyItemFor('state')
  await propertyItem.getByRole('button', { name: '编辑 state', exact: true }).click()
  const propertyForm = rootInspector.locator('.contract-row-form')
  const keyInput = propertyForm.getByLabel('Property 名称', { exact: true })
  await keyInput.waitFor()
  assert.equal(await keyInput.inputValue(), 'state')

  // The compact form stages its key until explicit Save. Neither Escape/blur
  // nor Cancel may commit that draft or create a document-history entry.
  await keyInput.fill('cancelledState')
  await keyInput.press('Escape')
  await propertyForm.getByRole('button', { name: '取消', exact: true }).click()
  await propertyForm.waitFor({ state: 'detached' })
  propertyItem = propertyItemFor('state')
  await propertyItem.waitFor()
  assert.equal(await propertyItemFor('cancelledState').count(), 0)
  assert.equal(await page.getByRole('button', { name: '保存', exact: true }).isDisabled(), true,
    'canceling a staged contract edit must leave the persisted document clean')

  await propertyItem.getByRole('button', { name: '编辑 state', exact: true }).click()
  await keyInput.fill('renamedState')
  await propertyForm.getByRole('button', { name: '保存', exact: true }).click()
  await propertyItemFor('renamedState').waitFor()

  // The seeded visual rule references the contract key. Renaming the key must
  // reconcile that reference through the document history, so undo/redo of the
  // rename keeps the definition and the rule reference in one transaction.
  await undoViaCanvasToolbar()
  await openDefinitionPage()
  await propertyItemFor('state').waitFor()
  assert.equal(await propertyItemFor('renamedState').count(), 0)

  await redoViaCanvasToolbar()
  await openDefinitionPage()
  await propertyItemFor('renamedState').waitFor()
  assert.equal(await propertyItemFor('state').count(), 0)

  await saveAndWait(page)
  const persistedRenamed = (await readPersistedComponent(page)).document
  assert.ok(persistedRenamed.definition.properties.renamedState)
  assert.equal(persistedRenamed.definition.properties.state, undefined)
  assert.equal(
    persistedRenamed.visual.rules.find((candidate) => candidate.id === 'history-rule')?.propertyKey,
    'renamedState',
    'Property-key redo must preserve reconciled Visual Rule references',
  )
  assert.deepEqual(
    persistedRenamed.visual.animations.find((candidate) => candidate.id === 'history-animation')?.activation,
    { kind: 'property', propertyKey: 'renamedState', operator: 'equals', compareValue: false },
    'the same rename command must preserve the animation activation reference',
  )
  await page.reload({ waitUntil: 'load' })
  await openDefinitionPage()
  await propertyItemFor('renamedState').waitFor()
  assert.deepEqual((await readPersistedComponent(page)).document, persistedRenamed,
    'save/reopen must retain the complete redone contract, rules and animations')

  // PR222-R1: a single compact-form save can rename and change the kind of a
  // Property read by an SVG rule. Exercise the complete document save path,
  // and prove source pruning belongs to that one undoable edit.
  await openCanvasPage()
  await palette.locator('.component-palette-resource-library input[type="file"]').setInputFiles({
    name: 'property-kind.svg', mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80"><rect width="120" height="80" fill="#64748b"/></svg>'),
  })
  await page.locator('.component-palette-resource-item', { hasText: 'property-kind' }).dblclick()
  await rows.filter({ hasText: 'property-kind' }).waitFor()
  await saveAndWait(page)
  const kindSeed = structuredClone((await readPersistedComponent(page)).document)
  const svgLayer = kindSeed.visual.layers.find((layer) => layer.kind === 'svg')
  assert.ok(svgLayer, 'kind-edit fixture requires a real imported SVG layer')
  kindSeed.definition.properties.state = {
    title: 'State', kind: 'select', defaultValue: 'stopped', bindable: true,
    options: [{ label: 'Stopped', value: 'stopped' }, { label: 'Running', value: 'running' }],
  }
  const themeRule = {
    id: 'rule_theme_running_1', enabled: true,
    propertyKey: 'state', operator: 'equals', compareValue: 'running',
    layerId: svgLayer.id, target: 'svg.themeState', value: 'running',
    valueSource: { namespace: 'property', key: 'state' },
  }
  kindSeed.visual.rules.push(themeRule, {
    ...themeRule, id: 'kind-value-only', propertyKey: 'renamedState', compareValue: false,
  }, {
    id: 'kind-compatible-condition', enabled: true,
    propertyKey: 'state', operator: 'equals', compareValue: 'running',
    layerId: svgLayer.id, target: 'opacity', value: 0.5,
  })
  kindSeed.visual.animations.push({
    ...kindSeed.visual.animations[0], id: 'kind-animation', layerId: svgLayer.id,
    activation: { kind: 'property', propertyKey: 'state', operator: 'equals', compareValue: 'running' },
  })
  await writePersistedComponent(page, kindSeed)
  await page.reload({ waitUntil: 'load' })
  await openDefinitionPage()
  await propertyItemFor('state').waitFor()
  const persistedBeforeKindEdit = (await readPersistedComponent(page)).document

  await propertyItemFor('state').getByRole('button', { name: '编辑 state', exact: true }).click()
  await keyInput.fill('kindChangedState')
  await propertyForm.getByLabel('Property 类型', { exact: true }).click()
  await page.getByRole('option', { name: '布尔', exact: true }).click()
  await propertyForm.getByRole('button', { name: '保存', exact: true }).click()
  await propertyItemFor('kindChangedState').waitFor()
  assert.deepEqual((await readPersistedComponent(page)).document, persistedBeforeKindEdit,
    'committing the form must not persist before document Save')

  await undoViaCanvasToolbar()
  await openDefinitionPage()
  await propertyItemFor('state').waitFor()
  assert.equal(await propertyItemFor('kindChangedState').count(), 0)
  await saveAndWait(page)
  const undoneKindEdit = (await readPersistedComponent(page)).document
  assert.deepEqual(undoneKindEdit.definition, persistedBeforeKindEdit.definition,
    'one undo restores the original Property name and select kind')
  assert.deepEqual(undoneKindEdit.visual, persistedBeforeKindEdit.visual,
    'the same undo restores both removed SVG value sources and the original conditions/animation')

  await redoViaCanvasToolbar()
  await openDefinitionPage()
  await propertyItemFor('kindChangedState').waitFor()
  await saveAndWait(page)
  const persistedKindEdit = (await readPersistedComponent(page)).document
  assert.equal(persistedKindEdit.definition.properties.state, undefined)
  assert.equal(persistedKindEdit.definition.properties.kindChangedState.kind, 'boolean')
  assert.deepEqual(persistedKindEdit.visual.rules, [
    ...persistedBeforeKindEdit.visual.rules.filter((rule) =>
      !['rule_theme_running_1', 'kind-value-only', 'kind-compatible-condition'].includes(rule.id)),
    {
      id: 'kind-compatible-condition', enabled: true,
      propertyKey: 'kindChangedState', operator: 'equals', compareValue: false,
      layerId: svgLayer.id, target: 'opacity', value: 0.5,
    },
  ], 'Save removes only incompatible Property reads and retains the repaired compatible condition')
  assert.deepEqual(persistedKindEdit.visual.animations.find((animation) => animation.id === 'kind-animation').activation,
    { kind: 'property', propertyKey: 'kindChangedState', operator: 'equals', compareValue: false })
  await page.reload({ waitUntil: 'load' })
  await openDefinitionPage()
  await propertyItemFor('kindChangedState').waitFor()
  assert.deepEqual((await readPersistedComponent(page)).document, persistedKindEdit,
    'rename plus kind edit must save and reopen the complete reconciled document')

  assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join(' | ')}`)
  console.log(`Component document history smoke passed (${browserName}): visual, definition and contract-reference edits share one undo/redo authority; rename plus kind change prunes incompatible SVG sources atomically; save/reopen preserves compatible rules and animations.`)
} finally {
  await browser.close()
}
