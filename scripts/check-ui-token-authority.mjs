import { readFile } from 'node:fs/promises'

const tokens = await readFile('src/styles/tokens.css', 'utf8')
const foundation = await readFile('src/styles/ui-foundation.css', 'utf8')
const primitives = await readFile('src/ui/ui-primitives.css', 'utf8')

const requiredTokens = new Map([
  ['--ui-color-app-background', '#e8eaed'],
  ['--ui-color-panel', '#f2f3f5'],
  ['--ui-color-surface', '#ffffff'],
  ['--ui-color-surface-subtle', '#f7f8fa'],
  ['--ui-color-canvas', '#c9cdd2'],
  ['--ui-color-text', '#202428'],
  ['--ui-color-text-secondary', '#52565e'],
  ['--ui-color-text-subtle', '#626872'],
  ['--ui-color-text-disabled', '#8a9099'],
  ['--ui-color-border', '#c4c8ce'],
  ['--ui-color-border-strong', '#858c96'],
  ['--ui-color-accent', '#1769aa'],
  ['--ui-color-accent-hover', '#12568e'],
  ['--ui-color-accent-pressed', '#104773'],
  ['--ui-color-accent-soft', '#e7f0fa'],
  ['--ui-color-success', '#287a45'],
  ['--ui-color-warning', '#9a6700'],
  ['--ui-color-danger', '#b42318'],
  ['--ui-font-size-status', '11px'],
  ['--ui-font-size-tool', '12px'],
  ['--ui-font-size-body', '13px'],
  ['--ui-font-size-workbench-title', '18px'],
  ['--ui-radius-control', '2px'],
  ['--ui-radius-floating', '4px'],
  ['--ui-control-height', '28px'],
  ['--ui-control-height-small', '26px'],
  ['--ui-status-height', '26px'],
  ['--ui-left-dock-width', '248px'],
  ['--ui-right-inspector-width', '320px'],
])

const violations = []

for (const [token, expected] of requiredTokens) {
  const expression = new RegExp(`${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*${expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*;`)
  if (!expression.test(tokens)) {
    violations.push(`tokens.css must define ${token}: ${expected}`)
  }
}

const requiredAliases = [
  ['--ui-color-surface-muted', '--ui-color-surface-subtle'],
  ['--ui-color-border-subtle', '--ui-color-border'],
  ['--ui-color-accent-soft-strong', '--ui-color-accent-soft'],
  ['--ui-radius-pill', '--ui-radius-floating'],
]

for (const [alias, authority] of requiredAliases) {
  if (!tokens.includes(`${alias}: var(${authority});`)) {
    violations.push(`${alias} must remain only a same-value alias of ${authority}`)
  }
}

const forbiddenLegacyValues = [
  '#2563eb',
  '#1d4ed8',
  '#1e40af',
  '#93c5fd',
  '#60a5fa',
  '#bfdbfe',
  '999px',
]

for (const [name, content] of [
  ['src/styles/ui-foundation.css', foundation],
  ['src/ui/ui-primitives.css', primitives],
]) {
  for (const value of forbiddenLegacyValues) {
    if (content.toLowerCase().includes(value)) {
      violations.push(`${name} must not reintroduce legacy visual value ${value}`)
    }
  }
}

if (/first-of-type/.test(foundation)) {
  violations.push('ui-foundation.css must not infer semantic button priority from first-of-type')
}

if (violations.length > 0) {
  console.error('Studio C1 token authority check failed:')
  for (const violation of violations) console.error(`- ${violation}`)
  process.exitCode = 1
} else {
  console.log('Studio C1 token authority check passed.')
}
