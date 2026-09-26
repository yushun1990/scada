import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const workflow = readFileSync(root + '.github/workflows/ci.yml', 'utf8')
const { scripts } = JSON.parse(readFileSync(root + 'package.json', 'utf8'))
const commands = workflow.split('\n').filter((line) =>
  /^\s+(?:run: )?(?:node |npx --yes tsx |npm run )/.test(line),
)
// Follow only npm scripts actually invoked by CI, not unrelated package entries.
for (const command of commands.filter((line) => line.includes('npm run '))) {
  const name = command.match(/npm run ([\w:-]+)/)?.[1]
  if (name && scripts[name]) commands.push(scripts[name])
}
const executed = new Set(commands.flatMap((command) =>
  [...command.matchAll(/(?:^|\s|&&\s*)\b(?:node|npx --yes tsx) (scripts\/check-[\w.-]+\.(?:ts|mjs))(?=\s|$)/g)]
    .map((match) => match[1]),
))
const checks = readdirSync(root + 'scripts')
  .filter((name) => /^check-.*\.(?:ts|mjs)$/.test(name))
  .map((name) => 'scripts/' + name)
const missing = checks.filter((path) => !executed.has(path))
assert.deepEqual(missing, [], 'Every deterministic check must execute in CI; node --check is syntax evidence only')
console.log('Model check registration passed: ' + checks.length + ' checks execute in CI or its lint command.')
