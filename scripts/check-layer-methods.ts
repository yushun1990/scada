import assert from 'node:assert/strict'
import {
  COMPONENT_VISUAL_VERSION,
  assertComponentMethods,
  assertComponentVisualDefinition,
  assertLayerMethods,
  assertSvgLayerMethods,
  cloneComponentVisual,
  createEmptyCompositeVisual,
  isComponentMethodName,
  isSvgLayerMethodName,
  SVG_LAYER_METHOD_LIMITS,
  COMPONENT_METHOD_LIMITS,
  type SvgLayerMethodDefinition,
} from '../src/component-system/visual'
import {
  LAYER_METHOD_DEFAULT_LIMITS,
  runLayerMethod,
} from '../src/runtime/controlled-layer-method-engine'
import { SVG_LAYER_BUILTIN_METHODS } from '../src/component-system/managedSvgTheme'
import {
  COMPONENT_PACKAGE_VERSION,
  parseComponentLibraryDocument,
  serializeComponentLibraryDocument,
  type ComponentLibraryEntry,
} from '../src/features/component-library/component-document'

// 1. Model validation: valid definitions pass, malformed ones fail closed.
const validMethod: SvgLayerMethodDefinition = {
  name: 'applyState',
  title: '应用状态',
  description: '按等级切换主题',
  parameters: [
    {
      name: 'level',
      title: '等级',
      kind: 'select',
      options: [
        { label: '运行', value: 1 },
        { label: '报警', value: 2 },
      ],
      defaultValue: 1,
    },
  ],
  implementation: 'function applyState(level) { return $self.setTheme(level === 2 ? "alarm" : "running"); }',
}
assert.doesNotThrow(() => assertSvgLayerMethods([validMethod]))
assert.doesNotThrow(() =>
  assertSvgLayerMethods(
    Array.from({ length: SVG_LAYER_METHOD_LIMITS.maxMethods }, (_, index) => ({
      name: `method${index}`,
      title: `方法${index}`,
      implementation: `function method${index}() {}`,
    })),
  ),
)

assert.throws(
  () => assertSvgLayerMethods([{ ...validMethod, name: '1bad' }]),
  /名称无效/,
)
assert.throws(
  () =>
    assertSvgLayerMethods([
      { name: 'dup', title: 'A', implementation: 'function dup() {}' },
      { name: 'dup', title: 'B', implementation: 'function dup() {}' },
    ]),
  /名称重复/,
)
assert.throws(
  () => assertSvgLayerMethods([{ ...validMethod, implementation: ' '.repeat(20_001) }]),
  /实现源码无效/,
)
assert.throws(
  () =>
    assertSvgLayerMethods([
      {
        ...validMethod,
        parameters: [{ name: 'p', title: 'P', kind: 'network' as never }],
      },
    ]),
  /参数类型无效/,
)
assert.throws(
  () =>
    assertSvgLayerMethods([
      {
        ...validMethod,
        parameters: [{ name: 'p', title: 'P', kind: 'select', options: [] }],
      },
    ]),
  /select 参数选项无效/,
)
assert.throws(
  () =>
    assertSvgLayerMethods(
      Array.from({ length: SVG_LAYER_METHOD_LIMITS.maxMethods + 1 }, (_, index) => ({
        name: `method${index}`,
        title: `方法${index}`,
        implementation: 'function x() {}',
      })),
    ),
  /数量上限/,
)
assert.equal(isSvgLayerMethodName('setThemeState'), true)
assert.equal(isSvgLayerMethodName('$self'), false)
assert.equal(isSvgLayerMethodName('has-space'), false)

for (const builtin of SVG_LAYER_BUILTIN_METHODS) {
  assert.doesNotThrow(() => assertSvgLayerMethods([builtin]), builtin.name)
}

// 2. Controlled engine: structure, capability surface and fail-closed behavior.
const layers = [
  { id: 'layer-1', name: 'pump', kind: 'svg', visible: true },
  { id: 'layer-2', name: 'pipe', kind: 'vector', visible: true },
]

const sandboxProbe = await runLayerMethod({
  method: {
    name: 'probe',
    parameters: [],
    implementation: `function probe() {
      const leaks = [];
      leaks.push(typeof window);
      leaks.push(typeof document);
      leaks.push(typeof fetch);
      leaks.push(typeof setTimeout);
      leaks.push(typeof XMLHttpRequest);
      if (leaks.some((entry) => entry !== 'undefined')) {
        throw new Error('sandbox leaked host globals: ' + leaks.join(','));
      }
      $self.setTheme('alarm');
      $self.layers[1].show = false;
      $emit('STATE_CHANGED', { from: 'running', to: 'alarm' });
      console.log('applied alarm theme');
      return 'done';
    }`,
  },
  args: {},
  layers,
})
assert.equal(sandboxProbe.ok, true, sandboxProbe.message)
assert.equal(sandboxProbe.message, 'done')
assert.deepEqual(
  sandboxProbe.ops.map((op) => op.kind),
  ['setTheme', 'setLayerVisible', 'emit', 'log'],
)
assert.deepEqual(
  sandboxProbe.ops[1],
  { kind: 'setLayerVisible', layerId: 'layer-2', visible: false },
)

