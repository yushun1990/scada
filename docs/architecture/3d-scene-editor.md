# 3D Scene Editor architecture

- Status: accepted design baseline when merged; implementation is staged by M10
- Date: 2026-09-25
- Related review: `docs/reviews/2026-09-25-3d-editor-readiness-review.md`

## Purpose

This document defines how 3D scene authoring extends the existing product
without replacing the accepted 2D editor or creating a second SCADA runtime.

The central rule is:

> Dimension belongs to Scene geometry and component presentation. SCADA
> semantics remain renderer-independent and singular.

## Product boundary

The Workspace creates two explicit work kinds:

```text
SCADA Work
├─ 2D configuration scene
└─ 3D spatial scene
```

The first M10 release does not mix 2D and 3D nodes in one canvas. A future 2D
HUD over a 3D viewport, if required, must be modeled as an explicit overlay
surface rather than by weakening either Scene schema.

Both work kinds use the same public component vocabulary:

```text
Attributes + Properties + Actions + Events + Anchors
```

They also use the same Value/Behavior/Interaction semantics, data-source
boundary, device/platform effect boundary, Preview runtime and standalone
runtime rules.

## Layered architecture

```text
Authoring application/session
├─ save / leave / history / selection intent / commands
├─ Scene2D document service
└─ Scene3D document service
          │
          ├──────────────┐
          ▼              ▼
   Scene2D viewport  Scene3D viewport
      Konva              Three/R3F
          │              │
          └──────┬───────┘
                 ▼
       RuntimeSceneProjection
                 ▼
   one Preview / Standalone semantic runtime
                 ▼
      effective Property snapshots/effects
```

No renderer object crosses into persisted documents, component contracts,
semantic compilation, repository interfaces or work-package validation.

## Work and Scene documents

### Work envelope

The authoring/storage boundary uses an explicit discriminated union:

```ts
type WorkContent =
  | {
      kind: 'scene-2d'
      document: Scene2DDocumentV8
    }
  | {
      kind: 'scene-3d'
      document: Scene3DDocumentV1
    }
```

Existing Scene v8 inputs migrate deterministically to `kind: 'scene-2d'`.
Scene v8 remains the canonical 2D document and does not gain optional camera,
`z`, depth, quaternion, material or lighting fields.

### Scene3D v1

The conceptual first schema is:

```ts
interface Scene3DDocumentV1 {
  version: 1
  id: string
  name: string
  units: 'm'
  upAxis: 'Y'
  environment: Scene3DEnvironment
  runtimeCamera: Scene3DCamera
  nodes: Scene3DNode[]
  connections: Scene3DConnection[]
}

interface Transform3D {
  position: readonly [number, number, number]
  rotation: readonly [number, number, number, number] // normalized quaternion
  scale: readonly [number, number, number]
}

type Scene3DNode = Scene3DGroupNode | Scene3DComponentNode
```

Normative rules:

- canonical rotation is a quaternion; Euler angles are an Inspector projection;
- all numeric values are finite;
- quaternions are normalized at the versioned input boundary;
- scale components must be positive and non-zero;
- node IDs are stable and unique;
- parent relationships are explicit and acyclic;
- a component node references a component type and persists Attributes,
  Property fallbacks and canonical SCADA semantics exactly as the 2D component
  node does;
- environment and runtime camera are explicit Scene state, not hidden renderer
  defaults.

### Editor camera vs runtime camera

Navigation camera state is local editor preference/session state. Orbiting,
panning, dollying or focusing a selection does not modify the Scene document.

Only an explicit `Set as runtime camera` command updates `runtimeCamera`, and
that update participates in history like any other document command.

## Component contract and presentations

### Contract remains dimension-independent

The component contract owns semantic identity:

```ts
interface ComponentContract {
  type: string
  title: string
  attributes: AttributeDefinitions
  properties: PropertyDefinitions
  actions: ActionDefinitions
  events: EventDefinitions
  anchors: AnchorContracts
}
```

An anchor contract owns its stable ID, title, role and compatibility kinds. It
does not own a 2D point or 3D vector.

### Presentations own spatial realization

The target package shape is conceptually:

