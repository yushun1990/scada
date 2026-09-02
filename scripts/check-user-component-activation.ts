import assert from 'node:assert/strict'
import type { ComponentDefinition } from '../src/component-system/definition'
import type { ComponentRegistration } from '../src/component-system/registration'
import type { ComponentRenderer } from '../src/component-system/renderer'
import { ComponentRegistry } from '../src/component-system/registry'
import {
  createEmptyCompositeVisual,
  createNativeVisual,
} from '../src/component-system/visual'
import {
  COMPONENT_PACKAGE_VERSION,
  type ComponentLibraryEntry,
} from '../src/features/component-library/component-document'
import { createUserComponentActivationController } from '../src/features/component-library/runtime-activation-core'

const dummyRenderer = (() => null) as unknown as ComponentRenderer

function definition(
  type: string,
  options: { action?: boolean; event?: boolean } = {},
): ComponentDefinition {
  return {
    type,
    title: type,
    category: 'Fixture',
    description: '',
    size: {
      defaultWidth: 80,
      defaultHeight: 48,
      minWidth: 20,
      minHeight: 16,
    },
    attributes: {},
    properties: {
      value: {
        title: 'Value',
        kind: 'number',
        defaultValue: 0,
        bindable: true,
      },
    },
    actions: options.action
      ? { run: { title: 'Run' } }
      : {},
    events: options.event
      ? { changed: { title: 'Changed' } }
      : {},
    anchors: [
      {
        id: 'left',
        title: 'Left',
        position: { x: 0, y: 0.5 },
        outward: { x: -1, y: 0 },
      },
    ],
  }
}

function packageEntry(
  id: string,
  type: string,
  options: {
    status?: 'draft' | 'ready'
    native?: boolean
    action?: boolean
    event?: boolean
  } = {},
): ComponentLibraryEntry {
  return {
    version: COMPONENT_PACKAGE_VERSION,
    id,
    definition: definition(type, options),
    visual: options.native ? createNativeVisual() : createEmptyCompositeVisual(),
    status: options.status ?? 'ready',
    implementationDraft: 'throw new Error("must never execute")',
    updatedAt: '2026-08-28T00:00:00.000Z',
    builtIn: false,
  }
}

function registration(type: string): ComponentRegistration {
  const componentDefinition = definition(type)
  return {
    definition: componentDefinition,
    renderer: dummyRenderer,
    createDefaultProps: () => ({ value: 0 }),
  }
}

const builtIn = registration('builtin.fixture')
const registry = new ComponentRegistry([builtIn])
const controller = createUserComponentActivationController({
  registry,
  builtInRegistrations: [builtIn],
  createRegistration: (entry) => {
    if (entry.definition.type === 'custom.invalid') {
      throw new Error('fixture registration failure')
    }
    return {
      definition: entry.definition,
      renderer: dummyRenderer,
      createDefaultProps: () => ({ value: 0 }),
    }
  },
})

const first = controller.replace([
  packageEntry('package-ready', 'custom.ready'),
  packageEntry('package-draft', 'custom.draft', { status: 'draft' }),
])
assert.deepEqual(first.activeTypes, ['custom.ready'])
assert.equal(first.diagnostics.length, 0)
assert.equal(registry.has('custom.ready'), true)
assert.equal(registry.has('custom.draft'), false)
assert.equal(registry.has('builtin.fixture'), true)

const constrained = controller.replace([
  packageEntry('package-native', 'custom.native', { native: true }),
  packageEntry('package-action', 'custom.action', { action: true }),
  packageEntry('package-event', 'custom.event', { event: true }),
  packageEntry('package-built-in-collision', 'builtin.fixture'),
  packageEntry('package-duplicate-a', 'custom.duplicate'),
  packageEntry('package-duplicate-b', 'custom.duplicate'),
  packageEntry('package-invalid', 'custom.invalid'),
])
assert.deepEqual(constrained.activeTypes, [])
assert.equal(registry.has('custom.ready'), false, 'stale registration must be removed')
assert.equal(registry.has('builtin.fixture'), true, 'built-in baseline must survive replacement')
assert.deepEqual(
  constrained.diagnostics.map((diagnostic) => diagnostic.kind).sort(),
  [
    'invalid-registration',
    'native-visual',
    'runtime-contract',
    'runtime-contract',
    'type-collision',
    'type-collision',
    'type-collision',
  ].sort(),
)
assert.equal(
  constrained.diagnostics.filter(
    (diagnostic) => diagnostic.componentType === 'custom.duplicate',
  ).length,
  2,
  'all duplicate ready packages must be rejected rather than picking a winner',
)

const replacement = controller.replace([
  packageEntry('package-next', 'custom.next'),
])
assert.deepEqual(replacement.activeTypes, ['custom.next'])
assert.equal(registry.has('custom.next'), true)
assert.equal(registry.has('custom.ready'), false)

const demoted = controller.replace([
  packageEntry('package-next', 'custom.next', { status: 'draft' }),
])
assert.deepEqual(demoted.activeTypes, [])
assert.equal(registry.has('custom.next'), false, 'ready -> draft must deactivate the type')
assert.equal(registry.has('builtin.fixture'), true)

console.log(
  'User component activation checks passed: ready declarative composite packages activate, draft/native/typed-runtime packages stay out, collisions are deterministic, invalid packages are isolated, and registry replacement removes stale user types without touching built-ins.',
)