import assert from 'node:assert/strict'
import {
  assertSvgLayerMethods,
  isSvgLayerMethodName,
  SVG_LAYER_METHOD_LIMITS,
  type SvgLayerMethodDefinition,
} from '../src/component-system/visual'
import {
  LAYER_METHOD_DEFAULT_LIMITS,
  runLayerMethod,
} from '../src/runtime/controlled-layer-method-engine'
import { SVG_LAYER_BUILTIN_METHODS } from '../src/component-system/managedSvgTheme'

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

console.log(
  'Layer method checks passed: authored SVG layer functions validate fail-closed (names, duplicates, size caps, parameter shapes), and the controlled QuickJS engine executes them inside a sandbox with no host globals, structured whitelisted $self/$emit operations only, argument marshalling, timeout and memory interruption, and missing-function/syntax failure surfaces.',
)