const argRun = await runLayerMethod({
  method: {
    name: 'applyLevel',
    parameters: [{ name: 'level', title: '等级', kind: 'number' }],
    implementation: `function applyLevel(level) {
      if (typeof level !== 'number') throw new Error('level must be number');
      return $self.setTheme(level > 1 ? 'alarm' : 'running');
    }`,
  },
  args: { level: '2' },
  layers,
})
assert.equal(argRun.ok, true, argRun.message)
assert.deepEqual(argRun.ops[0], { kind: 'setTheme', state: 'alarm' })

const badTheme = await runLayerMethod({
  method: {
    name: 'bad',
    parameters: [],
    implementation: `function bad() { $self.setTheme('teal'); }`,
  },
  args: {},
  layers,
})
assert.equal(badTheme.ok, false)
assert.match(badTheme.message, /不支持的主题状态/)

const unknownOp = await runLayerMethod({
  method: {
    name: 'sneaky',
    parameters: [],
    implementation: `function sneaky() {
      const fn = globalThis.__op;
      return fn('stealSecrets', 'now');
    }`,
  },
  args: {},
  layers,
})
assert.equal(unknownOp.ok, false)
assert.match(unknownOp.message, /不支持的宿主操作/)

const infinite = await runLayerMethod({
  method: {
    name: 'spin',
    parameters: [],
    implementation: `function spin() { for (;;) {} }`,
  },
  args: {},
  layers,
  limits: { timeoutMs: 30 },
})
assert.equal(infinite.ok, false)
assert.match(infinite.message, /interrupted|超时|timeout/i)

const memoryHog = await runLayerMethod({
  method: {
    name: 'hog',
    parameters: [],
    implementation: `function hog() {
      const chunks = [];
      for (let i = 0; i < 4000; i++) chunks.push(new Array(20000).fill('x'));
      return chunks.length;
    }`,
  },
  args: {},
  layers,
})
assert.equal(memoryHog.ok, false)

const missingFunction = await runLayerMethod({
  method: {
    name: 'notDefined',
    parameters: [],
    implementation: `function somethingElse() {}`,
  },
  args: {},
  layers,
})
assert.equal(missingFunction.ok, false)
assert.match(missingFunction.message, /未在代码中找到方法定义/)

const syntaxError = await runLayerMethod({
  method: {
    name: 'broken',
    parameters: [],
    implementation: `function broken( {`,
  },
  args: {},
  layers,
})
assert.equal(syntaxError.ok, false)
assert.match(syntaxError.message, /函数源码执行失败/)

assert.deepEqual(LAYER_METHOD_DEFAULT_LIMITS, {
  timeoutMs: 50,
  memoryLimitBytes: 16 * 1024 * 1024,
  maxStackSizeBytes: 512 * 1024,
})

// 3. Multi-layer kind support: image, vector and other visual layers support layer methods.
assert.doesNotThrow(() => assertLayerMethods([validMethod]))
assert.doesNotThrow(() => {
  assertComponentVisualDefinition({
    version: COMPONENT_VISUAL_VERSION,
    mode: 'composite',
    designSize: { width: 100, height: 100 },
    layers: [
      {
        id: 'img-1',
        name: 'photo',
        kind: 'image',
        parentId: null,
        transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0, scaleX: 1, scaleY: 1 },
        visible: true,
        opacity: 1,
        assetRef: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        methods: [validMethod],
      },
    ],
    rules: [],
    animations: [],
  })
})

const imageLayers = [
  { id: 'img-1', name: 'photo', kind: 'image', visible: true },
  { id: 'vec-1', name: 'overlay', kind: 'vector', visible: false },
]

const imageLayerRun = await runLayerMethod({
  method: {
    name: 'toggleOverlay',
    parameters: [],
    implementation: `function toggleOverlay() {
      if ($self.kind !== 'image') throw new Error('expected image self kind');
      $self.layers[1].show = true;
      $emit('OVERLAY_SHOWN', { imageId: $self.id });
      return 'toggled';
    }`,
  },
  args: {},
  layers: imageLayers,
})
assert.equal(imageLayerRun.ok, true, imageLayerRun.message)
assert.equal(imageLayerRun.message, 'toggled')
assert.deepEqual(imageLayerRun.ops, [
  { kind: 'setLayerVisible', layerId: 'vec-1', visible: true },
  { kind: 'emit', eventName: 'OVERLAY_SHOWN', payload: { imageId: 'img-1' } },
])

