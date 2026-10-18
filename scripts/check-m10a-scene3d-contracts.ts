import assert from 'node:assert/strict'
import {
  SCENE3D_DRAFT_VERSION,
  validateScene3DDraftDocument,
  type Scene3DDocumentV1,
} from '../src/scene3d-draft/scene3d-schema'
import {
  classifyWorkContentDraft,
  sceneV8ComponentNodeHasNoQuaternion,
  sceneV8DocumentHasNoEnvironment,
  sceneV8DocumentHasNoRuntimeCamera,
  sceneV8DocumentHasNoUnits,
  sceneV8GroupNodeHasNoQuaternion,
  sceneV8TransformHasNoDepthAxis,
} from '../src/scene3d-draft/work-content'
import {
  GLB_MEDIA_TYPE,
  validateComponentPackageV3Draft,
} from '../src/scene3d-draft/component-package-v3'
import {
  projectScene2DDocument,
  projectScene3DDocument,
} from '../src/scene3d-draft/runtime-scene-projection'
import { SCENE_VERSION } from '../src/scene/schema'

/**
 * M10A "Schema and architecture proof" check.
 *
 * Exercises the isolated draft contracts through their production exports:
 * Scene3D v1 invariants, the WorkContent discrimination boundary, the Scene
 * v8 purity guards, Component Package v3 presentation/manifest invariants,
 * and the 2D/3D RuntimeSceneProjection parity required by
 * `docs/acceptance/m10-3d-acceptance-matrix.md` (M10A acceptance).
 */

const identityQuaternion = [0, 0, 0, 1] as const

function transform(overrides: Record<string, unknown> = {}) {
  return {
    position: [0, 0, 0],
    rotation: [...identityQuaternion],
    scale: [1, 1, 1],
    ...overrides,
  }
}

function scene3DFixture(overrides: {
  document?: Record<string, unknown>
  nodes?: unknown[]
  camera?: Record<string, unknown>
} = {}): Record<string, unknown> {
  return {
    version: SCENE3D_DRAFT_VERSION,
    id: 'scene3d-fixture',
    name: 'Fixture 3D scene',
    units: 'm',
    upAxis: 'Y',
    environment: { kind: 'none' },
    runtimeCamera: {
      position: [4, 3, 6],
      target: [0, 0, 0],
      up: [0, 1, 0],
      fovY: 50,
      ...overrides.camera,
    },
    nodes: overrides.nodes ?? [
      {
        kind: 'component',
        id: 'pump-1',
        parentId: null,
        transform: transform(),
        type: 'starter.pump',
        attributes: { runningColor: '#22c55e' },
        propertyFallbacks: { state: 'stopped' },
        scadaSemantics: null,
      },
    ],
    connections: [],
    ...overrides.document,
  }
}

function expectRejected(value: unknown, issueFragment: string, label: string) {
  const result = validateScene3DDraftDocument(value)
  assert.equal(result.ok, false, `${label} must be rejected`)
  assert.ok(
    !result.ok && result.issues.some((issue) => issue.includes(issueFragment)),
    `${label} must report "${issueFragment}", got ${JSON.stringify(result.issues)}`,
  )
}

// --- Scene3D v1: valid document and boundary normalization -----------------

{
  const result = validateScene3DDraftDocument(
    scene3DFixture({
      nodes: [
        {
          kind: 'component',
          id: 'pump-1',
          parentId: null,
          transform: transform({
            rotation: [0.71, 0, 0, 0.71],
          }),
          type: 'starter.pump',
          attributes: {},
          propertyFallbacks: {},
          scadaSemantics: null,
        },
      ],
    }),
  )
  assert.equal(result.ok, true, 'valid Scene3D v1 fixture must pass')
  assert.ok(result.ok)
  const quaternion = result.document.nodes[0]!.transform.rotation
  assert.ok(
    Math.abs(Math.hypot(...quaternion) - 1) < 1e-9,
    'input-boundary quaternions must be normalized',
  )
  for (const component of quaternion) {
    assert.ok(
      Math.abs(component - (component === 0 ? 0 : Math.SQRT1_2)) < 1e-9,
      'equal-component near-unit input must normalize to 1/sqrt(2) components',
    )
  }
}

// --- finite-number fixtures -------------------------------------------------

