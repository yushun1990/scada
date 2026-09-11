import { readFile, writeFile } from 'node:fs/promises'

const path = 'src/features/component-library/ComponentEditorPage.tsx'
const source = await readFile(path, 'utf8')
const next = source.replace('  ToolbarButton,\n  ToolbarGroup,\n', '  ToolbarButton,\n')
if (next === source) throw new Error('ToolbarGroup import marker not found')
await writeFile(path, next)
