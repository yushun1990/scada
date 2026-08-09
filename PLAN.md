# SCADA Editor Lab Development Plan

## 1. Product direction

This repository is a browser-first, generic SCADA authoring and runtime experiment.

It is not a pump editor, a workflow editor, or a device-management platform. The editor foundation and generic component kernel are now sufficiently mature that the next priority is to make authored scenes **actually run** from runtime data while preserving a clean path toward a powerful Component Workbench.

The product model is intentionally split into two different workbenches:

```text
Workspace
├─ SCADA works
│   └─ SCADA Workbench
│       └─ simple business-oriented scene authoring
│           ├─ drag reusable components
│           ├─ position / resize / connect
│           ├─ configure exposed properties
│           ├─ bind runtime data
│           └─ preview / run
│
└─ Component Library
    └─ Component Workbench
        └─ advanced reusable-component development
            ├─ public contract
            ├─ visual composition
            ├─ rules / expressions
            ├─ animations
            ├─ scripts
            └─ preview / debugging
```

The guiding product rule is:

> Increasing Component Workbench power must not increase normal SCADA scene-authoring complexity.

Detailed component-system architecture is defined in [`docs/architecture/component-system.md`](docs/architecture/component-system.md). Detailed SCADA editor UI structure is defined in [`docs/product/editor-ui.md`](docs/product/editor-ui.md). Visual connection architecture remains in [`docs/architecture/visual-connections.md`](docs/architecture/visual-connections.md).

---

## 2. Architectural invariants

The following rules are now treated as project-level invariants rather than milestone-specific preferences.

### 2.1 Public contract vs private implementation

The reusable component public contract is:

```text
Properties + Actions + Events + Anchors
```

The SCADA Workbench consumes only that public contract.

Component implementation details are private by default, including:

```text
Visual Layers
SVG internal elements
Image/vector composition
Visual rules
Animations
Internal state
Scripts
Native renderer details
```

A scene author should not need to know that a pump contains `fan`, `alarm-light`, or `pump-body` layers. If a component developer wants a scene author to control alarm color, the component should expose a public property such as `alarmColor` and map it internally to the relevant visual layer.

### 2.2 Component creation method must not change component capability

A component may obtain its visual implementation from different sources:

```text
Native application renderer
Composite visual tree
SVG assets
Bitmap assets
Konva vector primitives
Text
Groups
```

These sources may be mixed and nested in one component.

The visual source does not determine whether the component may have properties, actions, events, anchors, rules, animation, or script behavior.

### 2.3 Component Workbench may be complex; SCADA Workbench should remain simple

The Component Workbench is intended for technically capable component developers. It may expose advanced authoring features.

The SCADA Workbench is intended for users who understand the process or business domain but do not need front-end or programming knowledge.

Therefore complexity belongs in component development, not in normal scene composition.

### 2.4 Visual implementation remains renderer-independent at the component contract boundary

Konva is the current renderer and provides rich shape, style, transform, filter, grouping, and animation capabilities.

User-authored component logic must not receive raw `Konva.Node` objects as its public programming contract.

Future script and visual APIs should follow:

```text
Component Script / Visual Rule
          ↓
Controlled Runtime API
          ↓
Visual Runtime Model
          ↓
Konva renderer
```

This preserves the option to evolve rendering without rewriting component packages.

### 2.5 Visual connections and runtime behavior remain separate

```text
SceneConnection
= visible pipe / wire / process line attached to visual anchors

Runtime Binding / Behavior
= property data, event, action, or condition semantics
```

Visual anchors are not runtime ports.

---

# 3. Current phase and milestone status

The revised milestone order is:

```text
M0 Application shell and workspace                         mostly complete
M1 Canvas, viewport, artboard, and scene editing          mostly complete
M2 Editing commands, history, hierarchy, and layers       usable / partial
M3 Generic visual connections                             usable / partial
M4 Generic component kernel and registry                  core complete

== current focus ==
M5 SCADA Runtime v0.1
   runtime values -> bindings -> preview -> live component rendering

then
M6 Component Workbench v1
   public contract + layered visual authoring + rules + animation + controlled script

then
M7 Runtime behavior, packaging, reusable components, and external adapters
```