expectRejected(
  scene3DFixture({
    nodes: [
      {
        kind: 'group',
        id: 'group-1',
        parentId: null,
        transform: transform({ position: [0, Number.NaN, 0] }),
      },
    ],
  }),
  'finite numbers',
  'NaN position',
)
expectRejected(
  scene3DFixture({
    nodes: [
      {
        kind: 'group',
        id: 'group-1',
        parentId: null,
        transform: transform({ scale: [1, Number.POSITIVE_INFINITY, 1] }),
      },
    ],
  }),
  'finite numbers',
  'infinite scale',
)
expectRejected(
  scene3DFixture({ camera: { fovY: Number.NaN } }),
  'finite number in (0, 180)',
  'NaN camera fov',
)

// --- quaternion fixtures ----------------------------------------------------

expectRejected(
  scene3DFixture({
    nodes: [
      {
        kind: 'group',
        id: 'group-1',
        parentId: null,
        transform: transform({ rotation: [0, 0, 0, 0] }),
      },
    ],
  }),
  'zero quaternion',
  'zero quaternion',
)

// --- positive-scale fixtures ------------------------------------------------

expectRejected(
  scene3DFixture({
    nodes: [
      {
        kind: 'group',
        id: 'group-1',
        parentId: null,
        transform: transform({ scale: [0, 1, 1] }),
      },
    ],
  }),
  'positive and non-zero',
  'zero scale',
)
expectRejected(
  scene3DFixture({
    nodes: [
      {
        kind: 'group',
        id: 'group-1',
        parentId: null,
        transform: transform({ scale: [1, -1, 1] }),
      },
    ],
  }),
  'positive and non-zero',
  'negative scale',
)

// --- hierarchy-cycle fixtures -----------------------------------------------

expectRejected(
  scene3DFixture({
    nodes: [
      {
        kind: 'group',
        id: 'group-a',
        parentId: 'group-b',
        transform: transform(),
      },
      {
        kind: 'group',
        id: 'group-b',
        parentId: 'group-a',
        transform: transform(),
      },
    ],
  }),
  'cycle',
  'two-node parent cycle',
)
expectRejected(
  scene3DFixture({
    nodes: [
      {
        kind: 'group',
        id: 'group-a',
        parentId: 'group-a',
        transform: transform(),
      },
    ],
  }),
  'cycle',
  'self parent',
)

// --- duplicate-ID fixtures --------------------------------------------------

expectRejected(
  scene3DFixture({
    nodes: [
      {
        kind: 'group',
        id: 'duplicate',
        parentId: null,
        transform: transform(),
      },
      {
        kind: 'group',
        id: 'duplicate',
        parentId: null,
        transform: transform(),
      },
    ],
  }),
  'duplicate node id',
  'duplicate node id',
)

// --- missing-reference fixtures ---------------------------------------------

expectRejected(
  scene3DFixture({
    nodes: [
      {
        kind: 'group',
        id: 'group-a',
        parentId: 'missing-parent',
        transform: transform(),
      },
    ],
  }),
  'does not reference a known node',
  'missing parent reference',
)
expectRejected(
  scene3DFixture({
    document: {
      connections: [
        {
          id: 'conn-1',
          source: { nodeId: 'pump-1', anchorId: 'left' },
          target: { nodeId: 'unknown-node', anchorId: 'top' },
        },
      ],
    },
  }),
  'does not reference a known node',
  'connection endpoint with unknown node',
)

// --- explicit future-version rejection --------------------------------------

expectRejected(
  scene3DFixture({ document: { version: SCENE3D_DRAFT_VERSION + 1 } }),
  'unsupported Scene3D version',
  'future Scene3D version',
)

// --- malformed persisted semantics rejection --------------------------------

expectRejected(
  scene3DFixture({
    nodes: [
      {
        kind: 'component',
        id: 'pump-1',
        parentId: null,
        transform: transform(),
        type: 'starter.pump',
        attributes: {},
        propertyFallbacks: {},
        scadaSemantics: { version: 99, valueBindings: [], behaviors: [], interactions: [] },
      },
    ],
  }),
  'scadaSemantics',
  'malformed persisted semantics',
)

// --- WorkContent discrimination ---------------------------------------------