```ts
interface ComponentPackageV3 {
  packageVersion: 3
  definition: ComponentContract
  presentations: {
    '2d'?: Visual2DDefinitionV4
    '3d'?: Visual3DDefinitionV1
  }
  resources: ResourceManifest
}
```

A component can provide either or both presentations. Palettes filter out
components that do not support the active work kind.

Existing 2D component size and normalized anchor geometry migrate into the 2D
presentation. The migration must preserve current Scene v8 behavior.

### Visual3D v1

The first 3D presentation supports:

- one resource-closed GLB model;
- a stable imported hierarchy map;
- material slots;
- animation clip references;
- dimension-specific anchor geometry;
- declarative rules that map authored Attributes and effective Properties to
  supported presentation targets.

Initial presentation targets are deliberately narrow:

- node visibility;
- material base color;
- material emissive color/intensity;
- animation clip selection, weight, speed and play state.

Arbitrary Three objects, JavaScript callbacks, shader source and renderer
handles are not authored contract values.

### Stable imported targets

Runtime Three UUIDs and non-unique node names are not stable authoring IDs.

The importer creates a sidecar map of stable managed IDs, optionally seeded by
an allowed `extras.scadaId` in the source GLB. Reimport must:

- preserve IDs for structurally matched targets;
- report removed or ambiguous targets;
- refuse to silently redirect rules, anchors or material references;
- commit the accepted reimport as one undoable document/resource transaction.

## Registry and runtime boundaries

### Separate registries

The current single registration shape becomes two responsibilities:

```text
ComponentContractRegistry
├─ definition and semantic schema
├─ validation and defaults
└─ package/type identity

PresentationRegistry
├─ 2D presentation adapter
└─ 3D presentation adapter
```

Scene and package validation uses the contract registry and never creates a
dummy renderer. A host can validate a portable artifact even when that host
does not load either renderer.

### RuntimeSceneProjection

Both Scene kinds produce a minimal renderer-independent runtime input:

```ts
interface RuntimeSceneProjection {
  instances: readonly RuntimeComponentInstance[]
}

interface RuntimeComponentInstance {
  id: string
  type: string
  attributes: Readonly<Record<string, unknown>>
  propertyFallbacks: Readonly<Record<string, unknown>>
  scadaSemantics?: PersistedScadaSemantics
}
```

Geometry, camera, lighting and material data do not enter the semantic runtime.
The runtime returns effective Property snapshots and host-owned effects keyed by
stable component instance ID. Each presentation adapter applies the snapshot to
its own visual realization.

Preview and standalone hosts inject their package-scoped contract registry and
runtime session. Renderers must not import a mutable global registry or runtime
singleton.

## Resource authority

### Repository model

Binary resources use content addressing:

```ts
interface AssetRecord {
  digest: string       // lowercase SHA-256
  mimeType: string
  byteLength: number
  blob: Blob
}
```

The `AssetRepository` supports atomic put/get/delete/reference operations. Scene
and component documents persist resource references, never object URLs. Object
URLs are renderer-session details and are revoked by the owning asset cache.

### Package model

A work artifact is logically:

```text
manifest
├─ work kind and versioned Scene document
├─ exact portable component dependency closure
├─ resource manifest: digest / media type / byte length
└─ compatibility/capability requirements

resources
└─ bytes addressed by digest
```

The logical model is independent of the eventual transport container. M10A may
select ZIP or another deterministic browser-compatible container, but it must
not change resource identity or validation semantics.

### GLB ingest rules

The first accepted asset type is GLB. Ingest is fail-closed:

- verify declared type, magic/version/length and configured byte limits;
- validate JSON and buffer-view bounds before creating renderer objects;
- reject external, root-relative, protocol-relative, network, file and `blob:`
  resource references;
- allow only explicitly supported glTF extensions and decoder requirements;
- enforce limits for node, primitive, accessor, texture dimensions and decoded
  resource growth;
- compute and verify content digests;
- produce diagnostics before persistence;
- never execute extensions or source code from a model.

Exact decoder allowlists and quantitative limits are M10A decisions backed by
fixtures and measurements.

## 3D presentation adapter

### Technology boundary

