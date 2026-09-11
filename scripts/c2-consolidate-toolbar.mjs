import { readFile, writeFile } from 'node:fs/promises'

function extractBlock(text, startMarker, endMarker, label) {
  const start = text.indexOf(startMarker)
  if (start < 0) throw new Error(`${label}: start marker not found`)
  const end = text.indexOf(endMarker, start)
  if (end < 0) throw new Error(`${label}: end marker not found`)
  return {
    block: text.slice(start, end),
    start,
    end,
  }
}

async function patchScada() {
  const path = 'src/features/scada-editor/ScadaEditorPage.tsx'
  let text = await readFile(path, 'utf8')
  const { block, start, end } = extractBlock(
    text,
    '          <Toolbar className="canvas-toolbar" aria-label="画布工具栏">',
    '\n\n          {message &&',
    'SCADA canvas toolbar',
  )
  text = text.slice(0, start) + text.slice(end + 2)

  const insertion = '            <Button variant="secondary" disabled={!designEditingEnabled || !canRedo} onClick={redo}>重做</Button>\n'
  const index = text.indexOf(insertion)
  if (index < 0) throw new Error('SCADA toolbar insertion marker not found')
  text = text.slice(0, index + insertion.length) + block + '\n' + text.slice(index + insertion.length)
  await writeFile(path, text)
}

async function patchComponent() {
  const path = 'src/features/component-library/ComponentEditorPage.tsx'
  let text = await readFile(path, 'utf8')
  const { block, start, end } = extractBlock(
    text,
    '          <Toolbar\n            className="canvas-toolbar component-canvas-toolbar"',
    '\n\n          <ComponentVisualCanvas',
    'Component canvas toolbar',
  )
  text = text.slice(0, start) + text.slice(end + 2)

  const insertion = '            <Button variant="secondary" disabled={editingDisabled || !canRedo} onClick={redo}>重做</Button>\n'
  const index = text.indexOf(insertion)
  if (index < 0) throw new Error('Component toolbar insertion marker not found')
  text = text.slice(0, index + insertion.length) + block + '\n' + text.slice(index + insertion.length)
  await writeFile(path, text)
}

await patchScada()
await patchComponent()
