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

Current gate:

> M6.3.4 feature implementation is complete. A deployed GitHub Pages Chromium smoke has passed; only a short pointer-specific/manual regression check remains before accepting the milestone.

The detailed acceptance record is [`docs/progress/m6.3.4-component-canvas-authoring.md`](docs/progress/m6.3.4-component-canvas-authoring.md).

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

## M6.3 Visual authoring foundation — active acceptance

```text
M6.3.0 Composite renderer foundation                  complete
M6.3.1 Direct component-canvas interaction            complete
M6.3.1.1 Hit testing + private design space           complete
M6.3.2 Typed visual styles                            complete
M6.3.3 Property-driven Visual Rules                   complete
M6.3.4 Component canvas authoring commands            acceptance pending
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

Automated deployed-site browser acceptance now runs after successful GitHub Pages deployment via:

- `.github/workflows/pages-smoke.yml`
- `scripts/pages-smoke.mjs`

The smoke passed on 2026-08-26 against the real Pages deployment and covers command enable rules, all alignment/distribution commands, Group → save → reload → Ungroup geometry preservation, Preview locking, snap-toggle state and browser runtime errors.

Remaining focused acceptance before M6.3.4 can be marked accepted:

1. visually confirm Canvas modifier-click and Layers panel share selection;
2. visually confirm dragging remains pointer-direct and only snaps when released;
3. quick SCADA Workbench Align/Distribute regression smoke after the shared geometry extraction.

Do not expand M6.3.4 with marquee, cross-parent grouping or resize/rotate snapping merely because the milestone is near completion.

## M6.4 Animation foundation — next after M6.3.4 acceptance

Provide reusable private visual animation primitives such as:

- rotate / spin
- blink
- fade
- pulse
- move
- scale

Animations remain component implementation details unless deliberately controlled through public Properties.

Before implementation, define the animation runtime boundary clearly enough that animations can be evaluated without exposing raw Konva/DOM objects to authored component logic.

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
1. M6.3.4 toolbar / snap ownership                    done
2. M6.3.4.1 Layer multi-selection                     done
3. M6.3.4.2 shared pure geometry command core         done
4. M6.3.4.3 Align / Distribute                        done
5. M6.3.4.4 safe Group / Ungroup                      done
6. GitHub Pages browser smoke infrastructure          done
7. Automated deployed-site M6.3.4 smoke               passed
8. Focused pointer + SCADA manual acceptance          ACTIVE
9. Mark M6.3.4 accepted                               next gate transition
10. M6.4 Animation foundation                         next implementation milestone
11. M6.5 Controlled Script Runtime                    later
12. M6.6 publish user-created composite component     later
13. M7 packaging / adapters / production components   later
```

The **next step is not another authoring feature**:

> Close the remaining focused M6.3.4 browser acceptance gate. If it passes, mark M6.3.4 accepted and begin M6.4 Animation foundation.

This ordering is deliberate: adding more canvas features before accepting the current interaction grammar would make later regressions harder to isolate.

---

# 7. Near-term non-goals

The following should not distract the current M6.3.4 acceptance or the initial M6.4 foundation:

- full vector illustration tooling
- arbitrary path editing
- rulers / manual guides
- cross-parent Group in the first grouping slice
- snapping during live drag
- resize/rotate snapping before movement authoring is accepted
- unrestricted component JavaScript execution
- production component marketplace/package distribution
- collaborative editing
- protocol-specific component APIs

These items are deferred, not rejected.
