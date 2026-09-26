import assert from 'node:assert/strict'
import type { ComponentDefinition } from '../src/component-system/definition'
import {
  generateComponentSvgThemeBindings,
} from '../src/component-system/managedSvgTheme'
import {
  findManagedSvgElement,
  getManagedSvgElementAttribute,
} from '../src/component-system/managedSvgAuthoring'
import {
  serializeManagedSvgDataUrl,
  type ManagedSvgDocument,
} from '../src/component-system/managedSvg'
import type { ComponentRegistration } from '../src/component-system/registration'
import type { ComponentRenderer } from '../src/component-system/renderer'
import { ComponentRegistry } from '../src/component-system/registry'
import {
  COMPONENT_VISUAL_VERSION,
  type ComponentVisualDefinition,
} from '../src/component-system/visual'
import { resolveComponentVisualRules } from '../src/component-system/visualRules'
import {
  COMPONENT_PACKAGE_VERSION,
  serializeComponentLibraryDocument,
  type ComponentLibraryEntry,
} from '../src/features/component-library/component-document'
import {
  createDistributableComponentPackage,
  distributableComponentPackageToLibraryEntry,
  parseDistributableComponentPackageDocument,
  serializeDistributableComponentPackage,
} from '../src/features/component-library/distributable-component-package'
import {
  inspectPortableUserComponentCapability,
} from '../src/features/component-library/portable-user-component-capability'
import { createUserComponentActivationController } from '../src/features/component-library/runtime-activation-core'
import { createStandaloneWorkRuntimeWithHost } from '../src/features/runtime/standalone-work-runtime-core'
import {
  createScadaWorkPackage,
  parseScadaWorkPackageDocument,
  serializeScadaWorkPackage,
} from '../src/features/scada-works/scada-work-package'
import type { SceneDocument } from '../src/scene/schema'

const componentType = 'custom.r0.capability-consistency'
const layerId = 'managed-theme-svg'
const themeTagId = 'svg-tag-000002'
const draftSentinel = '__scadaR0CapabilityDraftExecuted'
const dummyRenderer = (() => null) as unknown as ComponentRenderer

const managedDocument: ManagedSvgDocument = {
  version: 1,
  root: {
    kind: 'element',
    tagName: 'svg',
    tagId: 'svg-tag-000001',
    attributes: [{ name: 'viewBox', value: '0 0 120 80' }],
    children: [
      {
        kind: 'element',
        tagName: 'rect',
        tagId: themeTagId,
        attributes: [
          { name: 'class', value: 'scada-theme-base' },
          { name: 'fill', value: '#6b7280' },
          { name: 'height', value: '60' },
          { name: 'width', value: '100' },
          { name: 'x', value: '10' },
          { name: 'y', value: '10' },
        ],
        children: [],
      },
    ],
  },
}

const definition: ComponentDefinition = {
  type: componentType,
  title: 'R0 capability consistency',
  category: 'Acceptance fixture',
  description: 'Declarative managed-SVG theme fixture',
  size: {
    defaultWidth: 120,
    defaultHeight: 80,
    minWidth: 40,
    minHeight: 24,
  },
  attributes: {},
  properties: {},
  actions: {
    // Exact legacy auto-generated declaration. Rebinding must remove it rather
    // than preserve the activation failure introduced by the old generator.
    setRunning: {
      title: '设为运行态',
      description: '切换至正常运行态 (绿色)',
    },
  },
  events: {},
  anchors: [],
}

const baseVisual: ComponentVisualDefinition = {
  version: COMPONENT_VISUAL_VERSION,
  mode: 'composite',
  designSize: { width: 120, height: 80 },
  layers: [
    {
      id: layerId,
      name: 'Managed theme SVG',
      kind: 'svg',
      parentId: null,
      transform: {
        x: 0,
        y: 0,
        width: 120,
        height: 80,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      },
      visible: true,
      opacity: 1,
      assetRef: serializeManagedSvgDataUrl(managedDocument),
      document: managedDocument,
      style: { fit: 'contain' },
    },
  ],
  rules: [],
  animations: [],
}

const bound = generateComponentSvgThemeBindings(layerId, definition, baseVisual)
const capability = inspectPortableUserComponentCapability(bound.definition)
assert.equal(capability.activatable, true)
assert.deepEqual(bound.removedLegacyActionKeys, ['setRunning'])
assert.deepEqual(bound.definition.actions, {})
assert.deepEqual(bound.definition.events, {})
assert.equal(bound.definition.properties.state?.kind, 'select')
assert.equal(bound.definition.properties.state?.bindable, true)
assert.deepEqual(
  bound.visual.rules?.map((rule) => [rule.propertyKey, rule.compareValue, rule.target]),
  [
    ['state', 'running', 'svg.themeState'],
    ['state', 'alarm', 'svg.themeState'],
    ['state', 'warning', 'svg.themeState'],
    ['state', 'standby', 'svg.themeState'],
    ['state', 'offline', 'svg.themeState'],
  ],
)

