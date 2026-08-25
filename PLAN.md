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

The old roadmap that still described M5 as the current focus is obsolete. Runtime v0.1 was accepted on 2026-08-09 and Component Workbench is now the active implementation phase.

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
- component design grid
- grid/object movement snapping
- drag-time alignment hints
- total snap toggle in the Canvas Toolbar

Current limitation:

```text
selection model = one selected visual layer
```

This blocks proper component-canvas Align / Distribute / Group commands and is the next structural problem to solve.

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

## M6.3 Visual authoring foundation — active

Completed slices:

```text
M6.3.0 Composite renderer foundation                  complete
M6.3.1 Direct component-canvas interaction            complete
M6.3.1.1 Hit testing + private design space           complete
M6.3.2 Typed visual styles                            complete
M6.3.3 Property-driven Visual Rules                   complete
M6.3.4 Component canvas authoring commands            active
```

### M6.3.4 Component canvas authoring commands

Goal:

> Bring the Component Workbench canvas to the same editing grammar as the SCADA canvas where the concepts are genuinely shared, without blindly copying scene-only features.

Already completed in this slice:

- component design grid
- one total snap toggle
- object + grid movement snapping
- drag-time guide hints without live positional snapping
- snap only at `dragend`
- Canvas Toolbar is owned by the Component Editor layout and rendered above the canvas
- Header remains limited to document-level actions and Design/Preview mode

Next required foundation:

### M6.3.4.1 Multi-selection model

Replace the single selected Layer identity as the primary canvas command model:

```text
selectedLayerId: string | null
        ↓
selectedLayerIds: readonly string[]
primaryLayerId: string | null
```

Requirements:

- normal click selects one Layer
- `Shift/Ctrl/Meta + click` toggles Layer membership
- Layer Tree must participate in the same selection state
- selecting Component Root clears Layer multi-selection
- right Inspector uses the primary Layer for single-object editing
- multi-selection must not change persisted z-order
- Preview keeps selection navigation but disables geometry mutations

A marquee selection can follow after command selection is stable; it is not required to unlock Align / Group.

### M6.3.4.2 Shared geometry command core

SCADA Workbench and Component Workbench must not keep separate alignment mathematics.

Extract renderer/model-independent geometry operations around simple bounds/transform inputs:

```text
alignLeft
alignCenterX
alignRight
alignTop
alignCenterY
alignBottom
distributeHorizontal
distributeVertical
```

Each workbench remains responsible for converting its own model to/from the shared geometry representation.

No shared helper should depend directly on `SceneNode`, `ComponentVisualLayer`, React or Konva.

### M6.3.4.3 Align / Distribute toolbar commands

Canvas Toolbar target:

```text
[Snap]
  │
  ├─ [Align Left] [Center X] [Right]
  ├─ [Align Top] [Center Y] [Bottom]
  └─ [Distribute H] [Distribute V]
```

Enable rules:

```text
1 selected Layer      Align disabled, Distribute disabled
2+ selected Layers    Align enabled
3+ selected Layers    Distribute enabled
```

Alignment acts on the selected Layer set only and must preserve hierarchy / z-order.

### M6.3.4.4 Group / Ungroup commands

Component Group is a private Visual Layer hierarchy operation, not a Scene group.

Enable rules:

```text
2+ compatible selected siblings    Group enabled
1 selected Group                   Ungroup enabled
```

Initial Group scope should be deliberately strict:

- selected Layers must share the same parent
- grouping must preserve world-space appearance
- child local transforms must be recalculated against the new Group
- sibling z-order must remain deterministic
- Visual Rule layer ids remain stable
- Ungroup must preserve appearance and child identities

Do not introduce cross-parent grouping until same-parent behavior is proven.

### M6.3.4.5 Acceptance gate

M6.3.4 is accepted when manual browser smoke confirms:

- snap button sits in the formal Canvas Toolbar above the canvas
- drag remains pointer-direct with snap only after release
- Layer Tree and canvas share one multi-selection model
- two selected Layers can align on all six axes
- three selected Layers can distribute horizontally/vertically
- compatible sibling Layers can Group
- one Group can Ungroup
- geometry appearance is preserved through Group/Ungroup
- save/reopen preserves the resulting hierarchy/transforms
- Preview does not permit geometry commands
- SCADA editor behavior is not regressed by shared geometry extraction

## M6.4 Animation foundation — next after M6.3.4

Provide reusable private visual animation primitives such as:

- rotate / spin
- blink
- fade
- pulse
- move
- scale

Animations remain component implementation details unless deliberately controlled through public Properties.

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
1. M6.3.4 toolbar/snap ownership                         done

2. M6.3.4.1 component Layer multi-selection
   - selection state model
   - modifier-click canvas selection
   - Layer Tree multi-selection
   - primary selection for Inspector

3. M6.3.4.2 shared pure geometry command core
   - extract alignment/distribution math
   - keep workbench adapters separate

4. M6.3.4.3 Align / Distribute commands
   - toolbar icons consistent with SCADA Workbench
   - strict enable/disable rules

5. M6.3.4.4 Group / Ungroup
   - same-parent selection first
   - preserve world-space appearance and ids

6. Manual M6.3.4 browser acceptance

7. M6.4 Animation foundation

8. M6.5 Controlled Script Runtime

9. M6.6 publish one user-created composite component into SCADA Workbench

10. M7 packaging / adapters / reusable production component set
```

The **next code slice** is therefore deliberately narrow:

> Introduce a real component-Layer multi-selection model shared by the Canvas and Layer Tree. Do not implement Align/Group by inventing ad-hoc temporary selection state inside the toolbar.

---

# 7. Near-term non-goals

The following should not distract M6.3.4:

- full vector illustration tooling
- arbitrary path editing
- rulers / manual guides
- cross-parent Group in the first grouping slice
- snapping during live drag
- resize/rotate snapping before movement authoring is accepted
- animation before basic canvas editing commands are stable
- unrestricted component JavaScript execution
- production component marketplace/package distribution
- collaborative editing
- protocol-specific component APIs

These items are deferred, not rejected.