{
  const scene2D = classifyWorkContentDraft({
    kind: 'scene-2d',
    document: {
      version: SCENE_VERSION,
      id: 'scene-2d-fixture',
      name: '2D fixture',
      width: 800,
      height: 600,
      background: '#ffffff',
      nodes: [],
      connections: [],
    },
  })
  assert.equal(scene2D.ok, true, 'scene-2d work content must classify')
  assert.ok(scene2D.ok)
  assert.equal(scene2D.content.kind, 'scene-2d')

  const legacyVersion = classifyWorkContentDraft({
    kind: 'scene-2d',
    document: { version: SCENE_VERSION - 1 },
  })
  assert.equal(legacyVersion.ok, false, 'non-v8 scene-2d payload must be rejected')

  const scene3D = classifyWorkContentDraft({
    kind: 'scene-3d',
    document: scene3DFixture(),
  })
  assert.equal(scene3D.ok, true, 'valid scene-3d work content must classify')
  assert.ok(scene3D.ok)
  assert.equal(scene3D.content.kind, 'scene-3d')

  const unknownKind = classifyWorkContentDraft({ kind: 'mesh-editor' })
  assert.equal(unknownKind.ok, false, 'unknown work content kinds must fail closed')

  const malformed3D = classifyWorkContentDraft({
    kind: 'scene-3d',
    document: scene3DFixture({
      nodes: [
        {
          kind: 'group',
          id: 'group-a',
          parentId: 'group-a',
          transform: transform(),
        },
      ],
    }),
  })
  assert.equal(malformed3D.ok, false, 'scene-3d work content must validate its document')
}

// --- Scene v8 purity guards ---------------------------------------------------

assert.equal(
  sceneV8TransformHasNoDepthAxis,
  true,
  'Scene v8 NodeTransform must not gain a depth axis',
)
assert.equal(
  sceneV8ComponentNodeHasNoQuaternion,
  true,
  'Scene v8 component nodes must not gain a quaternion field',
)
assert.equal(
  sceneV8GroupNodeHasNoQuaternion,
  true,
  'Scene v8 group nodes must not gain a quaternion field',
)
assert.equal(
  sceneV8DocumentHasNoRuntimeCamera,
  true,
  'Scene v8 documents must not gain a runtime camera',
)
assert.equal(
  sceneV8DocumentHasNoEnvironment,
  true,
  'Scene v8 documents must not gain a 3D environment',
)
assert.equal(
  sceneV8DocumentHasNoUnits,
  true,
  'Scene v8 documents must not gain 3D units',
)

// --- Component Package v3 draft invariants -----------------------------------

function minimalDefinition(): Record<string, unknown> {
  return {
    type: 'm10a.fixture',
    title: 'M10A Fixture',
    category: 'M10A',
    description: '',
    size: {
      defaultWidth: 80,
      defaultHeight: 48,
      minWidth: 20,
      minHeight: 16,
    },
    attributes: {},
    properties: {},
    actions: {},
    events: {},
    anchors: [],
  }
}

const modelDigest = 'a'.repeat(64)

function packageFixture(
  overrides: {
    packageFields?: Record<string, unknown>
    presentation3D?: Record<string, unknown>
  } = {},
): Record<string, unknown> {
  return {
    packageVersion: 3,
    definition: minimalDefinition(),
    presentations: {
      '2d': { kind: 'visual-2d-v1', width: 80, height: 48 },
      '3d': {
        kind: 'visual-3d-v1',
        modelDigest,
        importedNodeIds: ['managed-node-1'],
        materialSlots: [{ id: 'body' }],
        animationClips: [{ id: 'spin', name: 'Spin' }],
        anchors: [{ id: 'port-a', localPosition: [1, 0, 0] }],
        rules: [
          {
            id: 'rule-visibility',
            sourceNamespace: 'properties',
            sourceKey: 'state',
            target: { kind: 'node-visibility', nodeId: 'managed-node-1' },
          },
          {
            id: 'rule-color',
            sourceNamespace: 'attributes',
            sourceKey: 'bodyColor',
            target: { kind: 'material-base-color', slotId: 'body' },
          },
        ],
        ...overrides.presentation3D,
      },
    },
    resources: [
      { digest: modelDigest, mimeType: GLB_MEDIA_TYPE, byteLength: 2048 },
    ],
    ...overrides.packageFields,
  }
}