const defaultVisual = resolveComponentVisualRules(bound.visual, {
  attributes: {},
  properties: { state: 'default' },
})
const alarmVisual = resolveComponentVisualRules(bound.visual, {
  attributes: {},
  properties: { state: 'alarm' },
})
const defaultLayer = defaultVisual.layers[0]
const alarmLayer = alarmVisual.layers[0]
assert.ok(defaultLayer?.kind === 'svg' && defaultLayer.document)
assert.ok(alarmLayer?.kind === 'svg' && alarmLayer.document)
assert.equal(
  getManagedSvgElementAttribute(
    findManagedSvgElement(defaultLayer.document, themeTagId)!,
    'fill',
  ),
  '#6b7280',
)
assert.equal(
  getManagedSvgElementAttribute(
    findManagedSvgElement(alarmLayer.document, themeTagId)!,
    'fill',
  ),
  '#dc2626',
  'Property state drives the private managed-SVG presentation rule',
)

const entry: ComponentLibraryEntry = {
  version: COMPONENT_PACKAGE_VERSION,
  id: 'r0-capability-consistency',
  definition: bound.definition,
  visual: bound.visual,
  status: 'ready',
  implementationDraft: `globalThis.${draftSentinel} = true`,
  updatedAt: '2026-09-25T00:00:00.000Z',
  builtIn: false,
}
assert.doesNotThrow(() => serializeComponentLibraryDocument(entry))

const registry = new ComponentRegistry([])
const activation = createUserComponentActivationController({
  registry,
  builtInRegistrations: [],
  createRegistration: (candidate): ComponentRegistration => ({
    definition: candidate.definition,
    renderer: dummyRenderer,
    createDefaultProps: () => ({ state: 'default' }),
  }),
}).replace([entry])
assert.deepEqual(activation.activeTypes, [componentType])
assert.deepEqual(activation.diagnostics, [])

const componentPackage = createDistributableComponentPackage(entry)
assert.deepEqual(componentPackage.definition.actions, {})
assert.deepEqual(componentPackage.definition.events, {})
const componentRoundTrip = parseDistributableComponentPackageDocument(
  serializeDistributableComponentPackage(componentPackage),
)
assert.ok(componentRoundTrip)

const importedEntry = distributableComponentPackageToLibraryEntry(
  componentRoundTrip,
  {
    id: 'r0-capability-consistency-import',
    updatedAt: '2026-09-25T00:01:00.000Z',
  },
)
assert.equal(importedEntry.status, 'ready')

const legacyDeclarationPackage = {
  ...componentRoundTrip,
  definition: {
    ...componentRoundTrip.definition,
    actions: { start: { title: 'Start' } },
  },
}
const legacyDraft = distributableComponentPackageToLibraryEntry(
  legacyDeclarationPackage,
  {
    id: 'r0-legacy-declaration-import',
    updatedAt: '2026-09-25T00:02:00.000Z',
  },
)
assert.equal(
  legacyDraft.status,
  'draft',
  'legacy Action/Event artifacts import for cleanup without entering activation',
)
assert.throws(
  () => createDistributableComponentPackage({ ...legacyDraft, status: 'ready' }),
  /尚无已接受的 Action\/Event 运行契约/,
)

const scene: SceneDocument = {
  version: 8,
  id: 'r0-capability-scene',
  name: 'R0 capability scene',
  width: 640,
  height: 360,
  background: '#ffffff',
  nodes: [
    {
      id: 'theme-node',
      name: 'Theme node',
      type: componentType,
      parentId: null,
      visible: true,
      locked: false,
      transform: { x: 200, y: 120, width: 120, height: 80, rotation: 0 },
      attributes: {},
      propertyFallbacks: { state: 'default' },
      bindings: [],
      behaviors: [],
      scadaSemantics: {
        version: 1,
        valueBindings: [
          {
            id: 'value:r0-theme-alarm',
            targetProperty: 'state',
            expression: { kind: 'literal', value: 'alarm' },
          },
        ],
        behaviors: [],
        interactions: [],
      },
    },
  ],
  connections: [],
}

const hostCapabilities = new ComponentRegistry([])
const workPackage = createScadaWorkPackage(
  scene,
  [componentRoundTrip],
  hostCapabilities,
)
const workRoundTrip = parseScadaWorkPackageDocument(
  serializeScadaWorkPackage(workPackage, hostCapabilities),
  hostCapabilities,
)
assert.ok(workRoundTrip)
assert.deepEqual(workRoundTrip.dependencies[0]?.definition.actions, {})
assert.deepEqual(workRoundTrip.dependencies[0]?.definition.events, {})

const standalone = createStandaloneWorkRuntimeWithHost(workRoundTrip, [])
const release = standalone.acquire()
const runtimeProperties = standalone.runtime.componentProps.getNodeSnapshot('theme-node')
assert.deepEqual(runtimeProperties, { state: 'alarm' })
const standaloneVisual = resolveComponentVisualRules(
  workRoundTrip.dependencies[0]!.visual,
  { attributes: {}, properties: runtimeProperties },
)
const standaloneLayer = standaloneVisual.layers[0]
assert.ok(standaloneLayer?.kind === 'svg' && standaloneLayer.document)
assert.equal(
  getManagedSvgElementAttribute(
    findManagedSvgElement(standaloneLayer.document, themeTagId)!,
    'fill',
  ),
  '#dc2626',
)
release()

assert.equal(
  (globalThis as Record<string, unknown>)[draftSentinel],
  undefined,
  'implementationDraft remains inert across activation/package/work/standalone',
)

console.log(
  'Component capability consistency checks passed: managed SVG authoring generates only a bindable Property plus private Visual Rules, legacy generated Actions are removed, ready activation has no diagnostics, package/Scene v8/work/standalone round-trips preserve presentation, runtime Property state changes the expected SVG theme, and unsupported legacy declarations remain draft-only.',
)