// 4. Component-level methods: same fail-closed authority at the visual root.
const componentMethod: SvgLayerMethodDefinition = {
  name: 'applyComponentState',
  title: '应用组件状态',
  description: '按状态切换主题并联动图层',
  parameters: [
    { name: 'state', title: '状态', kind: 'string', defaultValue: 'running' },
  ],
  implementation:
    "function applyComponentState(state) { $self.setTheme(state); $self.showLayer('overlay'); return 'ok'; }",
}
assert.doesNotThrow(() => assertComponentMethods([componentMethod]))
assert.throws(
  () => assertComponentMethods([{ ...componentMethod, name: '1bad' }]),
  /名称无效/,
)
assert.throws(
  () => assertComponentMethods([{ ...componentMethod, implementation: '' }]),
  /实现源码无效/,
)
assert.equal(isComponentMethodName('applyComponentState'), true)
assert.equal(COMPONENT_METHOD_LIMITS.maxMethods, SVG_LAYER_METHOD_LIMITS.maxMethods)

const visualWithComponentMethods = {
  ...createEmptyCompositeVisual(),
  methods: [componentMethod],
}
assert.doesNotThrow(() => assertComponentVisualDefinition(visualWithComponentMethods))
assert.throws(
  () =>
    assertComponentVisualDefinition({
      ...visualWithComponentMethods,
      methods: 'not-an-array',
    }),
  /Component visual definition 无效/,
)

const clonedVisual = cloneComponentVisual(visualWithComponentMethods)
assert.deepEqual(
  JSON.parse(JSON.stringify(clonedVisual.methods)),
  [componentMethod],
)
const clonedParams = clonedVisual.methods?.[0]?.parameters
assert.ok(clonedParams, 'cloned visual must carry component methods')
;(clonedParams as Array<{ name: string }>)[0].name = 'mutated'
assert.equal(
  visualWithComponentMethods.methods[0].parameters![0].name,
  'state',
  'cloneComponentVisual must deep-copy component methods',
)

// 5. Controlled engine with a component-level $self context.
const componentSelfRun = await runLayerMethod({
  method: componentMethod,
  args: { state: 'alarm' },
  layers: imageLayers,
  self: { id: 'component-1', name: '泵站组件', kind: 'component' },
})
assert.equal(componentSelfRun.ok, true, componentSelfRun.message)
assert.deepEqual(componentSelfRun.ops, [
  { kind: 'setTheme', state: 'alarm' },
  { kind: 'setLayerVisible', layerId: 'vec-1', visible: true },
])

const componentIdentityRun = await runLayerMethod({
  method: {
    name: 'describeSelf',
    parameters: [],
    implementation: `function describeSelf() {
      if ($self.kind !== 'component') throw new Error('expected component self kind');
      if ($self.id !== 'component-1') throw new Error('expected component id');
      if ($self.name !== '泵站组件') throw new Error('expected component name');
      if ($self.layers.length !== 2) throw new Error('expected all component layers');
      return $self.findLayer('overlay').id;
    }`,
  },
  args: {},
  layers: imageLayers,
  self: { id: 'component-1', name: '泵站组件', kind: 'component' },
})
assert.equal(componentIdentityRun.ok, true, componentIdentityRun.message)
assert.equal(componentIdentityRun.message, 'vec-1')

// Layer-scoped runs keep the edited layer as $self (backward compatibility).
const layerSelfRun = await runLayerMethod({
  method: {
    name: 'selfKindProbe',
    parameters: [],
    implementation: `function selfKindProbe() { return $self.id; }`,
  },
  args: {},
  layers: imageLayers,
})
assert.equal(layerSelfRun.ok, true)
assert.equal(layerSelfRun.message, 'img-1')

// 6. Persistence round-trip: component methods survive as private visual data
//    without entering the public Action/Event contract.
const entryWithComponentMethods: ComponentLibraryEntry = {
  version: COMPONENT_PACKAGE_VERSION,
  id: 'component-method-fixture',
  definition: {
    type: 'custom.component-method-fixture',
    title: 'Component Method Fixture',
    category: 'Fixture',
    description: 'component-level method persistence fixture',
    size: { defaultWidth: 120, defaultHeight: 80, minWidth: 40, minHeight: 24 },
    attributes: {},
    properties: {},
    actions: {},
    events: {},
    anchors: [],
  },
  visual: visualWithComponentMethods,
  status: 'draft',
  implementationDraft: '',
  updatedAt: '2026-10-01T00:00:00.000Z',
  builtIn: false,
}
const serialized = serializeComponentLibraryDocument(entryWithComponentMethods)
const parsed = parseComponentLibraryDocument(serialized)
assert.ok(parsed, 'component document with visual.methods must round-trip')
assert.deepEqual(
  JSON.parse(JSON.stringify(parsed.visual.methods)),
  [componentMethod],
)
assert.deepEqual(parsed.definition.actions, {})
assert.deepEqual(parsed.definition.events, {})

console.log(
  'Layer method checks passed: authored layer and component-level functions validate fail-closed (names, duplicates, size caps, parameter shapes), the controlled QuickJS engine executes them inside a sandbox with no host globals, structured whitelisted $self/$emit operations only, component-scoped $self identity, argument marshalling, timeout and memory interruption, missing-function/syntax failure surfaces, and library-document persistence keeps component methods private.',
)