{
  const valid = validateComponentPackageV3Draft(packageFixture())
  assert.equal(valid.ok, true, 'valid package v3 draft must pass')

  const invalidDefinition = validateComponentPackageV3Draft(
    packageFixture({
      packageFields: { definition: { type: '', title: 'x', category: 'y', description: '' } },
    }),
  )
  assert.equal(invalidDefinition.ok, false, 'invalid public contract must be rejected')

  const missingModel = validateComponentPackageV3Draft(
    packageFixture({
      presentation3D: { modelDigest: 'b'.repeat(64) },
    }),
  )
  assert.equal(missingModel.ok, false, 'model digest outside the manifest must be rejected')
  assert.ok(
    !missingModel.ok
      && missingModel.issues.some((issue) => issue.includes('not covered by the resource manifest')),
  )

  const wrongMediaType = validateComponentPackageV3Draft(
    packageFixture({
      packageFields: {
        resources: [{ digest: modelDigest, mimeType: 'text/html', byteLength: 2048 }],
      },
    }),
  )
  assert.equal(wrongMediaType.ok, false, 'non-GLB model media types must be rejected')

  const duplicateSlot = validateComponentPackageV3Draft(
    packageFixture({
      presentation3D: { materialSlots: [{ id: 'body' }, { id: 'body' }] },
    }),
  )
  assert.equal(duplicateSlot.ok, false, 'duplicate material slot ids must be rejected')

  const unknownRuleTarget = validateComponentPackageV3Draft(
    packageFixture({
      presentation3D: {
        rules: [
          {
            id: 'rule-clip',
            sourceNamespace: 'properties',
            sourceKey: 'state',
            target: { kind: 'animation-clip', clipId: 'missing-clip' },
          },
        ],
      },
    }),
  )
  assert.equal(unknownRuleTarget.ok, false, 'rule targets must resolve inside the presentation')

  const noPresentations = validateComponentPackageV3Draft({
    packageVersion: 3,
    definition: minimalDefinition(),
    presentations: {},
    resources: [],
  })
  assert.equal(
    noPresentations.ok,
    false,
    'package v3 without any presentation must be rejected',
  )

  const wrongVersion = validateComponentPackageV3Draft(
    packageFixture({ packageFields: { packageVersion: 2 } }),
  )
  assert.equal(wrongVersion.ok, false, 'package v2 payloads must not validate as v3 drafts')

  const badDigest = validateComponentPackageV3Draft(
    packageFixture({
      packageFields: {
        resources: [{ digest: 'not-a-digest', mimeType: GLB_MEDIA_TYPE, byteLength: 2048 }],
      },
    }),
  )
  assert.equal(badDigest.ok, false, 'non-SHA-256 digests must be rejected')
}

// --- RuntimeSceneProjection parity -------------------------------------------

{
  const sharedSemantics = {
    version: 1,
    valueBindings: [],
    behaviors: [],
    interactions: [],
  }

  const scene2D = {
    version: SCENE_VERSION,
    id: 'scene-2d-parity',
    name: 'Parity 2D',
    width: 800,
    height: 600,
    background: '#ffffff',
    nodes: [
      {
        id: 'group-1',
        name: '组合 1',
        type: 'core.group',
        parentId: null,
        visible: true,
        locked: false,
        transform: { x: 0, y: 0, width: 10, height: 10, rotation: 0 },
        props: { designWidth: 10, designHeight: 10 },
        bindings: [],
        behaviors: [],
      },
      {
        id: 'pump-1',
        name: 'Pump',
        type: 'starter.pump',
        parentId: null,
        visible: true,
        locked: false,
        transform: { x: 10, y: 10, width: 80, height: 48, rotation: 0 },
        attributes: { runningColor: '#22c55e' },
        propertyFallbacks: { state: 'stopped' },
        bindings: [],
        behaviors: [],
        scadaSemantics: sharedSemantics,
      },
    ],
    connections: [],
  }

  const scene3D = validateScene3DDraftDocument(
    scene3DFixture({
      nodes: [
        {
          kind: 'group',
          id: 'group-1',
          parentId: null,
          transform: transform(),
        },
        {
          kind: 'component',
          id: 'pump-1',
          parentId: null,
          transform: transform({ position: [1, 2, 3] }),
          type: 'starter.pump',
          attributes: { runningColor: '#22c55e' },
          propertyFallbacks: { state: 'stopped' },
          scadaSemantics: sharedSemantics,
        },
      ],
    }),
  )
  assert.equal(scene3D.ok, true, 'parity Scene3D fixture must validate')
  assert.ok(scene3D.ok)

  const projection2D = projectScene2DDocument(scene2D)
  const projection3D = projectScene3DDocument(scene3D.document as Scene3DDocumentV1)

  assert.deepEqual(
    projection2D,
    projection3D,
    'equivalent 2D and 3D component instances must project to one identical runtime input',
  )
  assert.equal(projection2D.instances.length, 1, 'groups must not enter the semantic runtime')
  assert.deepEqual(
    Object.keys(projection2D.instances[0]!).sort(),
    ['attributes', 'id', 'propertyFallbacks', 'scadaSemantics', 'type'],
    'runtime instances must carry contract fields only',
  )
  assert.deepEqual(
    Object.keys(projection2D).sort(),
    ['instances'],
    'the projection must not expose geometry, camera, lighting or material data',
  )
}

console.log(
  'M10A scene3d contract drafts check passed: Scene3D v1 invariants, WorkContent discrimination, ' +
    'Scene v8 purity guards, Component Package v3 invariants, and 2D/3D projection parity verified.',
)