The planned implementation is Three.js with React Three Fiber as the React
adapter, isolated in a route-level lazy chunk.

Initial production acceptance targets WebGL2. WebGPU may be probed behind an
explicit experimental capability flag, but M10 does not require WebGPU and must
retain a clear unsupported/context-failure surface.

### Ownership

`Scene3DViewport` owns:

- Three scene, camera and renderer lifecycle;
- asset decoding/cache/reference counts;
- raycast picking;
- orbit/pan/dolly navigation;
- transform controls;
- presentation snapshot application;
- animation mixers;
- geometry/material/texture disposal;
- context loss and restoration reporting.

It does not own save, history, runtime compilation, component contract
validation, work-package parsing or repository migration.

### Rendering and performance

- idle scenes use demand rendering;
- active animation, camera motion and transient manipulation invalidate frames;
- DPR is capped and may degrade according to an accepted performance policy;
- repeated compatible assets may use instancing after correctness is proven;
- renderer resources are disposed when the final logical reference is released;
- performance budgets are fixed by M10A against named fixtures and target
  environments, then enforced without weakening correctness tests.

### Picking and transforms

Raycasting resolves a presentation object back to the stable Scene node ID.
Selection does not expose raw Three objects to the editor application.

Transform tools provide translate, rotate and scale with local/world mode and
snapping. During a gesture the viewport owns a transient preview transform.
Pointer release validates and commits one command; cancel restores the original
transform. Orbit controls and transform controls must have explicit input
arbitration.

## 3D visual connections

A 3D visual connection remains distinct from runtime semantics. Its endpoints
refer to `(nodeId, anchorId)` and resolve anchor geometry through the active 3D
presentation.

The first release supports straight or explicitly-authored polyline geometry.
Automatic pipe routing, simulation, flow solving and collision-aware routing
are outside M10.

Moving/reparenting a component recomputes endpoint world transforms without
rewriting the stable endpoint identity.

## Authoring surface

The 3D editor reuses Studio shell, document header, save/leave, history,
Design/Preview mode and runtime inspectors.

Dimension-specific surfaces are:

- 3D viewport and camera navigation;
- hierarchy/outliner projection;
- transform Inspector with position/quaternion-derived Euler/scale;
- translate/rotate/scale and local/world/snap tools;
- GLB import/reimport diagnostics;
- 3D anchor and connection geometry authoring.

Importing a model should create or update a local component presentation rather
than introducing an uncontracted raw Three node into the business Scene.

## Versioning and migration

Required migration direction:

```text
raw Scene v8 / Work Package v1
        ↓
WorkContent(kind='scene-2d') / Work Package v2+

Component Package v2
        ↓
Component Package v3 with presentations['2d']
```

Rules:

- legacy readers remain explicit fixtures, not live dual authorities;
- ambiguous migration fails with actionable diagnostics;
- repository upgrades are atomic and recoverable;
- standalone parsing is package-scoped and does not install dependencies into
  Studio;
- current-schema serialization emits only the current canonical shape.

## Explicit M10 non-goals

- a mixed 2D/3D Scene schema;
- arbitrary mesh modeling, sculpting or vertex/path editing;
- BIM/IFC/CAD import;
- physics, process simulation or collision simulation;
- WebXR;
- WebGPU-only rendering;
- automatic pipe/cable routing;
- arbitrary shaders or post-processing graphs;
- executable JavaScript in imported components or models;
- authored access to DOM, React, Konva or Three objects;
- automatic external asset/dependency fetching;
- multi-user collaborative editing;
- production protocol integration unrelated to the existing host adapters.

These may be evaluated through future roadmap reviews. They are not implied by
adding a 3D viewport.

## Decisions to close in M10A

The design intentionally leaves these evidence-driven choices to M10A:

- exact Three/R3F versions and decoder set;
- the deterministic artifact container format;
- quantitative GLB/texture/decoded-memory limits;
- reference scenes, target devices and performance budgets;
- final context-recovery behavior supported by target browsers;
- whether optional WebGPU remains viable after the spike.

M10A may refine these implementation choices but may not create a second
runtime, weaken resource closure, or merge the Scene schemas without a new ADR.
