# SCADA Editor Lab Development Plan

## 1. Product direction

This repository is a browser-first, generic SCADA authoring and runtime experiment.

The product intentionally contains two different workbenches:

```text
Workspace
├─ SCADA Works
│   └─ SCADA Workbench
│       └─ simple business-oriented scene authoring
│           ├─ place reusable components
│           ├─ move / resize / rotate / connect
│           ├─ configure public properties
│           ├─ bind runtime data
│           └─ preview / run
│
└─ Component Library
    └─ Component Workbench
        └─ advanced reusable-component development
            ├─ public contract
            ├─ layered visual composition
            ├─ rules / expressions
            ├─ animation
            ├─ controlled script
            └─ preview / diagnostics
```

The guiding product rule remains:

> Increasing Component Workbench power must not increase normal SCADA scene-authoring complexity.

Detailed architecture remains in:

- [`docs/architecture/component-system.md`](docs/architecture/component-system.md)
- [`docs/architecture/editor-foundation.md`](docs/architecture/editor-foundation.md)
- [`docs/architecture/visual-connections.md`](docs/architecture/visual-connections.md)
- [`docs/product/editor-ui.md`](docs/product/editor-ui.md)

---

## 2. Architectural invariants

### 2.1 Public contract vs private implementation

Reusable component public contract:

```text
Properties + Actions + Events + Anchors
```

Private implementation by default:

```text
Visual Layers
SVG / Image / Vector / Text internals
Visual Rules
Animations
Internal state
Scripts
Native renderer details
```

SCADA Workbench consumes only the public contract.

### 2.2 Component creation source must not change component capability

A component visual may come from:

```text
Native renderer
Composite visual tree
SVG
Bitmap
Vector primitives
Text
Groups
```

These sources may be mixed and nested. They do not decide whether the component supports Properties, Actions, Events, Anchors, Rules, Animation or Script.

### 2.3 Component Workbench may be powerful; SCADA Workbench should remain simple

Advanced authoring complexity belongs in component development. Scene authors should not need to understand a component's private Layer Tree or implementation rules.

### 2.4 Renderer-independent component boundary

User-authored component logic must not receive raw React, DOM or `Konva.Node` objects as its public programming contract.

Target boundary:

```text
Component Rule / Script
        ↓
Controlled Runtime API
        ↓
Visual Runtime Model
        ↓
Konva renderer
```

### 2.5 Visual connection and runtime behavior remain separate

```text
SceneConnection
= visible pipe / wire / process line

Runtime Binding / Behavior
= property data / event / action semantics
```

Visual anchors are not runtime ports.

### 2.6 Editing interaction must be predictable

For both SCADA Workbench and Component Workbench:

- dragging should follow the pointer directly
- snapping must not modify position during drag
- alignment/snap guides may be shown during drag as hints only
- actual snapping happens once on pointer release / `dragend`
- grid display and snap enable state are independent concepts
- canvas commands belong in the Canvas Toolbar, not in the document Header

---

# 3. Milestone status

```text
M0 Application shell / Workspace                              complete enough
M1 Canvas / viewport / fixed artboard                         mostly complete
M2 Editing commands / history / hierarchy                     usable
M3 Generic visual connections                                 usable
M4 Generic component kernel / registry                        accepted
M5 SCADA Runtime v0.1                                         accepted
M6 Component Workbench v1                                     active
M7 Packaging / production adapters / reusable component set    later
```

Runtime v0.1 was accepted on 2026-08-09. Component Workbench is the active implementation phase.

Runtime delivery history is recorded in [`docs/progress/runtime-v0.1.md`](docs/progress/runtime-v0.1.md).

Component Workbench history is recorded in [`docs/progress/component-workbench-v1.md`](docs/progress/component-workbench-v1.md) and the individual M6 progress documents under `docs/progress/`.

---

# 4. Current implementation map

## 4.1 SCADA Workbench

Implemented or usable:

- fixed scene sizes
- viewport zoom / fit / pan
- grid display and snap
- single / multi-selection
- marquee selection
- move / resize / rotate
- alignment guides
- align / distribute
- persistent Group / Ungroup
- lock / visibility
- undo / redo
- duplicate
- component palette
- schema-driven Property Inspector
- runtime data binding
- Preview runtime lifecycle
- Action / Event runtime kernel
- persisted Event -> Action behavior
- visual anchors and SceneConnections

Current interaction invariant:

> SCADA node movement does not snap while dragging; grid/object snap is evaluated once after drag ends.

## 4.2 Component Workbench

Implemented:

- package-backed public `ComponentDefinition`
- Properties / Actions / Events / Anchors authoring
- private heterogeneous Layer Tree
- Group / SVG / Image / Vector / Text layers
- private `designSize` coordinate system
- composite renderer
- direct canvas select / move / resize / rotate
- contextual Properties inspector
- typed visual styles
- Visual Rules
- Preview property values and rule evaluation
- selected-layer editor-only front priority
- component design grid with configurable spacing
- grid/object movement snapping
- drag-time alignment hints
- total snap toggle in the Canvas Toolbar
- shared Layer multi-selection with `selectedLayerIds` + `primaryLayerId`
- shared renderer/model-independent geometry command core
- six Align commands and two Distribute commands
- safe same-parent Group / Ungroup with transform preservation
- private visual schema v3 with serialized animation definitions
- renderer-independent spin animation model, timing, easing and Property activation
- Preview-only transient animation clock and overlay composition after Visual Rules

Current gate:

> M6.4.1 spin model/evaluator is accepted. The renderer-independent animation boundary, v1/v2 -> v3 migration, deterministic model checks and deployed Preview proof are green. M6.4 remains active; animation authoring UI and additional animation families are subsequent slices.

The detailed record is [`docs/progress/m6.4-animation-foundation.md`](docs/progress/m6.4-animation-foundation.md).

---

# 5. M6 Component Workbench v1

## M6.1 Package-backed public contract — complete

The Workbench owns the real serializable `ComponentDefinition` and authors:

- metadata
- default/minimum instance size
- public Properties
- public bindable Properties
- Actions
- Events
- visual Anchors

## M6.2 Layer Tree and Workbench shell — accepted / refined

Implemented:

- private versioned `ComponentVisualDefinition`
- Group / SVG / Image / Vector / Text hierarchy
- nesting / reorder / rename / delete
- private visual `designSize`
- Layers → Canvas → contextual Inspector shell
- shared Studio UI primitives

## M6.3 Visual authoring foundation — accepted · 2026-08-26

```text
M6.3.0 Composite renderer foundation                  complete
M6.3.1 Direct component-canvas interaction            complete
M6.3.1.1 Hit testing + private design space           complete
M6.3.2 Typed visual styles                            complete
M6.3.3 Property-driven Visual Rules                   complete
M6.3.4 Component canvas authoring commands            accepted · 2026-08-26
```

### M6.3.4 Component canvas authoring commands

Goal:

> Bring the Component Workbench canvas to the same editing grammar as the SCADA canvas where the concepts are genuinely shared, without blindly copying scene-only features.

Implementation complete:

```text
M6.3.4.1 Layer multi-selection                        complete
M6.3.4.2 Shared geometry command core                 complete
M6.3.4.3 Align / Distribute toolbar commands          complete
M6.3.4.4 Safe sibling Group / Ungroup                 complete
```

The implementation includes:

- formal Canvas Toolbar ownership
- configurable design grid
- total snap toggle
- object + grid movement snapping
- drag-time guide hints without persisted live snapping
- snap application at `dragend`
- Canvas + Layers shared multi-selection state
- primary Layer semantics for single-object Inspector editing
- shared pure alignment/distribution math
- all six Align commands
- horizontal/vertical Distribute
- same-parent Group / Ungroup with stable child ids and transform preservation
- Preview geometry lockout

Automated deployed-site browser acceptance runs after successful GitHub Pages deployment via:

- `.github/workflows/pages-smoke.yml`
- `scripts/pages-smoke.mjs`
- `scripts/pages-component-hit-smoke.mjs`
- `scripts/pages-scada-geometry-smoke.mjs`

Final M6.3.4 acceptance passed on 2026-08-26 in Pages Browser Smoke #24 against deployed revision `f5e7aea2e75489fbb4cc17a13106db994274c8b9`.

The deployed acceptance proves:

1. Component multi-selection, geometry command enablement, all Align/Distribute commands, Group persistence, Ungroup geometry preservation, Preview locking and snap-toggle state.
2. Component pointer regression in both Chromium and Firefox: empty-layer hit testing, canvas modifier selection, pointer-direct dragging and release-only snapping.
3. SCADA Workbench Align/Distribute regression through real editor selection state after the shared geometry extraction.
4. No browser page errors in the tested flows.

The SCADA geometry smoke intentionally does not use marquee as a prerequisite. It loads a valid grouped three-node fixture, invokes the real SCADA `Ungroup` command to obtain the normal three-node selection, then verifies Align/Distribute through the real toolbar and persisted scene geometry. This keeps the geometry regression focused on the shared command path instead of coupling it to viewport/marquee behavior.

**Result: M6.3.4 is accepted and the M6.3 Visual authoring foundation is closed.**

