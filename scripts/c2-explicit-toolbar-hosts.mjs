import { readFile, writeFile } from 'node:fs/promises'

function replaceRequired(text, pattern, replacement, label) {
  const next = text.replace(pattern, replacement)
  if (next === text) throw new Error(`${label}: pattern not found`)
  return next
}

async function patchCanvas() {
  const path = 'src/features/component-library/ComponentVisualCanvas.tsx'
  let text = await readFile(path, 'utf8')
  text = replaceRequired(
    text,
    '  canRedo: boolean\n  onUndo: () => void\n',
    '  canRedo: boolean\n  editToolbarHost: HTMLElement | null\n  viewToolbarHost: HTMLElement | null\n  onUndo: () => void\n',
    'canvas toolbar host props type',
  )
  text = replaceRequired(
    text,
    '  canUndo,\n  canRedo,\n  onUndo,\n',
    '  canUndo,\n  canRedo,\n  editToolbarHost,\n  viewToolbarHost,\n  onUndo,\n',
    'canvas toolbar host props destructure',
  )
  text = replaceRequired(text, '  const [editToolbarHost, setEditToolbarHost] = useState<HTMLElement | null>(null)\n', '', 'canvas edit host state')
  text = replaceRequired(text, '  const [viewToolbarHost, setViewToolbarHost] = useState<HTMLElement | null>(null)\n', '', 'canvas view host state')
  text = replaceRequired(
    text,
    `    const canvasArea = element.closest('.component-canvas-area')\n    const toolbar = canvasArea?.querySelector<HTMLElement>('.component-canvas-toolbar')\n    const hierarchyGroup = toolbar?.querySelector<HTMLElement>('.component-hierarchy-tool-group')\n    const snapButton = toolbar?.querySelector<HTMLElement>('.component-snap-toggle')\n\n    setEditToolbarHost(hierarchyGroup ?? null)\n    setViewToolbarHost(snapButton?.closest<HTMLElement>('.canvas-tool-group') ?? null)\n\n`,
    '',
    'canvas DOM toolbar lookup',
  )
  await writeFile(path, text)
}

async function patchComponentPage() {
  const path = 'src/features/component-library/ComponentEditorPage.tsx'
  let text = await readFile(path, 'utf8')
  text = replaceRequired(text, "import './component-canvas-toolbar.css'\n", '', 'component toolbar css import')
  text = replaceRequired(
    text,
    "  const [snapEnabled, setSnapEnabled] = useState(true)\n",
    "  const [snapEnabled, setSnapEnabled] = useState(true)\n  const [componentEditToolbarHost, setComponentEditToolbarHost] = useState<HTMLElement | null>(null)\n  const [componentViewToolbarHost, setComponentViewToolbarHost] = useState<HTMLElement | null>(null)\n",
    'component toolbar host state',
  )
  text = replaceRequired(
    text,
    '            <ComponentGeometryToolbarGroup\n',
    '            <div ref={setComponentEditToolbarHost} className="component-edit-command-host" />\n            <ComponentGeometryToolbarGroup\n',
    'component edit host slot',
  )
  text = replaceRequired(
    text,
    '            <ToolbarGroup className="canvas-tool-group">\n              <ToolbarButton\n',
    '            <div ref={setComponentViewToolbarHost} className="canvas-tool-group component-view-command-host">\n              <ToolbarButton\n',
    'component view host open',
  )
  text = replaceRequired(
    text,
    '              </ToolbarButton>\n            </ToolbarGroup>\n            <span className="component-canvas-phase">',
    '              </ToolbarButton>\n            </div>\n            <span className="component-canvas-phase">',
    'component view host close',
  )
  text = replaceRequired(
    text,
    '            canUndo={canUndo}\n            canRedo={canRedo}\n            onUndo={undo}\n',
    '            canUndo={canUndo}\n            canRedo={canRedo}\n            editToolbarHost={componentEditToolbarHost}\n            viewToolbarHost={componentViewToolbarHost}\n            onUndo={undo}\n',
    'component canvas host props',
  )
  await writeFile(path, text)
}

async function patchApp() {
  const path = 'src/App.tsx'
  let text = await readFile(path, 'utf8')
  text = replaceRequired(text, "import './component-editor-header.css'\n", '', 'old component header css import')
  await writeFile(path, text)
}

