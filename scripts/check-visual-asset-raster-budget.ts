import assert from 'node:assert/strict'
import {
  computeSvgCanvasRasterScale,
  serializeManagedSvgCanvasDataUrl,
  serializeManagedSvgCanvasDocument,
  SVG_CANVAS_RASTER_TARGET_DIMENSION,
  type ManagedSvgDocument,
} from '../src/component-system/managedSvg'
import { resolveComponentVisualRules, type VisualRule } from '../src/component-system/visualRules'
import {
  COMPONENT_VISUAL_VERSION,
  type ComponentVisualDefinition,
} from '../src/component-system/visual'

// ---------------------------------------------------------------------------
// Raster scale budget: the rasterized bitmap of a managed SVG layer must stay
// within the 2048px pixel budget. Large-viewBox illustrations must never be
// force-upscaled (the previous min-2x rule produced 6000x4000 rasters).
// ---------------------------------------------------------------------------
assert.equal(computeSvgCanvasRasterScale(24, 24), 8) // tiny icon: max-scale cap
assert.equal(computeSvgCanvasRasterScale(512, 512), 4) // -> 2048x2048
assert.equal(computeSvgCanvasRasterScale(1024, 1024), 2) // -> 2048x2048
assert.equal(computeSvgCanvasRasterScale(1100, 1100), 1) // 2200^2 exceeds budget
assert.equal(computeSvgCanvasRasterScale(1920, 1440), 1) // 2x would be 11M px
assert.equal(computeSvgCanvasRasterScale(3000, 2000), 1) // never upscale beyond natural
assert.equal(computeSvgCanvasRasterScale(300, 200), 7) // ceil(2048/300), within budget
assert.equal(computeSvgCanvasRasterScale(0, 100), 1) // invalid geometry
assert.equal(computeSvgCanvasRasterScale(Number.NaN, 100), 1)

for (const [w, h] of [[24, 24], [512, 384], [1024, 1024], [1100, 900], [1920, 1440], [3000, 2000], [333, 1]] as const) {
  const scale = computeSvgCanvasRasterScale(w, h)
  const pixels = w * scale * h * scale
  // The budget caps upscaling; a source whose natural size already exceeds it
  // is never further upscaled (and never downscaled).
  const allowed = Math.max(
    SVG_CANVAS_RASTER_TARGET_DIMENSION ** 2,
    w * h,
  )
  assert.ok(
    pixels <= allowed,
    `${w}x${h}: rasterized ${w * scale}x${h * scale} exceeds the pixel budget`,
  )
  assert.ok(scale >= 1 && scale <= 8, `${w}x${h}: scale ${scale} out of range`)
}

// ---------------------------------------------------------------------------
// Serialized canvas documents carry the clamped dimensions on the svg root.
// ---------------------------------------------------------------------------
function documentWithViewBox(width: string, height: string, viewBox: string): ManagedSvgDocument {
  return {
    version: 1,
    root: {
      kind: 'element',
      tagName: 'svg',
      tagId: 'svg-tag-000001',
      attributes: [
        { name: 'height', value: height },
        { name: 'viewBox', value: viewBox },
        { name: 'width', value: width },
      ],
      children: [],
    },
  }
}

function rootSizeOf(document: ManagedSvgDocument) {
  const markup = serializeManagedSvgCanvasDocument(document)
  const width = Number(markup.match(/\bwidth="(\d+)"/)?.[1])
  const height = Number(markup.match(/\bheight="(\d+)"/)?.[1])
  return { markup, width, height, document }
}

const dense = rootSizeOf(documentWithViewBox('1920', '1440', '0 0 1920 1440'))
assert.equal(dense.width, 1920)
assert.equal(dense.height, 1440)

const icon = rootSizeOf(documentWithViewBox('24', '24', '0 0 24 24'))
assert.equal(icon.width, 192)
assert.equal(icon.height, 192)

const square = rootSizeOf(documentWithViewBox('512', '512', '0 0 512 512'))
assert.equal(square.width, 2048)
assert.equal(square.height, 2048)