Remaining M1-M3 enhancements are not discarded, but they are not allowed to block the runtime path unless a concrete Runtime or Component Workbench requirement depends on them.

M4 is considered complete at the **generic kernel** level. The full Component Workbench is no longer treated as a prerequisite for proving runtime behavior; it is promoted into its own major milestone after the first runnable SCADA loop.

---

# 4. Current implementation map

## 4.1 Application and editor shell

Implemented:

- Workspace home page with `SCADA 作品` and `组件库开发` modules.
- A SCADA work opens in a separate browser tab.
- Work-scoped scene persistence.
- Component-library list and component-editor skeleton.
- Desktop editor header, left dock, center canvas, and right inspector.

## 4.2 Canvas and editing

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

Still incomplete but not an immediate runtime blocker:

- full clipboard cut / paste workflow
- production layer tree and z-order editing
- rulers and custom guides
- richer scene backgrounds and project asset handling

## 4.3 Visual connections

Implemented or usable:

- scene-level `SceneConnection` entities
- registry-driven component visual anchors
- hover-to-show anchors
- connection create / select / delete
- straight and automatic orthogonal routes
- endpoint reconnect
- endpoints following move / resize / rotate

Deferred:

- free scene endpoints
- detach / reattach
- persistent manual waypoints
- Bezier paths
- advanced markers and flow effects

## 4.4 Generic component kernel

Implemented:

- serializable `ComponentDefinition`
- `ComponentRegistration`
- `ComponentRegistry`
- generic `ComponentSceneNode`
- registry-driven node creation
- registry-driven renderer resolution
- registry-driven default and minimum sizing
- registry-driven visual anchors
- registry-driven scene validation
- registry-driven editor component palette
- schema-driven component Property Inspector
- built-in `pump.submersible`
- second built-in `indicator.status` architecture acceptance component

The second component did not require concrete component branches in the scene model, Transformer, connection core, palette orchestration, or Inspector orchestration.

The current generic data path is therefore:

```text
ComponentDefinition
        ↓
ComponentRegistry
        ↓
ComponentSceneNode
        ↓
SceneNodeRenderer
        ↓
ComponentRenderer
```

and authoring properties already follow:

```text
ComponentDefinition.properties
        ↓
Generated Inspector
        ↓
SceneNode.props
        ↓
ComponentRenderer
```

---

# M4 Generic component kernel — status

## Goal

Make the editor core independent of concrete industrial component types.

**Status: core acceptance complete.**

## Completed slices

```text
M4.0 terminology and anchor/runtime boundary                 complete
M4.1 serializable ComponentDefinition                        complete
M4.2 ComponentRegistration + ComponentRegistry               complete
M4.3 generic ComponentSceneNode                              complete
M4.4 pump migration                                          complete
M4.5 registry-driven palette and node creation               complete
M4.6 registry-driven Transformer sizing                      complete
M4.7 second-component architecture acceptance                complete
M4.8 schema-generated Property Inspector                     complete
```

The generic component contract remains:

```ts
interface ComponentDefinition {
  type: string
  title: string
  category: string
  description: string

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

The current implementation intentionally does **not** yet attempt to deliver the complete target Component Package or Component Workbench described in `component-system.md`.

That larger authoring system is M6 and must not block the first runnable Runtime gate.

---

# M5 SCADA Runtime v0.1 — current focus

## Goal

Make a scene truly run for the first time.

The first hard runtime acceptance demo is:

```text
Designer
  ↓
add indicator.status
  ↓
bind its public state property to a Mock runtime value
  ↓
enter Preview
  ↓
Mock value changes
  ↓
Runtime Store
  ↓
Binding evaluation
  ↓
