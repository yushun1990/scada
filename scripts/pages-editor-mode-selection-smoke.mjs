import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import {
  readPersistedScene,
  saveSceneAndWait,
} from './pages-scene-fixture-storage.mjs'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'https://yushun1990.github.io/scada/')
  .replace(/\/?$/, '/')
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(error.message))

const saveStatus = () => page.locator('.document-save-status')

async function waitForSaveStatus(text) {
  await saveStatus().getByText(text, { exact: true }).waitFor()
}

async function scenePointAt(clientX, clientY) {
  await page.mouse.move(clientX, clientY)
  const text = await page.locator('.pointer-position').textContent()
  const match = /^X\s+(-?\d+)\s+Y\s+(-?\d+)$/.exec(text?.trim() ?? '')
  return match ? { x: Number(match[1]), y: Number(match[2]) } : null
}

async function resolveSceneToClientMapping() {
  const canvas = page.locator('.konva-host canvas').first()
  const box = await canvas.boundingBox()
  assert.ok(box, 'SCADA canvas must be measurable')

  const candidates = [
    [0.50, 0.50],
    [0.42, 0.50],
    [0.58, 0.50],
    [0.50, 0.42],
    [0.50, 0.58],
    [0.35, 0.50],
    [0.65, 0.50],
  ]
  const samples = []

  for (const [fx, fy] of candidates) {
    const clientX = box.x + box.width * fx
    const clientY = box.y + box.height * fy
    const scenePoint = await scenePointAt(clientX, clientY)
    if (scenePoint) {
      samples.push({ clientX, clientY, ...scenePoint })
    }
  }

  assert.ok(samples.length >= 2, 'at least two canvas samples must resolve to Scene coordinates')
  let horizontalPair = null
  let verticalPair = null

  for (let left = 0; left < samples.length; left += 1) {
    for (let right = left + 1; right < samples.length; right += 1) {
      const a = samples[left]
      const b = samples[right]
      if (!horizontalPair && Math.abs(b.x - a.x) >= 40 && Math.abs(b.clientX - a.clientX) >= 40) {
        horizontalPair = [a, b]
      }
      if (!verticalPair && Math.abs(b.y - a.y) >= 40 && Math.abs(b.clientY - a.clientY) >= 40) {
        verticalPair = [a, b]
      }
    }
  }

  assert.ok(horizontalPair, 'horizontal Scene/client mapping sample must exist')
  assert.ok(verticalPair, 'vertical Scene/client mapping sample must exist')

  const [hx0, hx1] = horizontalPair
  const [vy0, vy1] = verticalPair
  const scaleX = (hx1.clientX - hx0.clientX) / (hx1.x - hx0.x)
  const scaleY = (vy1.clientY - vy0.clientY) / (vy1.y - vy0.y)
  assert.ok(Number.isFinite(scaleX) && scaleX > 0, `invalid horizontal Scene scale ${scaleX}`)
  assert.ok(Number.isFinite(scaleY) && scaleY > 0, `invalid vertical Scene scale ${scaleY}`)

  return (sceneX, sceneY) => ({
    x: hx0.clientX + (sceneX - hx0.x) * scaleX,
    y: vy0.clientY + (sceneY - vy0.y) * scaleY,
  })
}

async function clickSceneNode(sceneNode, toClient, { shift = false } = {}) {
  const center = toClient(
    sceneNode.transform.x + sceneNode.transform.width / 2,
    sceneNode.transform.y + sceneNode.transform.height / 2,
  )
  if (shift) await page.keyboard.down('Shift')
  try {
    await page.mouse.click(center.x, center.y)
  } finally {
    if (shift) await page.keyboard.up('Shift')
  }
}

