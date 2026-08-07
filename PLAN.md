# SCADA Editor Lab Development Plan

## 1. Product direction

This repository is a browser-first, generic SCADA authoring and runtime experiment.

It is not a pump editor, a workflow editor, or a device-management platform. The canvas foundation is now sufficiently mature that the main development focus moves from editor-chrome polishing to a generic component system.

The product model is:

```text
Workspace
  ├─ SCADA works
  │    └─ each work opens in its own editor tab
  │         └─ fixed-size scene artboard
  │              ├─ components
  │              ├─ groups
  │              └─ visual connections
  │
  └─ Component Library
       └─ create / edit / preview reusable components
```

The editor workspace owns viewport pan and zoom. The scene artboard owns final width, height, background, persisted component geometry, visual connections, and runtime presentation.

## 2. Current phase and revised implementation order

The project has crossed the point where more canvas polish provides the highest return. The next architectural risk is that the editor core still knows about the concrete `pump.submersible` component.

The revised implementation order is:

```text
M0 Application shell and workspace                         mostly complete
M1 Canvas, viewport, artboard, and scene editing          mostly complete
M2 Editing commands, history, hierarchy, and layers       usable / partial
M3 Generic visual connections                             usable / partial

== current focus ==
M4 Generic component kernel, registry, and Component Lab
  -> M5 Mock runtime values, bindings, events, and actions
  -> M6 Runtime preview and reusable SCADA components
  -> M7 Production authoring, packaging, and protocol adapters
```

Remaining M1-M3 enhancements are not discarded, but they are no longer allowed to block M4 unless they are required by the component architecture.

Detailed UI structure is defined in [`docs/product/editor-ui.md`](docs/product/editor-ui.md). Visual connection architecture remains in [`docs/architecture/visual-connections.md`](docs/architecture/visual-connections.md).

## 3. Current implementation map

### Application and editor shell

Implemented:

- Workspace home page with `SCADA 作品` and `组件库开发` modules.
- A SCADA work opens in a separate browser tab.
- Work-scoped scene persistence.
- Component-library list and component-editor skeleton.
- Desktop editor header, left dock, center canvas, right inspector, and bottom status bar.

### Canvas and editing

Implemented or usable:

- fixed-size scene presets
- infinite viewport around a fixed artboard
- viewport zoom, fit, reset, wheel / trackpad pan
- `Space + drag` and middle-mouse pan
- grid display and snapping
- single and multi-selection
- marquee selection
- move, resize, rotate
- alignment guides
- align and distribute
- persistent grouping and ungrouping
- lock and visibility
- undo and redo
- duplication
- local save, import, and export

Still incomplete but not an immediate blocker:

- full clipboard cut / paste workflow
- production layer tree and z-order editing
- rulers and custom guides
- richer scene backgrounds and asset handling

### Visual connections

Implemented or usable:

- scene-level `SceneConnection` entities
- component-attached visual connection points
- hover-to-show connection points
- connection create / select / delete
- straight and automatic orthogonal routes
- endpoint reconnect
- endpoints following move / resize / rotate

Deferred until after the component kernel stabilizes:

- free scene endpoints
- detach / reattach
- persistent manual waypoints
- Bezier paths
- advanced markers and flow effects

---

# M4 Generic component kernel, registry, and Component Lab

## Goal

Make the editor core independent of concrete industrial component types.

After M4, adding a second component such as an indicator, valve, tank, or numeric display must not require adding `isValveNode`, `isTankNode`, or similar branches to the scene model or renderer orchestration.

## M4.0 Terminology and boundary rules

The project must distinguish editor geometry from runtime semantics.

### Anchor

An **anchor** is a visual attachment point on a component used by scene-level visual connections.

Examples:

- a pipe attaches to the left side of a pump
- an electrical line attaches to a motor symbol
- a process annotation line attaches to an instrument

Anchors belong to **authoring geometry**. Moving or resizing a component moves its anchors.

The current implementation has historically used `port` naming for some of these visual points. During M4 this naming should converge toward `anchor` so runtime concepts are not confused with canvas geometry.

### Property

A **property** is component state that can be configured or bound to runtime data.

Examples:

```text
running: boolean
value: number
label: string
alarm: boolean
fill: color
```

### Action

An **action** is an operation that can be invoked on a component.

Examples:

```text
start()
stop()
resetAlarm()
open()
close()
```

### Event

An **event** is an occurrence emitted by a component/runtime instance.

Examples:

```text
clicked
alarmRaised
stateChanged
openCompleted
```

### Runtime port

