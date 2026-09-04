import assert from 'node:assert/strict'
import type { ComponentDefinition } from '../src/component-system/definition'
import { serializeManagedSvgDataUrl, type ManagedSvgDocument } from '../src/component-system/managedSvg'
import { findManagedSvgElement, getManagedSvgElementAttribute } from '../src/component-system/managedSvgAuthoring'
import { ComponentRegistry } from '../src/component-system/registry'
import { COMPONENT_VISUAL_VERSION, type ComponentVisualDefinition } from '../src/component-system/visual'
import { resolveComponentVisualRules } from '../src/component-system/visualRules'
import {
  createDistributableComponentPackage,
  parseDistributableComponentPackage,
  parseDistributableComponentPackageDocument,
  serializeDistributableComponentPackage,
} from '../src/features/component-library/distributable-component-package'
import {
  COMPONENT_PACKAGE_VERSION,
  type ComponentLibraryEntry,
} from '../src/features/component-library/component-document'
import { createStandaloneWorkRuntimeWithHost } from '../src/features/runtime/standalone-work-runtime-core'
import {
  createScadaWorkPackage,
  parseScadaWorkPackageDocument,
  serializeScadaWorkPackage,
} from '../src/features/scada-works/scada-work-package'
import type { SceneDocument } from '../src/scene/schema'

const componentType = 'portable.managed-svg.p1.4'
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
        tagName: 'g',
        tagId: 'svg-tag-000002',
        attributes: [{ name: 'id', value: 'status' }],
        children: [
          {
            kind: 'element',
            tagName: 'rect',
            tagId: 'svg-tag-000003',
            attributes: [
              { name: 'fill', value: '#ef4444' },
              { name: 'height', value: '60' },
              { name: 'id', value: 'indicator' },
              { name: 'width', value: '100' },
              { name: 'x', value: '10' },
              { name: 'y', value: '10' },
            ],
            children: [],
          },
        ],
      },
    ],
  },
}

const definition: ComponentDefinition = {
  type: componentType,
  title: 'Managed SVG P1.4 fixture',
  category: 'Acceptance fixture',
  description: 'M6.3P1.4 package/work/standalone portability fixture',
  size: {
    defaultWidth: 120,
    defaultHeight: 80,
    minWidth: 40,
    minHeight: 24,
  },
  attributes: {
    runningColor: {
      title: 'Running color',
      kind: 'color',
      defaultValue: '#22c55e',
    },
  },
  properties: {
    state: {
      title: 'State',
      kind: 'select',
      defaultValue: 'stopped',
      bindable: true,
      options: [
        { label: 'Stopped', value: 'stopped' },
        { label: 'Running', value: 'running' },
      ],
    },
  },
  actions: {},
  events: {},
  anchors: [],
}

const managedAssetRef = serializeManagedSvgDataUrl(managedDocument)
const visual: ComponentVisualDefinition = {
  version: COMPONENT_VISUAL_VERSION,
  mode: 'composite',
  designSize: { width: 120, height: 80 },
  layers: [
    {
      id: 'svg1',
      name: 'Managed status',
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
      assetRef: managedAssetRef,
      document: managedDocument,
      style: { fit: 'contain' },
    },
    {
      id: 'image1',
      name: 'Portable raster',
      kind: 'image',
      parentId: null,
      transform: {
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      },
      visible: true,
      opacity: 1,
      assetRef: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl9sAAAAASUVORK5CYII=',
      style: { fit: 'contain' },
    },
  ],
  rules: [
    {
      id: 'running-indicator',
      enabled: true,
      propertyKey: 'state',
      operator: 'equals',
      compareValue: 'running',
      layerId: 'svg1',
      svgTagId: 'svg-tag-000003',
      target: 'style.fill',
      value: '#000000',
      valueSource: {
        namespace: 'attribute',
        key: 'runningColor',
      },
    },
  ],
  animations: [],
}

