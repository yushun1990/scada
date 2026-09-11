import { access, readFile } from 'node:fs/promises'
import process from 'node:process'

async function read(path) {
  return readFile(path, 'utf8')
}

async function forbidFile(label, path) {
  try {
    await access(path)
    violations.push(label)
  } catch {
    // Missing is the accepted C2 state.
  }
}

const violations = []
function forbid(label, content, pattern) {
  if (pattern.test(content)) violations.push(label)
}
function requirePattern(label, content, pattern) {
  if (!pattern.test(content)) violations.push(label)
}

const app = await read('src/App.tsx')
forbid('App must not inject editor navigation with createPortal', app, /createPortal/)
forbid('App must not watch editor DOM with MutationObserver', app, /MutationObserver/)
forbid('App must not revive StudioWorkspaceExit', app, /StudioWorkspaceExit/)
forbid('App must not query editor header DOM', app, /querySelector[\s\S]{0,120}editor-header/)

const sharedCss = [
  ['src/styles.css', await read('src/styles.css')],
  ['src/styles/ui-foundation.css', await read('src/styles/ui-foundation.css')],
  ['src/editor-chrome.css', await read('src/editor-chrome.css')],
  ['src/editor-toolbar-context.css', await read('src/editor-toolbar-context.css')],
  ['src/ui/ui-primitives.css', await read('src/ui/ui-primitives.css')],
]
for (const [path, css] of sharedCss) {
  forbid(`${path} must not restore .editor-shell authority`, css, /\.editor-shell\b/)
  forbid(`${path} must not restore .editor-header authority`, css, /\.editor-header\b/)
  forbid(`${path} must not restore .editor-main authority`, css, /\.editor-main\b/)
  forbid(`${path} must not restore pre-C2 workspace exit lane`, css, /studio-workspace-exit/)
}

await forbidFile(
  'pre-C2 component-editor-header.css must stay deleted',
  'src/component-editor-header.css',
)
await forbidFile(
  'pre-C2 component-canvas-toolbar.css must stay deleted',
  'src/features/component-library/component-canvas-toolbar.css',
)

const componentCss = await read('src/features/component-library/component-editor.css')
forbid('component-editor.css must not restore component editor shell geometry', componentCss, /\.component-editor-(?:shell|main)\b/)

const componentCanvas = await read('src/features/component-library/ComponentVisualCanvas.tsx')
forbid('ComponentVisualCanvas must not query a toolbar from canvas DOM', componentCanvas, /querySelector[\s\S]{0,120}component-canvas-toolbar/)
forbid('ComponentVisualCanvas must not derive toolbar authority with closest()', componentCanvas, /closest\(["'][^"']*(?:toolbar|canvas-area)/)
requirePattern('ComponentVisualCanvas must receive explicit edit toolbar host', componentCanvas, /editToolbarHost:\s*HTMLElement \| null/)
requirePattern('ComponentVisualCanvas must receive explicit view toolbar host', componentCanvas, /viewToolbarHost:\s*HTMLElement \| null/)

const shell = await read('src/editor/StudioShell.tsx')
for (const className of [
  'studio-menu-bar',
  'studio-main-toolbar',
  'studio-document-bar',
  'studio-workspace-grid',
  'studio-status-bar',
]) {
  requirePattern(`StudioShell must render ${className}`, shell, new RegExp(className))
}
requirePattern('StudioShell panel resize handles must be separators', shell, /role="separator"/)
requirePattern('StudioShell must expose explicit workspace navigation', shell, /onNavigateWorkspace/)

if (violations.length) {
  console.error('StudioShell authority audit failed:')
  for (const violation of violations) console.error(`- ${violation}`)
  process.exitCode = 1
} else {
  console.log('StudioShell authority audit passed.')
}