A **runtime port**, if introduced later, is a typed semantic I/O endpoint for graph-style runtime wiring. It is **not** a visual connection anchor.

Runtime ports are not required for component-system v1. Property bindings plus events and actions are sufficient for the first runtime slice.

Therefore the v1 component contract deliberately uses:

```text
properties + actions + events + anchors
```

and does not require runtime `ports`.

## M4.1 Serializable component definition

The persisted component definition must describe component identity and authoring/runtime metadata without embedding live renderer objects.

Target shape:

```ts
interface ComponentDefinition {
  type: string
  title: string
  category: string
  description?: string

  size: {
    defaultWidth: number
    defaultHeight: number
    minWidth: number
    minHeight: number
  }

  properties: Record<string, PropertyDefinition>
  actions: Record<string, ActionDefinition>
  events: Record<string, EventDefinition>
  anchors: VisualAnchorDefinition[]
}
```

Rules:

- `type` is the stable identity, for example `pump.submersible`.
- Default and minimum geometry belongs to the definition, not `PumpNode.tsx` or Transformer special cases.
- Anchors are declared by the component definition or renderer contract.
- Property metadata is sufficient to generate the Inspector.
- The definition is serializable and can be stored, versioned, inspected, or packaged.

## M4.2 Runtime registration boundary

Rendering is application/runtime behavior and should not be serialized into `SceneDocument`.

Target shape:

```ts
interface ComponentRegistration {
  definition: ComponentDefinition
  renderer: ComponentRenderer
}

interface ComponentRegistry {
  register(registration: ComponentRegistration): void
  get(type: string): ComponentRegistration | undefined
  list(): ComponentRegistration[]
}
```

For v1:

- built-in renderers are statically registered by the application
- the registry is the only place the editor uses to resolve a component type
- arbitrary user JavaScript execution is not required
- dynamic/sandboxed component code can be designed later without changing the scene contract

## M4.3 Generic scene component node

Remove concrete pump knowledge from the scene model.

Target shape:

```ts
interface ComponentSceneNode {
  id: string
  type: string
  name: string
  parentId: string | null
  visible: boolean
  locked: boolean
  transform: NodeTransform
  props: Record<string, unknown>
  bindings: DataBinding[]
  behaviors: Behavior[]
}
```

`GroupSceneNode` may remain a structural editor node because grouping is an authoring primitive rather than a domain component.

Required migration:

- replace `PumpSceneNode` with generic `ComponentSceneNode`
- remove pump-specific creation logic from the scene core
- remove `PUMP_MIN_WIDTH` / pump sizing knowledge from Transformer orchestration
- resolve minimum/default size through `ComponentRegistry`
- resolve renderer through `ComponentRegistry`
- preserve existing saved pump scenes through scene migration/validation

## M4.4 Migrate the existing pump as the first registered component

The existing pump is the proof component for the new architecture.

Its registration should own:

```text
type          pump.submersible
category      设备
default size  96 × 135
minimum size  component-defined
properties    initial visual/runtime properties
anchors       visual pipe/wire attachment points
renderer      existing pump renderer adapted to the generic contract
```

Acceptance:

- the pump renders and edits exactly as before
- scene core does not branch on pump type
- Transformer does not import pump-specific minimum-size constants
- visual connection code resolves anchors generically

## M4.5 Component library -> editor palette integration

The Workspace Component Library and the editor left dock must read from the same component definition source.

Scope:

- component list comes from the registry/definition repository
- searchable categories
- add or drag a registered component into the scene
- generic node factory uses definition default size and default properties
- no component-specific `addPump()` editor command

Acceptance:

- registering a component makes it available to the editor palette without editing `ScadaEditorPage` component-specific branches

## M4.6 Generated Inspector

Generate component-specific property controls from `PropertyDefinition` metadata.

Initial property kinds:

```text
boolean
number
string
select
color
```

The Inspector keeps generic editor properties separate from component properties:

```text
Base
- name
- x / y
- width / height
- rotation
- visible
- locked

Component
- generated from ComponentDefinition.properties
```

Actions and events can initially be inspection/test surfaces rather than a full behavior editor.

## M4.7 Component Lab v1

The Component Library development page becomes a real Component Lab rather than only metadata storage.

Scope:

- edit component metadata
- edit default/minimum size
- define properties
- define visual anchors
- preview the component at multiple sizes
- inspect action/event declarations
- validate type uniqueness and schema

Renderer authoring strategy is intentionally staged:

1. built-in/static application renderers first
2. prove the component contract and registry
3. only then decide a safe user-authored renderer mechanism