const entry: ComponentLibraryEntry = {
  version: COMPONENT_PACKAGE_VERSION,
  id: 'component-managed-svg-p1.4',
  definition,
  visual,
  status: 'ready',
  implementationDraft: '',
  updatedAt: '2026-09-04T00:00:00.000Z',
  builtIn: false,
}

const componentPackage = createDistributableComponentPackage(entry)
const componentDocument = serializeDistributableComponentPackage(componentPackage)
assert.doesNotMatch(componentDocument, /\"assetRef\"\s*:\s*\"(?:blob:|https?:|\/(?!\/)|\.\.?\/)/)
const componentRoundTrip = parseDistributableComponentPackageDocument(componentDocument)
assert.ok(componentRoundTrip)
assert.equal(componentRoundTrip.packageVersion, 2)
const roundTripSvg = componentRoundTrip.visual.layers.find((layer) => layer.id === 'svg1')
assert.ok(roundTripSvg && roundTripSvg.kind === 'svg' && roundTripSvg.document)
if (!roundTripSvg || roundTripSvg.kind !== 'svg' || !roundTripSvg.document) {
  throw new Error('managed SVG layer missing after component package round-trip')
}
assert.equal(roundTripSvg.assetRef, serializeManagedSvgDataUrl(roundTripSvg.document))
assert.equal(componentRoundTrip.visual.rules?.[0]?.svgTagId, 'svg-tag-000003')
assert.equal(
  getManagedSvgElementAttribute(
    findManagedSvgElement(roundTripSvg.document, 'svg-tag-000003')!,
    'fill',
  ),
  '#ef4444',
)

const scene: SceneDocument = {
  version: 8,
  id: 'managed-svg-p1.4-scene',
  name: 'Managed SVG P1.4 scene',
  width: 640,
  height: 360,
  background: '#ffffff',
  nodes: [
    {
      id: 'managed-svg-node',
      name: 'Managed SVG node',
      type: componentType,
      parentId: null,
      visible: true,
      locked: false,
      transform: {
        x: 240,
        y: 140,
        width: 120,
        height: 80,
        rotation: 0,
      },
      attributes: { runningColor: '#16a34a' },
      propertyFallbacks: { state: 'running' },
      bindings: [],
      behaviors: [],
      scadaSemantics: null,
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
assert.equal(workPackage.dependencies.length, 1)
assert.equal(workPackage.dependencies[0]?.definition.type, componentType)
const workDocument = serializeScadaWorkPackage(workPackage, hostCapabilities)
assert.doesNotMatch(workDocument, /\"assetRef\"\s*:\s*\"(?:blob:|https?:|\/(?!\/)|\.\.?\/)/)
const workRoundTrip = parseScadaWorkPackageDocument(workDocument, hostCapabilities)
assert.ok(workRoundTrip)
assert.equal(workRoundTrip.dependencies.length, 1)
const portableVisual = workRoundTrip.dependencies[0]!.visual
const portableSvg = portableVisual.layers.find((layer) => layer.id === 'svg1')
assert.ok(portableSvg && portableSvg.kind === 'svg' && portableSvg.document)
if (!portableSvg || portableSvg.kind !== 'svg' || !portableSvg.document) {
  throw new Error('managed SVG dependency missing after work package round-trip')
}
assert.equal(portableVisual.rules?.[0]?.svgTagId, 'svg-tag-000003')
assert.equal(portableSvg.assetRef, serializeManagedSvgDataUrl(portableSvg.document))

const resolvedPortableVisual = resolveComponentVisualRules(portableVisual, {
  attributes: { runningColor: '#16a34a' },
  properties: { state: 'running' },
})
const resolvedSvg = resolvedPortableVisual.layers.find((layer) => layer.id === 'svg1')
assert.ok(resolvedSvg && resolvedSvg.kind === 'svg' && resolvedSvg.document)
if (!resolvedSvg || resolvedSvg.kind !== 'svg' || !resolvedSvg.document) {
  throw new Error('managed SVG rule target missing after work-package round-trip')
}
assert.equal(
  getManagedSvgElementAttribute(
    findManagedSvgElement(resolvedSvg.document, 'svg-tag-000003')!,
    'fill',
  ),
  '#16a34a',
  'work-package dependency preserves the Attribute-driven internal SVG rule',
)
assert.equal(
  getManagedSvgElementAttribute(
    findManagedSvgElement(portableSvg.document, 'svg-tag-000003')!,
    'fill',
  ),
  '#ef4444',
  'runtime rule resolution does not mutate the packaged base managed document',
)

const standalone = createStandaloneWorkRuntimeWithHost(workRoundTrip, [])
assert.ok(standalone.registry.get(componentType))
const release = standalone.acquire()
assert.deepEqual(
  standalone.runtime.componentProps.getNodeSnapshot('managed-svg-node'),
  { state: 'running' },
)
release()

const tamperedBlob = structuredClone(componentPackage) as unknown as Record<string, unknown>
const tamperedBlobVisual = (tamperedBlob.visual as ComponentVisualDefinition)
tamperedBlobVisual.layers = tamperedBlobVisual.layers.map((layer) =>
  layer.id === 'image1' && layer.kind === 'image'
    ? { ...layer, assetRef: 'blob:https://example.invalid/asset' }
    : layer,
)
assert.equal(
  parseDistributableComponentPackage(tamperedBlob),
  null,
  'portable blob dependencies fail closed',
)

const tamperedRemote = structuredClone(componentPackage) as unknown as Record<string, unknown>
const tamperedRemoteVisual = (tamperedRemote.visual as ComponentVisualDefinition)
tamperedRemoteVisual.layers = tamperedRemoteVisual.layers.map((layer) =>
  layer.id === 'image1' && layer.kind === 'image'
    ? { ...layer, assetRef: 'https://example.invalid/asset.png' }
    : layer,
)
assert.equal(
  parseDistributableComponentPackage(tamperedRemote),
  null,
  'portable remote dependencies fail closed',
)

const tamperedTag = structuredClone(componentPackage) as unknown as Record<string, unknown>
const tamperedTagVisual = tamperedTag.visual as ComponentVisualDefinition
tamperedTagVisual.rules = tamperedTagVisual.rules?.map((rule) =>
  rule.id === 'running-indicator'
    ? { ...rule, svgTagId: 'svg-tag-999999' }
    : rule,
)
assert.equal(
  parseDistributableComponentPackage(tamperedTag),
  null,
  'missing private SVG tag targets fail closed across package import',
)

const tamperedDocument = structuredClone(componentPackage) as unknown as Record<string, unknown>
const tamperedDocumentVisual = tamperedDocument.visual as ComponentVisualDefinition
tamperedDocumentVisual.layers = tamperedDocumentVisual.layers.map((layer) => {
  if (layer.id !== 'svg1' || layer.kind !== 'svg' || !layer.document) return layer
  return {
    ...layer,
    document: {
      ...layer.document,
      root: {
        ...layer.document.root,
        children: [
          {
            kind: 'element' as const,
            tagName: 'script',
            tagId: 'svg-tag-000002',
            attributes: [],
            children: [],
          },
        ],
      },
    },
  }
})
assert.equal(
  parseDistributableComponentPackage(tamperedDocument),
  null,
  'unsafe managed SVG document structures fail closed at the portable boundary',
)

console.log(
  'Managed SVG portability checks passed: component package v2 and SCADA work package v1 preserve canonical managed SVG document/tag identity, self-contained raster closure and internal Visual Rules; work-package round-trip remains exact, standalone registry activation succeeds, runtime rule resolution preserves base document authority, and blob/remote/missing-tag/unsafe SVG tampering fails closed.',
)
