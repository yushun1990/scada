import { readFile, writeFile } from 'node:fs/promises'

function replaceRequired(text, pattern, replacement, label) {
  const next = text.replace(pattern, replacement)
  if (next === text) throw new Error(`${label}: pattern not found`)
  return next
}

async function patchPages() {
  const scadaPath = 'src/features/scada-editor/ScadaEditorPage.tsx'
  let scada = await readFile(scadaPath, 'utf8')
  scada = replaceRequired(scada, '  Toolbar,\n', '', 'SCADA Toolbar import')
  scada = replaceRequired(scada, '            <Button variant="secondary" disabled={!designEditingEnabled || !canUndo} onClick={undo}>撤销</Button>\n', '', 'SCADA duplicate undo')
  scada = replaceRequired(scada, '            <Button variant="secondary" disabled={!designEditingEnabled || !canRedo} onClick={redo}>重做</Button>\n', '', 'SCADA duplicate redo')
  scada = replaceRequired(scada, '          <Toolbar className="canvas-toolbar" aria-label="画布工具栏">\n', '', 'SCADA nested toolbar open')
  scada = replaceRequired(scada, /\n          <\/Toolbar>\n            <Input/, '\n            <Input', 'SCADA nested toolbar close')
  await writeFile(scadaPath, scada)

  const componentPath = 'src/features/component-library/ComponentEditorPage.tsx'
  let component = await readFile(componentPath, 'utf8')
  component = replaceRequired(component, '  Toolbar,\n', '', 'Component Toolbar import')
  component = replaceRequired(component, '            <Button variant="secondary" disabled={editingDisabled || !canUndo} onClick={undo}>撤销</Button>\n', '', 'Component duplicate undo')
  component = replaceRequired(component, '            <Button variant="secondary" disabled={editingDisabled || !canRedo} onClick={redo}>重做</Button>\n', '', 'Component duplicate redo')
  component = replaceRequired(
    component,
    '          <Toolbar\n            className="canvas-toolbar component-canvas-toolbar"\n            aria-label="组件画布工具栏"\n          >\n',
    '',
    'Component nested toolbar open',
  )
  component = replaceRequired(component, /\n          <\/Toolbar>\n        \)}/, '\n        )}', 'Component nested toolbar close')
  await writeFile(componentPath, component)
}

async function patchStyles() {
  const path = 'src/styles.css'
  let text = await readFile(path, 'utf8')
  text = replaceRequired(
    text,
    /:root \{[\s\S]*?\}\n\n/,
    ':root {\n  font-synthesis: none;\n  text-rendering: optimizeLegibility;\n}\n\n',
    'legacy root chrome',
  )
  text = text.replace('  background: #e7ecf2;\n', '  background: var(--ui-color-app-background);\n')
  text = replaceRequired(text, /button:focus-visible,\ninput:focus-visible \{[\s\S]*?\}\n\n/, '', 'legacy focus ring')
  text = replaceRequired(
    text,
    /\.editor-shell \{[\s\S]*?\.secondary-button:hover:not\(:disabled\) \{[\s\S]*?\}\n\n/,
    '',
    'legacy editor header',
  )
  text = replaceRequired(text, /\.editor-main \{[\s\S]*?\}\n\n/, '', 'legacy editor main')
  text = replaceRequired(
    text,
    /\.component-panel,\n\.property-panel \{[\s\S]*?\.property-panel \{[\s\S]*?\}\n\n/,
    '',
    'legacy editor side panels',
  )
  text = replaceRequired(text, /\.canvas-toolbar \{[\s\S]*?\}\n\n/, '', 'legacy canvas toolbar chrome')
  text = replaceRequired(
    text,
    /\.canvas-status \{[\s\S]*?\.canvas-status code \{[\s\S]*?\}\n\n/,
    '',
    'legacy visible canvas status',
  )
  text = replaceRequired(text, /@media \(max-width: 980px\) \{[\s\S]*?\}\n\n@media \(max-width: 760px\) \{[\s\S]*?\n\}\n?/, '', 'legacy editor media layouts')
  await writeFile(path, text)

  const foundationPath = 'src/styles/ui-foundation.css'
  let foundation = await readFile(foundationPath, 'utf8')
  foundation = replaceRequired(
    foundation,
    /\/\* Shared editor geometry[\s\S]*?\/\* Canvas chrome ----------------------------------------------------------- \*\//,
    '/* Canvas chrome ----------------------------------------------------------- */',
    'foundation pre-C2 editor geometry',
  )
  foundation = replaceRequired(foundation, /\.canvas-toolbar \{[\s\S]*?\}\n\n/, '', 'foundation canvas toolbar')
  foundation = replaceRequired(
    foundation,
    /\.konva-host \{[\s\S]*?\}\n\n\.canvas-status,[\s\S]*?\.component-editor-shell \.component-canvas-area \{[\s\S]*?\}\n\n/,
    '.konva-host {\n  background: var(--ui-color-canvas) !important;\n}\n\n',
    'foundation old status geometry',
  )
  foundation = replaceRequired(
    foundation,
    /\/\* Temporary pre-C2 workspace-exit lane\. \*\/[\s\S]*?(?=@media \(max-width: 980px\))/, 
    '',
    'foundation temporary workspace exit',
  )
  foundation = replaceRequired(
    foundation,
    /\n@media \(max-width: 760px\) \{[\s\S]*?\}\n?$/,
    '\n',
    'foundation legacy editor mobile rule',
  )
  await writeFile(foundationPath, foundation)

  const primitivesPath = 'src/ui/ui-primitives.css'
  let primitives = await readFile(primitivesPath, 'utf8')
  primitives = replaceRequired(
    primitives,
    /\/\* Compatibility bridges while C2 migrates the current editor chrome -------- \*\/[\s\S]*?(?=\.ui-pressable\.inspector-group-header)/,
    '',
    'primitive C1 header compatibility bridge',
  )
  primitives = replaceRequired(
    primitives,
    /\/\* Design \/ Preview uses adjacent low-chrome segments, not a thick blue pill\. \*\/[\s\S]*?(?=\/\* Feature tab classes belong to Tabs\.List\. \*\/)/,
    '',
    'primitive legacy editor mode bridge',
  )
  await writeFile(primitivesPath, primitives)
}

await patchPages()
await patchStyles()