Do not make arbitrary JavaScript execution a prerequisite for the component kernel.

## M4 acceptance gate

M4 is complete only when a **second simple component** (recommended: indicator/status lamp) can be added with no changes to:

- `SceneDocument` component union types
- Transformer sizing logic
- connection orchestration
- generic scene-node creation
- Inspector orchestration

Adding the new component should primarily consist of a new definition + renderer registration.

---

# M5 Mock runtime values, bindings, events, and actions

## Goal

Prove the SCADA runtime model without introducing MQTT or backend infrastructure.

## M5.1 Runtime value store

Provide a small mock variable store independent of persisted scene configuration.

Examples:

```text
pump.1.running = true
tank.1.level = 72.4
sensor.1.temperature = 28.6
```

Runtime values are not written into scene history for every update.

## M5.2 Property bindings

A binding maps a runtime value into a component property.

Example:

```text
sensor.1.temperature
        ↓
NumericDisplay.props.value
```

Initial binding support should prefer simple typed mapping over arbitrary expressions.

## M5.3 Events and actions

Support a small explicit behavior model:

```text
component event
    -> optional condition
    -> action or property assignment
```

Examples:

```text
button.clicked -> pump.start
level > 90 -> indicator.props.alarm = true
pump.alarmRaised -> alarmLamp.props.active = true
```

Behavior links are runtime semantics and remain independent from visual scene connections.

## M5.4 Mock data generators

Provide deterministic and interactive generators such as:

- toggle
- random range
- sine wave
- ramp
- manual value control

This makes runtime behavior testable before external protocols exist.

---

# M6 Runtime preview and reusable SCADA components

## Scope

- explicit Designer vs Runtime/Preview boundary
- runtime instance state separated from scene configuration
- component lifecycle hooks if proven necessary
- indicator/status lamp
- numeric display
- text/image primitives
- valve
- tank / level display
- additional pump presentation states
- reusable symbols/instances after the component contract proves stable

Acceptance:

- opening Preview starts runtime values and behavior evaluation
- returning to Designer stops runtime execution without rewriting authored geometry
- several component types consume the same binding/runtime infrastructure

---

# M7 Production authoring, packaging, and protocol adapters

## Production authoring

- full layers/z-order workflow
- complete clipboard workflow
- project asset library
- reusable templates and symbols
- multi-scene project structure
- diagnostics for broken assets, component types, anchors, bindings, and behaviors
- package import/export
- component versioning and migration
- large-scene profiling and performance budgets

## External data adapters

Only after the mock runtime contract is stable should external protocols be introduced.

Candidate adapters:

```text
MQTT
WebSocket
HTTP
SSE
platform-specific adapters
```

Protocol adapters feed the runtime value/binding layer; they do not become component APIs.

---

# 4. Immediate execution sequence

The next implementation order is now:

```text
1. M4.0/M4.1 terminology + ComponentDefinition v1
   - anchors vs runtime semantics
   - size/default/min metadata
   - property/action/event contracts

2. M4.2 ComponentRegistry
   - serializable definition separated from renderer registration

3. M4.3/M4.4 generic ComponentSceneNode + pump migration
   - remove PumpSceneNode from scene core
   - remove pump-specific size logic from Transformer
   - preserve existing scenes

4. M4.5 connect Component Library to editor palette
   - generic create-component command
   - registry-driven component list

5. M4.6 schema-generated Inspector

6. M4.7 Component Lab preview and anchor/property editing

7. Add a second component (indicator) as the M4 architecture acceptance test

8. Begin M5 with MockValueStore + property binding

9. Add event -> action/property behavior slice

10. Only after that evaluate MQTT/WebSocket adapters
```

## First implementation slice

The very next code change should be deliberately narrow:

> Introduce `ComponentDefinition`, `ComponentRegistration`, and `ComponentRegistry`; migrate the existing pump registration metadata (including default/minimum size and visual anchors) without changing its visible behavior.

The following slice then migrates `PumpSceneNode` to generic `ComponentSceneNode`.

This two-step approach keeps the refactor reviewable and avoids combining a new registry, scene migration, renderer migration, and UI changes in one high-risk change.

---

# 5. Explicit non-goals for the current M4 phase

- Backend persistence.
- MQTT, WebSocket, or device protocol integration.
- Collaborative editing.
- Arbitrary JavaScript execution from component definitions.
- General-purpose workflow execution.
- A node-editor style runtime graph UI.
- Full vector illustration features unrelated to SCADA composition.
- Network-facing WoT Thing Description support.
- Finishing every remaining visual-connection feature before component-system work begins.