effective component props
  ↓
existing Component Renderer
  ↓
indicator visual state changes automatically
```

When this works without rewriting authored scene configuration on every runtime update, the project has crossed from a static scene editor into a runnable SCADA experiment.

## M5.1 Runtime value store

Introduce a runtime-only value store independent of persisted `SceneDocument` configuration and editor history.

Example values:

```text
mock.pump.running = true
mock.pump.state = "running"
mock.pump.speed = 1450
mock.tank.level = 72.4
mock.sensor.temperature = 28.6
```

Requirements:

- runtime updates must not create editor undo history
- runtime values must not overwrite authored defaults in `SceneNode.props`
- runtime store lifecycle belongs to Preview/Runtime, not Designer
- value identity should be stable enough to support later protocol adapters

## M5.2 Property binding model

A binding maps an external/runtime value into an exposed bindable component Property.

Example:

```text
mock.pump.state
      ↓
indicator.status.state
```

Initial binding model should be deliberately small and typed.

The first version does not need arbitrary script expressions.

Target effective-value resolution:

```text
ComponentDefinition.defaultValue
        ↓
SceneNode.props authored value
        ↓
Runtime binding override
        ↓
Effective Component Props
        ↓
Renderer
```

Runtime overrides must remain separate from persisted authoring state.

## M5.3 Preview runtime lifecycle

Preview becomes an actual runtime boundary rather than only a read-only canvas mode.

Entering Preview should:

- create/start the runtime context
- start mock data sources/generators
- evaluate bindings
- render effective runtime properties

Leaving Preview should:

- stop mock/runtime activity
- release runtime subscriptions/timers
- restore normal Designer rendering from authored configuration
- not rewrite scene geometry or authored property values

## M5.4 Mock data source and generators

Provide a minimal deterministic test source before MQTT or WebSocket exists.

Initial useful generators:

```text
manual value
toggle
sequence / state cycle
ramp
sine wave
```

Random values may be added later, but deterministic generators are preferred first because runtime behavior is easier to reproduce and test.

## M5.5 Minimal runtime binding UI

The SCADA Workbench should expose binding configuration only for public `bindable` properties.

The user experience should remain simple:

```text
状态
[ 数据绑定: mock.pump.state ▼ ]
```

The scene author should not be exposed to Visual Layers, expressions, scripts, or internal component state.

## M5 runnable acceptance gate

M5 reaches its first mandatory gate when all of the following hold:

- a component Property can be bound to a Mock runtime value
- Preview starts runtime evaluation
- runtime data changes update the visible component automatically
- Designer authored props remain unchanged
- returning from Preview stops runtime activity
- runtime updates do not pollute undo/redo history
- the binding path is generic and does not branch on `indicator.status` or `pump.submersible`

This gate must be reached before broadening Component Workbench implementation.

## M5.6 Action and Event runtime kernel

After the property-binding runnable gate, establish the runtime contract for Actions and Events.

The public interface remains serializable:

```text
ActionDefinition
EventDefinition
```

Action declaration and action implementation remain separate concepts.

The runtime should eventually support:

```text
invokeAction(nodeId, actionName, input?)
emitEvent(nodeId, eventName, payload?)
```

The first implementation may use built-in/native test handlers. It must not require the complete user Script Runtime yet.

## M5.7 Minimal behavior flow

Once Action/Event invocation exists, prove one explicit runtime flow:

```text
component event
    ↓
optional simple condition
    ↓
action invocation OR property assignment
```

Examples:

```text
button.clicked -> pump.start
pump.alarmRaised -> indicator.state = "alarm"
```

Behavior semantics remain separate from visual `SceneConnection` entities.

---

# M6 Component Workbench v1

## Goal

Turn the current component-editor skeleton into a visual-first component development environment that can encapsulate advanced behavior while keeping SCADA scene usage simple.

The Component Workbench is allowed to be technically powerful. Its purpose is to move complexity out of the SCADA Workbench.

## M6.1 Component Package model

Evolve reusable user components toward the target package structure:

```text
ComponentPackage
├─ metadata
├─ definition
│   ├─ properties
│   ├─ actions
│   ├─ events
│   └─ anchors
├─ assets
├─ visual
│   ├─ layer tree
│   ├─ rules
│   └─ animations
└─ behavior
    ├─ configured steps
    ├─ controlled scripts
    └─ trusted native implementation where applicable