try {
  await page.goto(`${baseUrl}#/works`, { waitUntil: 'networkidle' })
  await page.getByText('SCADA 作品', { exact: true }).first().waitFor()
  await page.getByRole('button', { name: '+ 新建作品', exact: true }).click()
  await page.getByText('SCADA Editor', { exact: true }).waitFor()

  // Create a second Scene node so B3 can exercise both a normal single
  // selection and a real multi-selection through the Konva authoring surface.
  const paletteItems = page.locator('.component-item')
  assert.ok(await paletteItems.count() > 0, 'SCADA Palette must expose at least one component')
  await paletteItems.first().click()
  await saveSceneAndWait(page)
  await waitForSaveStatus('已保存')

  const baseline = (await readPersistedScene(page)).document
  assert.ok(baseline.nodes.length >= 2, 'B3 fixture must contain at least two Scene nodes')
  const firstNode = baseline.nodes[0]
  const secondNode = baseline.nodes[baseline.nodes.length - 1]
  const toClient = await resolveSceneToClientMapping()

  // Single-selection Preview: page commands and Inspector authoring controls
  // must be disabled while view/runtime affordances remain available.
  await clickSceneNode(secondNode, toClient)
  const singleNameField = page
    .locator('.property-panel .property-field')
    .filter({ has: page.locator('span', { hasText: /^名称$/ }) })
    .locator('input')
    .first()
  await singleNameField.waitFor()
  const baselineName = await singleNameField.inputValue()
  assert.equal(baselineName, secondNode.name)

  await page.getByRole('button', { name: '预览', exact: true }).click()
  await page.locator('.status-mode').getByText('预览', { exact: true }).waitFor()
  await waitForSaveStatus('已保存')

  assert.equal(await page.getByRole('button', { name: '导入', exact: true }).isDisabled(), true)
  assert.equal(await paletteItems.first().isDisabled(), true)
  assert.equal(await page.getByRole('button', { name: '复制选中对象' }).isDisabled(), true)
  assert.equal(await page.getByRole('button', { name: '删除选中对象' }).isDisabled(), true)
  assert.equal(await page.getByRole('button', { name: '撤销' }).isDisabled(), true)
  assert.equal(await page.getByRole('button', { name: '重做' }).isDisabled(), true)
  assert.equal(await singleNameField.isDisabled(), true)

  const geometryInputs = page.locator('.property-panel .property-grid input[type="number"]')
  assert.ok(await geometryInputs.count() > 0, 'single node Inspector must expose geometry controls')
  for (let index = 0; index < await geometryInputs.count(); index += 1) {
    assert.equal(await geometryInputs.nth(index).isDisabled(), true, 'Preview geometry fields must be read-only')
  }

  const displayCheckboxes = page.locator('.property-panel [role="checkbox"]')
  assert.ok(await displayCheckboxes.count() > 0, 'single node Inspector must expose display toggles')
  for (let index = 0; index < await displayCheckboxes.count(); index += 1) {
    assert.equal(await displayCheckboxes.nth(index).isDisabled(), true, 'Preview design checkboxes must be disabled')
  }

  // Global history shortcuts are design commands and must be ignored in Preview.
  await page.locator('.canvas-area').focus().catch(() => {})
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Z' : 'Control+Z')
  await waitForSaveStatus('已保存')
  assert.equal(await singleNameField.inputValue(), baselineName)

  // Renderer is the second gate: pointer dragging in Preview must not produce a
  // transform callback or dirty the authored Scene.
  const secondCenter = toClient(
    secondNode.transform.x + secondNode.transform.width / 2,
    secondNode.transform.y + secondNode.transform.height / 2,
  )
  await page.mouse.move(secondCenter.x, secondCenter.y)
  await page.mouse.down()
  await page.mouse.move(secondCenter.x + 80, secondCenter.y + 50, { steps: 6 })
  await page.mouse.up()
  await waitForSaveStatus('已保存')

  // Grid/snap are view preferences, not authored Scene mutations; they remain
  // available in Preview and must not dirty the document.
  const gridButton = page.getByRole('button', { name: '显示格线' })
  assert.equal(await gridButton.isDisabled(), false)
  await gridButton.click()
  await waitForSaveStatus('已保存')

  await page.getByRole('button', { name: '设计', exact: true }).click()
  await page.locator('.status-mode').getByText('选择', { exact: true }).waitFor()
  assert.equal(await singleNameField.inputValue(), baselineName)
  await waitForSaveStatus('已保存')

  const afterPreview = (await readPersistedScene(page)).document
  assert.deepEqual(afterPreview, baseline, 'Preview must not mutate or persist authored Scene data')

  // Multi-selection scope: select both nodes through the actual renderer. B3
  // permits only explicit batch fields and removes the single primary-node
  // Inspector entirely, so no field can silently target only the last node.
  await clickSceneNode(firstNode, toClient)
  await clickSceneNode(secondNode, toClient, { shift: true })
  await page.getByText('已选择', { exact: false }).waitFor()
  await page.getByText('批量属性', { exact: true }).waitFor()
  await page.getByText('已选择 2 个节点。', { exact: false }).waitFor()

  assert.equal(
    await page
      .locator('.property-panel .property-field')
      .filter({ has: page.locator('span', { hasText: /^名称$/ }) })
      .locator('input')
      .count(),
    0,
    'multi-selection must not expose a single-object name field',
  )
  assert.equal(
    await page.locator('.property-panel .property-summary').filter({ hasText: '父级' }).count(),
    0,
    'multi-selection must not expose single-object identity summary',
  )

  const batchLocked = page.getByRole('checkbox', { name: '全部锁定' })
  assert.equal(await batchLocked.isDisabled(), false)
  await batchLocked.click()
  await waitForSaveStatus('未保存')

  // One supported batch mutation is one history entry. Undo returns exactly to
  // the saved baseline and therefore also restores the clean save state.
  await page.getByRole('button', { name: '撤销' }).click()
  await waitForSaveStatus('已保存')

  // Preview preserves the multi-selection context but makes its batch fields
  // read-only and blocks history shortcuts as well.
  await page.getByRole('button', { name: '预览', exact: true }).click()
  await page.locator('.status-mode').getByText('预览', { exact: true }).waitFor()
  assert.equal(await batchLocked.isDisabled(), true)
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Z' : 'Control+Z')
  await waitForSaveStatus('已保存')

  assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join(' | ')}`)
  console.log('B3 mode/selection smoke passed: Preview is a complete Scene design-mutation gate, view controls stay non-authoring, and multi-selection exposes only explicit batch scope.')
} finally {
  await browser.close()
}
