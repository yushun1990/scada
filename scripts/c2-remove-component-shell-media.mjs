import { readFile, writeFile } from 'node:fs/promises'

const path = 'src/features/component-library/component-editor.css'
let source = await readFile(path, 'utf8')
source = source.replace(
  '  grid-template-rows: auto minmax(0, 1fr);\n',
  '  grid-template-rows: minmax(0, 1fr);\n',
)
source = source.replace(/@media \(max-width: 1240px\) \{[\s\S]*?\}\n\n/, '')
source = source.replace(/@media \(max-width: 960px\) \{[\s\S]*?\n\}\n\n/, '')
source = source.replace(/@media \(max-width: 760px\) \{[\s\S]*?\n\}\n?$/, '')
if (/\.component-editor-(?:shell|main)\b/.test(source)) {
  throw new Error('component editor shell selector remains after cleanup')
}
await writeFile(path, source)
