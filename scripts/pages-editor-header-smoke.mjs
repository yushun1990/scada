import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'https://yushun1990.github.io/scada/')
  .replace(/\/?$/, '/')
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await context.newPage()
const pageErrors = []

page.on('pageerror', (error) => pageErrors.push(error.message))

async function boxOf(locator, label) {
  const box = await locator.boundingBox()
  assert.ok(box, `${label} must be measurable`)
  return box
}

function assertModeCentered(headerBox, modeBox, label) {
  const headerCenter = headerBox.x + headerBox.width / 2
  const modeCenter = modeBox.x + modeBox.width / 2
  assert.ok(
    Math.abs(headerCenter - modeCenter) <= 2,
    `${label} Design / Preview must stay centered in the editor header (${modeCenter}/${headerCenter})`,
  )
}

try {
  console.log(`Opening deployed Component Editor header regression: ${baseUrl}#/components/new`)
  await page.goto(`${baseUrl}#/components/new`, { waitUntil: 'networkidle' })
  await page.getByText('Component Editor', { exact: true }).waitFor()

  const componentHeader = page.locator('.component-editor-header')
  const componentMode = componentHeader.locator('.mode-switch')
  const componentToolbar = page.getByRole('toolbar', { name: '组件文档操作' })
  const componentExit = page.getByRole('button', { name: '返回组件库工作台' })
  await componentExit.waitFor()

  const [componentHeaderBox, componentModeBox, componentToolbarBox, componentExitBox] = await Promise.all([
    boxOf(componentHeader, 'Component Editor header'),
    boxOf(componentMode, 'Component Editor mode switch'),
    boxOf(componentToolbar, 'Component Editor document toolbar'),
    boxOf(componentExit, 'Component Editor workspace exit'),
  ])

  console.log(`Component Editor header geometry: ${JSON.stringify({
    header: componentHeaderBox,
    mode: componentModeBox,
    documentToolbar: componentToolbarBox,
    workspaceExit: componentExitBox,
  })}`)
  assertModeCentered(componentHeaderBox, componentModeBox, 'Component Editor')
  assert.ok(
    componentToolbarBox.x > componentModeBox.x + componentModeBox.width,
    'Component Editor document actions must stay to the right of Design / Preview',
  )
  assert.ok(
    componentExitBox.x >= componentToolbarBox.x
      && componentExitBox.x + componentExitBox.width <= componentToolbarBox.x + componentToolbarBox.width + 1,
    'Component Editor workspace exit must remain inside the document toolbar',
  )

  await componentExit.click()
  await page.waitForURL(/#\/components$/)

  console.log(`Opening deployed SCADA Editor header regression: ${baseUrl}#/works`)
  await page.goto(`${baseUrl}#/works`, { waitUntil: 'networkidle' })
  await page.getByText('SCADA 作品', { exact: true }).first().waitFor()
  await page.getByRole('button', { name: '+ 新建作品', exact: true }).click()
  await page.getByText('SCADA Editor', { exact: true }).waitFor()

  const scadaHeader = page.locator('.editor-header').filter({ hasText: 'SCADA Editor' })
  const scadaMode = scadaHeader.locator('.mode-switch')
  const scadaToolbar = page.getByRole('toolbar', { name: '场景文档操作' })
  const importButton = scadaToolbar.getByRole('button', { name: '导入', exact: true })
  const scadaExit = page.getByRole('button', { name: '返回 SCADA 作品工作台' })
  await scadaExit.waitFor()

  const [scadaHeaderBox, scadaModeBox, scadaToolbarBox, importBox, scadaExitBox] = await Promise.all([
    boxOf(scadaHeader, 'SCADA Editor header'),
    boxOf(scadaMode, 'SCADA Editor mode switch'),
    boxOf(scadaToolbar, 'SCADA Editor document toolbar'),
    boxOf(importButton, 'SCADA import button'),
    boxOf(scadaExit, 'SCADA workspace exit'),
  ])

  console.log(`SCADA Editor header geometry: ${JSON.stringify({
    header: scadaHeaderBox,
    mode: scadaModeBox,
    documentToolbar: scadaToolbarBox,
    importButton: importBox,
    workspaceExit: scadaExitBox,
  })}`)
  assertModeCentered(scadaHeaderBox, scadaModeBox, 'SCADA Editor')
  assert.ok(
    importBox.x > scadaModeBox.x + scadaModeBox.width,
    'SCADA Import must stay to the right of Design / Preview instead of swapping places with it',
  )
  assert.ok(
    scadaExitBox.x > importBox.x,
    'SCADA workspace exit must remain the far-right navigation action',
  )
  assert.ok(
    scadaExitBox.x >= scadaToolbarBox.x
      && scadaExitBox.x + scadaExitBox.width <= scadaToolbarBox.x + scadaToolbarBox.width + 1,
    'SCADA workspace exit must remain inside the document toolbar after the async storage gate resolves',
  )

  await scadaExit.click()
  await page.waitForURL(/#\/works$/)

  assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join(' | ')}`)
  console.log('Pages editor header smoke passed: Design / Preview stays centered, document actions remain on the right, and both workspace exits survive async editor loading.')
} finally {
  await browser.close()
}