// ---------------------------------------------------------------------------
// Data URL memoization: the default-target data URL is serialized once per
// document reference. Observable through the global encodeURIComponent call
// count, which the serializer must hit exactly once for a repeated document.
// ---------------------------------------------------------------------------
const originalEncodeURIComponent = globalThis.encodeURIComponent
let encodeCalls = 0
globalThis.encodeURIComponent = ((value: string) => {
  encodeCalls += 1
  return originalEncodeURIComponent(value)
}) as typeof encodeURIComponent

try {
  const first = serializeManagedSvgCanvasDataUrl(dense.document)
  const second = serializeManagedSvgCanvasDataUrl(dense.document)
  assert.equal(first, second)
  assert.equal(encodeCalls, 1, 'repeated default-target serialization must be memoized')

  // A custom target bypasses the memo and stays deterministic.
  encodeCalls = 0
  serializeManagedSvgCanvasDataUrl(dense.document, 1024)
  serializeManagedSvgCanvasDataUrl(dense.document, 1024)
  assert.equal(encodeCalls, 2, 'custom raster targets are computed per call')
} finally {
  globalThis.encodeURIComponent = originalEncodeURIComponent
}

// ---------------------------------------------------------------------------
// Rule resolution is copy-on-write: only rule-targeted layers are cloned, so
// untouched managed SVG layers keep their identity and their memoized data
// URLs stay valid.
// ---------------------------------------------------------------------------
const svgDocument: ManagedSvgDocument = dense.document
const fillRule: VisualRule = {
  id: 'lamp-on',
  enabled: true,
  propertyKey: 'state',
  operator: 'equals',
  compareValue: 'running',
  layerId: 'lamp',
  target: 'style.fill',
  value: '#22c55e',
}
const disabledRule: VisualRule = {
  id: 'disabled-rule',
  enabled: false,
  propertyKey: 'state',
  operator: 'equals',
  compareValue: 'running',
  layerId: 'plate',
  target: 'style.fill',
  value: '#000000',
}

const visual: ComponentVisualDefinition = {
  version: COMPONENT_VISUAL_VERSION,
  mode: 'composite',
  designSize: { width: 480, height: 360 },
  layers: [
    {
      id: 'plate',
      name: 'Managed SVG plate',
      kind: 'svg',
      parentId: null,
      transform: { x: 0, y: 0, width: 480, height: 360, rotation: 0, scaleX: 1, scaleY: 1 },
      visible: true,
      opacity: 1,
      assetRef: serializeManagedSvgCanvasDataUrl(svgDocument),
      document: svgDocument,
      style: { fit: 'contain' },
    },
    {
      id: 'lamp',
      name: 'Lamp',
      kind: 'vector',
      primitive: 'rect',
      parentId: null,
      transform: { x: 32, y: 32, width: 48, height: 24, rotation: 0, scaleX: 1, scaleY: 1 },
      visible: true,
      opacity: 1,
      style: { fill: '#64748b', stroke: '#94a3b8', strokeWidth: 1 },
    },
  ],
  rules: [fillRule, disabledRule],
  animations: [],
}

// No rules -> the exact visual reference is returned.
const ruleless = { ...visual, rules: [] }
assert.equal(
  resolveComponentVisualRules(ruleless, { attributes: {}, properties: {} }),
  ruleless,
)

const running = resolveComponentVisualRules(visual, {
  attributes: {},
  properties: { state: 'running' },
})
assert.notEqual(running, visual)
assert.equal(running.layers.length, visual.layers.length)
// Untouched (and disabled-rule-addressed) layers keep identity.
assert.equal(running.layers[0], visual.layers[0])
// The rule-targeted layer is cloned and rewritten.
assert.notEqual(running.layers[1], visual.layers[1])
const resolvedLamp = running.layers[1]
assert.ok(resolvedLamp && resolvedLamp.kind === 'vector' && resolvedLamp.style)
assert.equal(resolvedLamp.style.fill, '#22c55e')
// Shared visual-level state keeps identity too.
assert.equal(running.rules, visual.rules)
assert.equal(running.animations, visual.animations)

// Non-matching context leaves every layer untouched.
const stopped = resolveComponentVisualRules(visual, {
  attributes: {},
  properties: { state: 'stopped' },
})
assert.equal(stopped.layers[0], visual.layers[0])
assert.equal(stopped.layers[1], visual.layers[1])

console.log('check-visual-asset-raster-budget: all assertions passed')
