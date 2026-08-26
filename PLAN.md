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
            ├─ animation / visual behavior
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
Visual animation / behavior
Internal state
Scripts
Native renderer details
```

SCADA Workbench consumes only the public contract.

A component may internally map public data to private visual behavior, but a scene author should not bind directly to private Layer implementation details.

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

Advanced authoring complexity belongs in component development. Scene authors should not need to understand a component's private Layer Tree, animation implementation or scripts.

### 2.4 Renderer-independent component boundary

User-authored component logic must not receive raw React, DOM or `Konva.Node` objects as its public programming contract.

Target boundary:

```text
Component Rule / Behavior / Script
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

- dragging follows the pointer directly
- snapping does not modify position during drag
- alignment/snap guides are hints only while dragging
- actual snapping happens once on pointer release / `dragend`
- grid display and snap enable state are independent concepts
- canvas commands belong in the Canvas Toolbar, not the document Header

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

Component Workbench history is recorded in the individual M6 progress documents under `docs/progress/`.

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

Current movement invariant:

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
- renderer-independent timing/easing/Property activation experiment foundation
- Preview-only transient animation clock and overlay composition after Visual Rules
- dedicated selected-Layer `动画` Inspector group
- Spin / Move / Scale / Fade authoring
- Property-gated animation activation with typed condition semantics
- additive rotation overlay composition
- additive X/Y translation overlay composition
- multiplicative X/Y scale overlay composition
- multiplicative opacity overlay composition
- save/reopen persistence for authored animation definitions
- deployed browser smoke for every accepted animation experiment family

Current gate:

> M6.4.1 Spin runtime, M6.4.2 Spin authoring, M6.4.3 Move, M6.4.4 Scale and M6.4.5 Fade are accepted. The named families are visual-runtime experiments used to prove different composition channels, not the final promise that the stable API will expose one runtime type per effect. M6.4.6 Blink is next to prove discrete visibility semantics; after Blink, M6.4 must stop adding named effects and consolidate the proven behavior into generic Visual Runtime primitives.

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

M6.3.4 accepted behavior includes:

- formal Canvas Toolbar ownership
- configurable design grid
- total snap toggle
- object + grid movement snapping applied at `dragend`
- drag-time guide hints without live persisted snapping
- Canvas + Layers shared multi-selection state
- primary Layer semantics for single-object Inspector editing
- shared pure alignment/distribution math
- all six Align commands
- horizontal/vertical Distribute
- same-parent Group / Ungroup with stable child ids and transform preservation
- Preview geometry lockout

Final M6.3.4 acceptance passed on 2026-08-26 in Pages Browser Smoke #24 against deployed revision `f5e7aea2e75489fbb4cc17a13106db994274c8b9`.

**Result: M6.3 Visual authoring foundation is closed.**

Do not reopen M6.3.4 with marquee, cross-parent grouping or resize/rotate snapping merely because they are adjacent canvas features; those remain separate future slices if needed.

## M6.4 Animation / visual runtime foundation — active

### Intent of the named animation families

The concrete families in M6.4 are experiment vehicles:

```text
Spin   -> additive rotation
Move   -> additive translation
Scale  -> multiplicative transform scale
Fade   -> multiplicative opacity
Blink  -> discrete visibility
```

Their purpose is to exercise the Visual Runtime over representative state channels, then extract a generic foundation from working behavior.

The intended longer-term layering is:

```text
private Layer visual properties / operations
        ↓
generic Visual Runtime primitives
        ↓
component-private Rules / Behavior / Script
        ↓
public Properties / Actions / Events
        ↓
SCADA Workbench data binding / behavior
```

A component may therefore use low-level visual functions internally while exposing domain-oriented capabilities such as `running`, `opening`, `start`, `stop` or `fault` externally.

Do not treat `spin`, `move`, `scale`, `fade`, `blink` as a requirement for the final public runtime vocabulary.

### Accepted runtime boundary

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

Accepted:

- visual schema v3 with serialized `animations`
- v1/v2 -> v3 migration
- stable animation and Layer references
- deterministic duration/delay/iterations/direction/easing
- declarative `always` / typed Property activation
- pure explicit-time evaluator
- additive rotation composition
- Visual Rules before animation overlays
- Preview-owned `requestAnimationFrame` clock
- static Design mode and immutable persisted base state

Verification:

- CI #496 ✅
- Pages Browser Smoke #40 ✅

### M6.4.2 Spin authoring UI — accepted · 2026-08-26

Accepted:

- dedicated selected-Layer `动画` Inspector
- add/remove/enable/disable Spin
- complete timing authoring
- typed Property-condition activation
- save/reopen persistence
- real deployed Inspector authoring smoke

Verification:

- implementation revision `ebcfe6b5cc0694e0d27f8c36e88acb96b061b78d`
- CI #507 ✅
- Pages Browser Smoke #51 ✅
- later documentation deployment #102 / Browser Smoke #53 ✅

### M6.4.3 Move animation family — accepted · 2026-08-26

Accepted:

- `move` with X/Y displacement per iteration
- additive translation overlay
- deterministic multiple-Move composition
- Rules resolve X/Y before Move
- generalized multi-family Animation Inspector
- real deployed Move authoring / persistence / activation smoke

Final verification:

- revision `acb97885cde07ddc6ee42bd2e4fe8ef7fb8338fd`
- CI #512 ✅
- Pages Deploy #105 ✅
- Pages Browser Smoke #56 ✅

### M6.4.4 Scale animation family — accepted · 2026-08-26

Accepted:

- `scale` with positive X/Y target multipliers
- multiplicative scale overlay composition
- deterministic multiple-Scale composition
- rule-resolved scale multiplied afterward
- mirrored negative base scale sign preserved
- Inspector Scale authoring and deployed smoke

Final verification:

- revision `7eafdf4d71565a0095d80704fabfe2265ff7fb01`
- CI #516 ✅
- Pages Deploy #109 ✅
- Pages Browser Smoke #60 ✅

### M6.4.5 Fade animation family — accepted · 2026-08-26

Accepted:

- `fade` with opacity target multiplier in `[0, 1]`
- multiplicative opacity overlay composition
- deterministic multiple-Fade composition
- Visual Rules resolve opacity before Fade
- base opacity remains immutable
- selected-Layer Fade authoring via the real Inspector
- dedicated Fade deterministic model checks wired into CI
- deployed Fade authoring / persistence / Property-gated Preview smoke

Final acceptance revision:

`a2687a1c0ce8c47cbf06903ddd9694082419993d`

Verification:

- CI #523 ✅
- Pages Deploy #116 ✅
- Pages Browser Smoke #67 ✅
- same #67 kept Spin / Move / Scale, Chromium / Firefox pointer and SCADA geometry regressions green

**Result: M6.4.5 accepted.**

### M6.4.6 Blink / stepped visibility experiment — NEXT

Goal:

> Prove deterministic discrete-state animation semantics rather than another continuous numeric interpolation channel.

Blink should target transient Layer visibility and should not be implemented as a smooth-opacity trick.

It must settle:

- explicit-time visible/hidden phase calculation
- delay and finite/infinite iteration behavior
- direction behavior for a discrete cycle
- deterministic composition when multiple visibility-affecting definitions target one Layer
- ordering relative to Visual Rule resolved `visible`
- Property-gated activation without persisted Layer mutation
- static Design vs clock-driven Preview
- real Inspector authoring and deployed smoke

Do not add arbitrary keyframes or a timeline editor.

### M6.4.7 Visual Runtime abstraction consolidation — after Blink

This is a required convergence slice, not optional cleanup.

After representative continuous and discrete channels have been proven, stop adding named effect kinds and evaluate the common foundation:

```text
visual targets / properties
absolute vs relative change semantics
numeric interpolation
multiplicative vs additive composition
step/discrete composition
timing lifecycle
stable IDs / control handles
Preview clock ownership
runtime immutability
```

The result should become the generic low-level visual capability layer used later by Component Rules, Behavior and Controlled Script Runtime.

`pulse` should not become a separate runtime primitive unless the consolidation proves a real semantic gap; Scale + `alternate` already covers its underlying runtime behavior.

## M6.5 Controlled Script Runtime — pending

Target API categories:

```text
Property API
Event / Action API
Visual API
Diagnostics
```

Scripts must not receive unrestricted DOM / React / Konva / browser-global access.

Visual Script APIs should operate on stable Visual Runtime model concepts produced by M6.4.7, not renderer nodes and not a growing collection of special-case effect functions.

## M6.6 User component registration / publication — pending

Prove that a Workbench-authored component package can be consumed by SCADA Workbench through the same generic repository/registry path as built-ins without component-specific editor code.

---

# 6. Immediate execution sequence

Current execution order from `main`:

```text
1. M6.3.4 / M6.3 acceptance                              done
2. M6.4 animation architecture boundary                   done
3. M6.4.1 Spin runtime                                    accepted
4. M6.4.2 Spin authoring                                  accepted
5. M6.4.3 Move                                            accepted
6. M6.4.4 Scale                                           accepted
7. M6.4.5 Fade                                            accepted
8. M6.4.6 Blink / stepped visibility experiment           NEXT
9. M6.4.7 Visual Runtime abstraction consolidation        next
10. M6.5 Controlled Script Runtime                        later
11. M6.6 publish user-created composite component         later
12. M7 packaging / adapters / production components       later
```

The **next implementation step is M6.4.6 Blink**:

> Add one focused discrete visibility experiment using the accepted Preview clock, activation and transient-overlay boundary. Prove deterministic timing, rule ordering, persistence and deployed authoring. Then stop adding named animation effects and perform M6.4.7 abstraction consolidation.

---

# 7. Near-term non-goals

The following should not distract the active M6.4 work:

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
- a separate Pulse runtime primitive
- production component marketplace/package distribution
- collaborative editing
- protocol-specific component APIs

These items are deferred, not rejected.