async function patchSharedStyles() {
  const stylesPath = 'src/styles.css'
  let styles = await readFile(stylesPath, 'utf8')
  styles = replaceRequired(
    styles,
    '  grid-template-rows: 40px minmax(0, 1fr);\n',
    '  grid-template-rows: minmax(0, 1fr);\n',
    'canvas toolbar row removal',
  )
  styles = styles.replace('  background: #dce3ea;\n', '  background: var(--ui-color-canvas);\n')
  styles = styles.replace('  background: #edf1f5;\n', '  background: var(--ui-color-canvas);\n')
  await writeFile(stylesPath, styles)

  const componentCssPath = 'src/features/component-library/component-editor.css'
  let componentCss = await readFile(componentCssPath, 'utf8')
  componentCss = replaceRequired(componentCss, /\.component-editor-shell \{[\s\S]*?\}\n\n\.component-editor-main \{[\s\S]*?\}\n\n/, '', 'dead component shell css')
  await writeFile(componentCssPath, componentCss)

  await writeFile('src/editor-chrome.css', `/* Canvas-specific chrome that remains after C2 moves global layout into StudioShell. */\n\n.canvas-area {\n  position: relative;\n  min-height: 0;\n  overflow: hidden;\n}\n\n.konva-host {\n  min-height: 0;\n  padding-bottom: 0;\n}\n\n.canvas-toast {\n  top: auto;\n  right: auto;\n  bottom: var(--ui-space-2);\n  left: 50%;\n  z-index: 6;\n  width: max-content;\n  height: auto;\n  max-width: min(360px, 28vw);\n  padding: 0 var(--ui-space-2);\n  border: 0;\n  border-radius: 0;\n  color: var(--ui-color-text-secondary);\n  background: transparent;\n  box-shadow: none;\n  line-height: var(--ui-line-height-tool);\n  transform: translateX(-50%);\n}\n\n.grid-size-input[type='number'] {\n  width: 34px;\n  padding: 0 2px;\n  appearance: textfield;\n  -moz-appearance: textfield;\n  text-align: center;\n}\n\n.grid-size-input[type='number']::-webkit-inner-spin-button,\n.grid-size-input[type='number']::-webkit-outer-spin-button {\n  margin: 0;\n  -webkit-appearance: none;\n}\n\n.scene-size-control {\n  width: 76px;\n  min-width: 76px;\n}\n\n.scene-size-control > .ui-select-trigger {\n  width: 100%;\n}\n\n@media (max-width: 1120px) {\n  .canvas-toast {\n    max-width: 240px;\n  }\n}\n`)

  await writeFile('src/editor-toolbar-context.css', `/* C2 command-family layout inside the single Studio main toolbar. */\n\n.studio-main-toolbar-content > .canvas-tool-group,\n.studio-main-toolbar-content > .component-edit-command-host,\n.studio-main-toolbar-content > .component-view-command-host {\n  display: inline-flex;\n  align-items: center;\n  flex: 0 0 auto;\n  min-width: 0;\n  gap: var(--ui-space-micro);\n}\n\n.studio-main-toolbar-content > .canvas-tool-group + .canvas-tool-group,\n.studio-main-toolbar-content > .component-edit-command-host,\n.studio-main-toolbar-content > .component-geometry-tool-group,\n.studio-main-toolbar-content > .component-view-command-host {\n  margin-left: var(--ui-space-1);\n  padding-left: var(--ui-space-1);\n  border-left: 1px solid var(--ui-color-border);\n}\n\n.studio-main-toolbar-content .component-geometry-tool-group {\n  flex: 0 1 auto;\n  overflow-x: auto;\n  overflow-y: hidden;\n  scrollbar-width: thin;\n}\n\n.studio-main-toolbar-content .component-geometry-tool-group > button {\n  flex: 0 0 var(--ui-control-height);\n}\n\n.studio-main-toolbar-content .component-canvas-phase {\n  display: none;\n}\n\n.studio-main-toolbar-content .grid-control {\n  display: inline-flex;\n  align-items: center;\n}\n\n.studio-main-toolbar-content .grid-control > .icon-button {\n  border-radius: var(--ui-radius-control) 0 0 var(--ui-radius-control);\n}\n\n.studio-main-toolbar-content .grid-control > .grid-size-input {\n  border-radius: 0 var(--ui-radius-control) var(--ui-radius-control) 0;\n}\n`)

  const shellPath = 'src/editor/studio-shell.css'
  let shell = await readFile(shellPath, 'utf8')
  shell += `\n.component-studio-shell .component-canvas-area {\n  display: grid;\n  grid-template-rows: minmax(0, 1fr);\n}\n\n.component-studio-shell .component-canvas-stage {\n  width: 100%;\n  height: 100%;\n  min-width: 0;\n  min-height: 0;\n}\n`
  await writeFile(shellPath, shell)
}

await patchCanvas()
await patchComponentPage()
await patchApp()
await patchSharedStyles()
