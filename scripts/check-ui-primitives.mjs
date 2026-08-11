import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const SRC_DIR = path.resolve('src')
const UI_DIR = path.join(SRC_DIR, 'ui')
const RAW_CONTROL_PATTERNS = [
  { label: '<button>', pattern: /<button\b/g },
  { label: '<select>', pattern: /<select\b/g },
  { label: '<input>', pattern: /<input\b/g },
  { label: '<textarea>', pattern: /<textarea\b/g },
]

async function collectTsxFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const target = path.join(directory, entry.name)

    if (entry.isDirectory()) {
      if (target === UI_DIR) continue
      files.push(...await collectTsxFiles(target))
      continue
    }

    if (entry.isFile() && target.endsWith('.tsx')) {
      files.push(target)
    }
  }

  return files
}

function lineNumberAt(content, offset) {
  return content.slice(0, offset).split('\n').length
}

const violations = []

for (const file of await collectTsxFiles(SRC_DIR)) {
  const content = await readFile(file, 'utf8')

  for (const { label, pattern } of RAW_CONTROL_PATTERNS) {
    for (const match of content.matchAll(pattern)) {
      violations.push({
        file: path.relative(process.cwd(), file),
        line: lineNumberAt(content, match.index ?? 0),
        label,
      })
    }
  }
}

if (violations.length > 0) {
  console.error('Business UI must consume Studio primitives from src/ui; raw form controls are not allowed:')
  for (const violation of violations) {
    console.error(`- ${violation.file}:${violation.line} ${violation.label}`)
  }
  process.exitCode = 1
} else {
  console.log('UI primitive audit passed: no raw business-layer button/select/input/textarea controls found.')
}