```

The package format should remain versionable and diagnosable.

## M6.2 Public contract authoring

The Component Workbench must allow component developers to define:

- metadata
- default and minimum size
- public configurable Properties
- public bindable Properties
- internal/private component state when needed
- Actions and their parameters
- Events and their payload schemas
- visual Anchors

Internal visual layers must not automatically become public scene-editable properties.

## M6.3 Layered visual composition

A component may contain a heterogeneous visual tree.

Target layer kinds:

```text
Group
SVG
Image / bitmap
Vector primitive
Text
```

SVG, bitmap assets, system/Konva vector primitives, text, and groups may be mixed in the same component.

Required authoring capabilities:

- add/import assets
- layer ordering
- grouping and nesting
- local position
- size / scale
- rotation
- opacity
- visibility
- layer naming / identity

Single SVG and single-image components are simply one-layer cases of this model.

## M6.4 Visual style and renderer capabilities

Do not introduce browser CSS as a component runtime requirement.

Expose useful renderer-independent style metadata mapped to Konva capabilities, such as:

```text
fill
stroke
stroke width
opacity
shadow
gradient
filter where supported
transform
visibility
text styling
```

Style support may vary by layer kind and must be described through typed layer capabilities rather than one unlimited style object.

## M6.5 Visual Rules / Expressions

Most data-driven visual behavior should not require code.

Examples:

```text
alarm-light.visible <- props.alarm
fan.rotationSpeed <- props.speed
label.text <- props.label
body.opacity <- props.running ? 1 : 0.5
```

Rules operate on private visual-layer properties and public/internal component state.

They are authored inside the Component Workbench and remain invisible to normal SCADA scene authors.

## M6.6 Animation

Provide component-internal animation primitives for common SCADA visual effects, for example:

- rotate / spin
- fade in / fade out
- blink
- pulse
- move
- scale

Runtime-data-driven animation should be able to depend on component properties such as speed or level.

Animation is part of component implementation, not SCADA Workbench scene configuration unless the component developer deliberately exposes a public property controlling it.

## M6.7 Controlled Component Script

Advanced component developers need an optional code path for behavior that cannot be conveniently expressed through configuration or rules.

The script environment is intentionally controlled.

Target API categories:

```text
Property API
- getProperty
- setProperty

Event / Action API
- emit
- invoke

Visual API
- visible
- style
- transform
- startAnimation
- stopAnimation

