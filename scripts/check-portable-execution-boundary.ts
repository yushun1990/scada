import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import type { ComponentDefinition } from '../src/component-system/definition'
import { migrateLegacyPortableActionImplementations } from '../src/component-system/portable-action-migration'
import { assertComponentDefinition } from '../src/component-system/validation'
import { createEmptyCompositeVisual } from '../src/component-system/visual'
import {
  COMPONENT_PACKAGE_VERSION,
  cloneComponentDefinition,
  parseComponentLibraryDocumentWithDiagnostics,
  serializeComponentLibraryDocument,
  type ComponentLibraryEntry,
} from '../src/features/component-library/component-document'
import {
  DISTRIBUTABLE_COMPONENT_PACKAGE_VERSION,
  createDistributableComponentPackage,
  parseDistributableComponentPackageDocumentWithDiagnostics,
  parseDistributableComponentPackageWithDiagnostics,
  serializeDistributableComponentPackage,
} from '../src/features/component-library/distributable-component-package'

const definition: ComponentDefinition = {
  type: 'custom.portable-execution-boundary',
  title: 'Portable execution boundary',
  category: 'Fixture',
  description: '',
  size: {
    defaultWidth: 120,
    defaultHeight: 80,
    minWidth: 20,
    minHeight: 20,
  },
  attributes: {},
  properties: {},
  actions: {
    start: {
      title: 'Start',
      parameters: [
        { name: 'speed', title: 'Speed', kind: 'number', optional: true },
      ],
    },
  },
  events: {},
  anchors: [],
}

const visual = createEmptyCompositeVisual()
const implementationDraft =
  'globalThis.__scadaPortableDraftExecuted = true; throw new Error("must remain inert")'
const unsafeImplementation =
  'globalThis.__scadaPortableActionExecuted = true; return fetch("https://attacker.invalid")'

const unsafeDefinition = structuredClone(definition) as unknown as Record<string, unknown>
const unsafeActions = unsafeDefinition.actions as Record<string, Record<string, unknown>>
unsafeActions.start.implementation = unsafeImplementation

assert.throws(
  () => assertComponentDefinition(unsafeDefinition),
  /已废弃的 implementation.*不接受或执行 Action 源码/,
  'the current public definition rejects executable Action source explicitly',
)

const migratedDefinition = migrateLegacyPortableActionImplementations(unsafeDefinition)
assert.deepEqual(
  migratedDefinition.diagnostics.map((diagnostic) => ({
    code: diagnostic.code,
    actionKey: diagnostic.actionKey,
  })),
  [{ code: 'legacy-action-implementation-removed', actionKey: 'start' }],
)
assert.doesNotThrow(() => assertComponentDefinition(migratedDefinition.definition))
assert.equal(
  'implementation' in
    ((migratedDefinition.definition as Record<string, unknown>).actions as Record<
      string,
      Record<string, unknown>
    >).start,
  false,
  'migration retains the Action signature but discards source',
)

const clonedUnsafeDefinition = cloneComponentDefinition(
  unsafeDefinition as unknown as ComponentDefinition,
)
assert.equal(
  'implementation' in
    (clonedUnsafeDefinition.actions.start as unknown as Record<string, unknown>),
  false,
  'canonical cloning cannot preserve a smuggled implementation field',
)

const localEntry: ComponentLibraryEntry = {
  version: COMPONENT_PACKAGE_VERSION,
  id: 'portable-execution-boundary',
  definition,
  visual,
  status: 'ready',
  implementationDraft,
  updatedAt: '2026-09-25T00:00:00.000Z',
  builtIn: false,
}

const localParse = parseComponentLibraryDocumentWithDiagnostics(
  JSON.stringify({ ...localEntry, definition: unsafeDefinition }),
)
assert.ok(localParse)
assert.equal(localParse.diagnostics.length, 1)
assert.equal(localParse.diagnostics[0]?.actionKey, 'start')
assert.equal(localParse.entry.implementationDraft, implementationDraft)
assert.equal(
  'implementation' in
    (localParse.entry.definition.actions.start as unknown as Record<string, unknown>),
  false,
)
assert.throws(
  () => serializeComponentLibraryDocument(localParse.entry),
  /尚无已接受的 Action\/Event 运行契约/,
  'a migrated declaration is retained for cleanup but cannot remain ready',
)
const canonicalLocalDocument = JSON.parse(
  serializeComponentLibraryDocument({ ...localParse.entry, status: 'draft' }),
) as Record<string, unknown>
assert.equal(
  'implementation' in
    (((canonicalLocalDocument.definition as Record<string, unknown>)
      .actions as Record<string, Record<string, unknown>>).start),
  false,
  'current local serialization emits only the canonical Action signature',
)
assert.equal(canonicalLocalDocument.implementationDraft, implementationDraft)

