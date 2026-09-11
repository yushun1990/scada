import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await collect(target))
    else if (entry.isFile() && target.endsWith('.mjs')) files.push(target)
  }
  return files
}

for (const file of await collect('scripts')) {
  if (file.endsWith('c2-refresh-smoke-selectors.mjs')) continue
  let source = await readFile(file, 'utf8')
  const original = source
  source = source.replaceAll(
    "await page.getByText('SCADA Editor', { exact: true }).waitFor()",
    "await page.locator('.studio-shell.scada-studio-shell').waitFor()",
  )
  source = source.replaceAll(
    "await page.getByText('Component Editor', { exact: true }).waitFor()",
    "await page.locator('.studio-shell.component-studio-shell').waitFor()",
  )
  source = source.replaceAll(
    "page.locator('.status-mode').getByText('预览', { exact: true })",
    "page.locator('.studio-status-mode').getByText('预览', { exact: true })",
  )
  source = source.replaceAll(
    "page.locator('.status-mode').getByText('选择', { exact: true })",
    "page.locator('.studio-status-mode').getByText('设计', { exact: true })",
  )
  if (source !== original) await writeFile(file, source)
}

for (const file of [
  'src/features/scada-editor/ScadaEditorPage.tsx',
  'src/features/component-library/ComponentEditorPage.tsx',
]) {
  let source = await readFile(file, 'utf8')
  const original = source
  source = source.replace(
    '<span className="studio-status-cluster">\n              <strong>{mode === \'preview\' ? \'预览\' : \'设计\'}</strong>',
    '<span className="studio-status-cluster studio-status-mode">\n              <strong>{mode === \'preview\' ? \'预览\' : \'设计\'}</strong>',
  )
  if (source === original) throw new Error(`${file}: visible mode status marker not found`)
  await writeFile(file, source)
}
