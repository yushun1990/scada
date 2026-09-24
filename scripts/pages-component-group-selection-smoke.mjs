import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { readPersistedComponent, saveAndWait, writePersistedComponent } from './pages-component-fixture-storage.mjs'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'http://127.0.0.1:4173/').replace(/\/?$/, '/')
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
page.setDefaultTimeout(15000)
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const button = (name) => page.getByRole('button', { name, exact: true })
const row = (name) => page.locator('.component-layer-row').filter({ has: page.getByText(name, { exact: true }) })
const activeNames = () => page.locator('.component-layer-row.active .component-layer-name').allTextContents()

try {
  await page.goto(`${baseUrl}#/components/new`, { waitUntil: 'networkidle' })
  const saved = await saveAndWait(page)
  const layer = (id, name, kind, parentId, x, y, width, height) => ({
    id, name, kind, parentId, visible: true, opacity: 1,
    transform: { x, y, width, height, rotation: 0, scaleX: 1, scaleY: 1 },
    ...(kind === 'vector' ? { primitive: 'rect', style: { fill: '#137766', stroke: '#137766', strokeWidth: 0 } } : {}),
  })
  const fixture = { ...saved.document, visual: { ...saved.document.visual, layers: [
    layer('outer', '外层组合', 'group', null, 60, 60, 260, 140),
    layer('inner', '内层组合', 'group', 'outer', 20, 20, 100, 80),
    layer('child', '内部矩形', 'vector', 'inner', 0, 0, 100, 80),
    layer('sibling', '同组矩形', 'vector', 'outer', 160, 20, 80, 80),
  ] } }
  await writePersistedComponent(page, fixture)
  await page.reload({ waitUntil: 'networkidle' })
  await row('外层组合').waitFor()
  if (await button('吸附').getAttribute('aria-pressed') === 'true') await button('吸附').click()
  const box = await page.locator('.component-artboard').boundingBox()
  assert.ok(box)
  const sx = box.width / fixture.visual.designSize.width
  const sy = box.height / fixture.visual.designSize.height
  const point = { x: box.x + 110 * sx, y: box.y + 110 * sy }

  await page.mouse.click(point.x, point.y)
  assert.deepEqual(await activeNames(), ['外层组合'], 'first hit on a nested child selects the outer group')
  await page.mouse.click(point.x, point.y)
  assert.deepEqual(await activeNames(), ['外层组合'], 'repeated clicks never drill into a grouped child')
  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  await page.mouse.move(point.x + 24 * sx, point.y + 16 * sy, { steps: 6 })
  await page.mouse.up()
  await saveAndWait(page)
  const moved = (await readPersistedComponent(page)).document.visual
  const outer = moved.layers.find((item) => item.id === 'outer')
  assert.ok(Math.abs(outer.transform.x - 84) < 1 && Math.abs(outer.transform.y - 76) < 1, 'drag moves the group')
  for (const child of fixture.visual.layers.slice(1)) {
    assert.deepEqual(moved.layers.find((item) => item.id === child.id).transform, child.transform, 'drag preserves internal geometry')
  }

  await row('内部矩形').click()
  assert.deepEqual(await activeNames(), ['内部矩形'], 'the tree can select a child for configuration')
  const geometry = page.locator('.component-layer-geometry-grid input')
  assert.equal(await geometry.count(), 7)
  for (const input of await geometry.all()) assert.equal(await input.isDisabled(), true)
  const strokeWidth = page.locator('.component-property-panel .property-field')
    .filter({ has: page.locator('span', { hasText: /^描边宽度$/ }) })
    .locator('input')
    .first()
  assert.equal(await strokeWidth.isEnabled(), true, 'non-geometric properties remain editable')
  await strokeWidth.fill('2')
  await strokeWidth.press('Tab')
  await row('外层组合').click()
  await button('拆分组合').click()
  await row('内部矩形').click()
  assert.equal(await geometry.first().isDisabled(), true, 'nested geometry stays locked until its own group is split')
  await row('内层组合').click()
  await button('拆分组合').click()
  await row('内部矩形').click()
  assert.equal(await geometry.first().isEnabled(), true)
  assert.equal(await strokeWidth.inputValue(), '2', 'ungroup retains configured child properties')
  assert.deepEqual(errors, [])
  console.log('Group selection smoke passed: outermost hit/drag, nested geometry lock, tree property editing and explicit ungroup unlock.')
} catch (error) {
  console.error((await page.locator('body').innerText()).slice(0, 1600))
  throw error
} finally {
  await browser.close()
}