assert.throws(
  () =>
    createDistributableComponentPackage({
      ...localEntry,
      definition: unsafeDefinition as unknown as ComponentDefinition,
    }),
  /已废弃的 implementation/,
  'current in-memory authoring state cannot export executable Action source',
)

const unsafePackageValue = {
  packageVersion: DISTRIBUTABLE_COMPONENT_PACKAGE_VERSION,
  definition: unsafeDefinition,
  visual,
  implementationDraft,
}
const packageParse = parseDistributableComponentPackageWithDiagnostics(
  unsafePackageValue,
)
assert.ok(packageParse)
assert.equal(packageParse.diagnostics.length, 1)
assert.equal(packageParse.diagnostics[0]?.actionKey, 'start')
assert.equal(packageParse.componentPackage.implementationDraft, implementationDraft)
assert.equal(
  'implementation' in
    (packageParse.componentPackage.definition.actions.start as unknown as Record<
      string,
      unknown
    >),
  false,
)

const packageDocumentParse =
  parseDistributableComponentPackageDocumentWithDiagnostics(
    JSON.stringify(unsafePackageValue),
  )
assert.ok(packageDocumentParse)
assert.equal(packageDocumentParse.diagnostics.length, 1)
const canonicalPackageDocument = JSON.parse(
  serializeDistributableComponentPackage(packageDocumentParse.componentPackage),
) as Record<string, unknown>
assert.equal(
  'implementation' in
    (((canonicalPackageDocument.definition as Record<string, unknown>)
      .actions as Record<string, Record<string, unknown>>).start),
  false,
  'current package serialization cannot re-emit imported Action source',
)
assert.equal(canonicalPackageDocument.implementationDraft, implementationDraft)

assert.equal(
  (globalThis as Record<string, unknown>).__scadaPortableActionExecuted,
  undefined,
  'import migration never executes supplied Action source',
)
assert.equal(
  (globalThis as Record<string, unknown>).__scadaPortableDraftExecuted,
  undefined,
  'implementationDraft remains inert through local/package round trips',
)

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(root, entry.name)
    if (entry.isDirectory()) return sourceFiles(absolute)
    return ['.ts', '.tsx'].includes(extname(entry.name)) ? [absolute] : []
  })
}

const componentAuthoringRoot = join(process.cwd(), 'src/features/component-library')
for (const file of sourceFiles(componentAuthoringRoot)) {
  const source = readFileSync(file, 'utf8')
  assert.doesNotMatch(
    source,
    /\bnew\s+Function\s*\(/,
    `${relative(process.cwd(), file)} must not construct authored JavaScript`,
  )
  assert.doesNotMatch(
    source,
    /\beval\s*\(/,
    `${relative(process.cwd(), file)} must not evaluate authored JavaScript`,
  )
}

const publicDefinitionSource = readFileSync(
  join(process.cwd(), 'src/component-system/definition.ts'),
  'utf8',
)
assert.doesNotMatch(
  publicDefinitionSource,
  /implementation\s*\?:/,
  'ComponentActionDefinition must not regain an executable-source field',
)

const managedSvgThemeSource = readFileSync(
  join(process.cwd(), 'src/component-system/managedSvgTheme.ts'),
  'utf8',
)
assert.doesNotMatch(
  managedSvgThemeSource,
  /defaultImplementation/,
  'SVG declarative capabilities must not carry JavaScript templates',
)

console.log(
  'Portable execution boundary checks passed: current definitions reject Action source, legacy local/package inputs strip it with diagnostics, retained declarations require draft cleanup, canonical serializers cannot re-emit source, implementationDraft remains inert, and component authoring contains no eval/new Function path.',
)