Diagnostics
- log
```

The public script contract must not expose raw React, DOM, or Konva objects.

The script environment must not assume unrestricted access to:

```text
window
document
eval
arbitrary imports
arbitrary network clients
```

The exact sandbox technology is a separate implementation decision. Do not fake sandboxing by executing saved component source with unrestricted `eval`/`Function` in the main application context.

## M6.8 Component preview and debugging

The Component Workbench should provide a focused component-runtime preview with:

- editable test property values
- test Action invocation
- emitted Event inspection
- mock runtime values
- layer inspection
- rule/script diagnostics
- animation start/stop feedback

This environment is the primary place where complex component implementation is tested.

## M6 acceptance gate

A user-created component should be able to:

- combine at least SVG + bitmap/vector/text layers
- declare public bindable Properties
- keep internal visual layers private
- use a Visual Rule to drive a layer from a Property
- define at least one Action and one Event
- use a controlled script for one behavior not expressible by a simple rule
- be added to the SCADA Workbench through the same generic component registry/repository path as built-in components
- require no component-specific changes in the SCADA editor core

---

# M7 Runtime behavior, reusable components, packaging, and external adapters

## M7.1 Reusable SCADA component set

Build representative components only after the runtime and Component Workbench contracts are stable enough to exercise them rather than define architecture through special cases.

Candidate set:

```text
indicator / status lamp
numeric display
text / image display
button / command control
valve
pump
tank / level display
motor / fan
```

## M7.2 Rich behavior authoring

Extend runtime behavior beyond the minimal M5 flow where justified:

- typed Action inputs/outputs
- Event payloads
- reusable conditions
- property assignments
- component-to-component behavior links
- diagnostics for invalid or missing targets

Avoid turning the SCADA Workbench into a general-purpose node programming environment.

## M7.3 Packaging and versioning

Production component authoring requires:

- package import/export
- stable component type identity
- component versions
- migration policy
- asset integrity diagnostics
- missing component diagnostics
- broken binding/action/event diagnostics

## M7.4 External data adapters

Only after the mock runtime contract is stable should external protocols be introduced.

Candidate adapters:

```text
MQTT
WebSocket
HTTP
SSE
platform-specific adapters
```

Protocol adapters feed the runtime value/binding layer. They do not become component-specific APIs.

## M7.5 Production scene authoring

Remaining editor capabilities can be completed according to demonstrated need:

- full layers/z-order workflow
- complete clipboard workflow
- project asset library
- reusable templates and symbols
- multi-scene project structure
- large-scene profiling and performance budgets
- advanced visual connection routing and flow effects

---

# 5. Immediate execution sequence

The implementation order from the current `main` branch is now:

```text
1. RuntimeValueStore
   - runtime-only values
   - no SceneDocument mutation
   - no undo history pollution

2. DataBinding + effective component props
   - bind only public bindable properties
   - authored props remain fallback values

3. Preview runtime lifecycle + MockDataSource
   - Preview starts/stops runtime
   - deterministic state/toggle generator

   ===== SCADA Runtime v0.1 runnable gate =====

4. Minimal binding UI in SCADA Workbench
   - select mock value for an exposed property
   - keep normal scene authoring simple

5. ActionDefinition/EventDefinition runtime invocation kernel
   - declaration separated from implementation
   - built-in/native test handlers are acceptable initially

6. Minimal event -> action/property behavior flow

7. Begin Component Workbench v1
   - public contract editor
   - private/public property distinction
   - anchor editing

8. Add heterogeneous Layer Tree
   - Group / SVG / Image / Vector / Text

9. Add Visual Rules + basic animations

10. Add Controlled Component Script + Visual API

11. Prove a user-created composite component in the SCADA Workbench

12. Only then broaden reusable components and evaluate MQTT/WebSocket adapters
```

## Next implementation slice

The next code change should be deliberately narrow:

> Introduce a runtime-only `RuntimeValueStore` and define its lifecycle boundary without yet introducing MQTT, expressions, Actions, Events, or Component Workbench scripts.

The following slice should connect one generic `DataBinding` to effective component props and use `indicator.status.state` only as an acceptance fixture, not as a special-case implementation.

The next hard product gate is therefore not another editor feature. It is:

> **Drag a status indicator into a scene, bind its state to Mock data, enter Preview, and watch the component change automatically as runtime data changes.**

---

# 6. Explicit near-term non-goals

The following items must not block the SCADA Runtime v0.1 gate:

- MQTT/WebSocket/device protocol integration.
- Full Component Workbench Layer Tree implementation.
- Full controlled-script sandbox implementation.
- Arbitrary expressions in SCADA scene bindings.
- General-purpose workflow/node-editor UI.
- Production component marketplace/package distribution.
- Backend persistence.
- Collaborative editing.
- Full vector illustration tooling unrelated to reusable SCADA component composition.
- Completing every remaining visual-connection feature.

These are deferred, not rejected. The architecture must leave room for them without requiring them before the first runnable scene.