Do not reopen M6.3.4 with marquee, cross-parent grouping or resize/rotate snapping merely because they are adjacent canvas features; those remain separate future slices if they become necessary.

## M6.4 Animation foundation — active

Animations remain private component implementation details unless deliberately controlled through public Properties.

The runtime boundary is now fixed:

```text
serialized Layer state
        ↓
Visual Rules
        ↓
effective rule-resolved state
        ↓
pure Animation Evaluator(time, Properties)
        ↓
transient Layer Overlay
        ↓
Renderer
        ↓
Konva
```

The Renderer does not own authored timing/activation semantics and animation frames are never written back into the component package.

### M6.4.1 Spin model / evaluator — accepted · 2026-08-26

Implemented and accepted:

- `ComponentVisualDefinition` v3 with serialized `animations`
- explicit v1/v2 -> v3 migration with `animations: []`
- stable animation ids and stable Layer targets
- first discriminated animation variant: `spin`
- duration, delay, finite/infinite iterations, direction and bounded easing vocabulary
- declarative `always` and Property-condition activation
- definition-aware animation validation
- pure deterministic animation progress/evaluation
- additive rotation overlays
- deterministic multiple-spin composition
- Visual Rules resolve before animation overlays
- Preview-only `requestAnimationFrame` clock owned by the React host
- Design mode remains static
- animation frame state never calls package `onChange`, never enters undo history and never persists geometry
- Layer rename/delete/clone/group/ungroup reconciliation preserves or removes animation references consistently
- Property rename/delete reconciliation updates or removes Property-activated animations

Verification:

- CI #496 passed Build, deterministic Animation model checks and Lint.
- deterministic checks cover v1/v2 migration, timing boundaries, reverse/alternate, easing, Property activation, validation, multiple-spin composition and Rules -> Animation ordering.
- Pages Browser Smoke #40 passed against deployed revision `a293d745dca1a7cf9122fc93072a8390f66a20d9`.
- the deployed smoke proves Design frames remain static, Preview spin changes actual canvas pixels and persisted base rotation remains unchanged.
- the same deployed run kept Chromium + Firefox pointer regressions and SCADA shared Align/Distribute regression green.

**Result: M6.4.1 is accepted. M6.4 remains active.**

Next M6.4 work should build authoring capability on this accepted model instead of bypassing it with Konva Tweens or DOM/CSS animation side channels. The next focused slice is animation authoring UI for the accepted spin definition before broadening the animation family.

## M6.5 Controlled Script Runtime — pending

Target API categories:

```text
Property API
Event / Action API
Visual API
Diagnostics
```

Scripts must not receive unrestricted DOM / React / Konva / browser-global access.

## M6.6 User component registration / publication — pending

Prove that a Workbench-authored component package can be consumed by SCADA Workbench through the same generic repository/registry path as built-ins without component-specific editor code.

---

# 6. Immediate execution sequence

Current execution order from `main`:

```text
1. M6.3.4 / M6.3 acceptance                              done
2. M6.4 animation architecture boundary                   done
3. M6.4.1 visual schema v3 + migration                    done
4. M6.4.1 pure spin evaluator + overlay composition       done
5. M6.4.1 Preview clock + transient rendering             done
6. M6.4.1 deterministic CI model checks                   passed
7. M6.4.1 deployed Pages animation smoke                  passed
8. Mark M6.4.1 accepted                                   done
9. M6.4.2 spin authoring UI                               NEXT
10. Additional animation families                         later M6.4
11. M6.5 Controlled Script Runtime                        later
12. M6.6 publish user-created composite component         later
13. M7 packaging / adapters / production components       later
```

The **next step is M6.4.2 spin authoring UI**:

> Expose the already-accepted spin definition through the Component Workbench Inspector without changing the runtime boundary. Authoring controls should edit serialized definitions; Preview should continue to consume only the pure evaluator/overlay path.

Do not broaden into a generic timeline/keyframe editor in this slice. First prove that users can create, edit, enable/disable and remove a validated spin animation targeting the selected private Layer, including Property activation and timing fields.

---

# 7. Near-term non-goals

The following should not distract the initial M6.4 foundation:

- full vector illustration tooling
- arbitrary path editing
- rulers / manual guides
- cross-parent Group in the first grouping slice
- snapping during live drag
- resize/rotate snapping before a separate need is established
- arbitrary keyframe/timeline editor
- CSS/Web Animations API as authored component contract
- raw Konva Tween exposure
- unrestricted component JavaScript execution
- production component marketplace/package distribution
- collaborative editing
- protocol-specific component APIs

These items are deferred, not rejected.
