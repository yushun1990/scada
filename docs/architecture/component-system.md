# Component System and Component Workbench Architecture

## 1. Purpose

This document defines the long-term component boundary for SCADA Editor Lab.

The central product rule is:

> **The Component Workbench owns and encapsulates complexity. The SCADA Workbench consumes only the component's public contract.**

A component may be visually simple or internally sophisticated. It may be implemented from SVG assets, raster images, vector primitives, text, nested groups, scripts, or trusted native code. None of those implementation details should leak into normal SCADA scene authoring.

The current `ComponentDefinition` / `ComponentRegistration` / `ComponentRegistry` implementation is the first subset of this model. This document describes the target architecture that later Component Workbench and runtime milestones must converge toward.

---

## 2. Two workbenches, two user models

The product intentionally serves two different kinds of users.

### 2.1 Component Workbench

The Component Workbench is for component developers. These users may be technically capable and are allowed to use advanced authoring tools.

Its job is to **create complexity and then hide it behind a stable component contract**.

Expected capabilities include:

- import SVG assets;
- import raster assets such as PNG, JPEG, and WebP;
- create vector primitives;
- add text and nested groups;
- compose heterogeneous visual layers;
- define public and internal properties;
- define actions and events;
- define visual anchors;
- configure styles and transforms;
- define expressions and visual rules;
- configure animations;
- write controlled component scripts;
- preview and debug component behavior;
- package and version reusable components.

The Component Workbench is therefore closer to a small **SCADA component IDE** than to a simple metadata form.

### 2.2 SCADA Workbench

The SCADA Workbench is for scene authors and business users.

Its job is to **remove complexity**.

A scene author should normally only need to:

- drag a component into the scene;
- position, resize, rotate, group, show, hide, or lock it;
- configure the component's deliberately exposed properties;
- bind exposed bindable properties to runtime data;
- configure exposed actions and events when needed;
- connect visual anchors;
- preview or run the scene.

The scene author must not need to understand the component's internal layers, SVG structure, animation implementation, script source, renderer implementation, or Konva details.

This complexity asymmetry is deliberate:

```text
Component Workbench  -> powerful / technical / implementation-facing
SCADA Workbench      -> simple / business-facing / contract-only
```

---

## 3. Public contract vs private implementation

Every component has two architectural sides.

```text
Component
├── Public Contract
│   ├── Properties
│   ├── Actions
│   ├── Events
│   └── Anchors
│
└── Private Implementation
    ├── Assets
    ├── Visual Layer Tree
    ├── Internal properties/state
    ├── Styles
    ├── Visual rules / expressions
    ├── Animations
    ├── Controlled scripts
    └── Native implementation when trusted
```

The SCADA Workbench consumes only the public contract.

The private implementation is authored and tested in the Component Workbench and remains encapsulated afterward.

### 3.1 Private visual layers by default

Visual elements such as:

```text
pump-body
fan
run-light
alarm-light
label-text
```

are implementation details by default.

A SCADA scene author must not directly edit `alarm-light.fill`, `fan.rotation`, or an SVG child path unless the component developer deliberately exposes a public property for that purpose.

For example, if a component developer wants the alarm color to be configurable, the correct design is:

```text
public property: alarmColor
        ↓
private visual rule
        ↓
alarm-light.fill
```

rather than exposing `alarm-light` itself to the SCADA Workbench.

---

## 4. Component instance base properties

All scene component instances already have editor-owned properties that are independent from the component's semantic definition.

Conceptually:

```ts
interface ComponentSceneNode {
  id: string
  type: string
  name: string
  parentId: string | null

  transform: {
    x: number
    y: number
    width: number
    height: number
    rotation: number
  }

  visible: boolean
  locked: boolean

  props: ComponentProps
  bindings: DataBinding[]
  behaviors: Behavior[]
}
```

The following are editor/base properties and must not be re-declared by every component definition:

```text
id
type
name
parentId
x / y
width / height
rotation
visible
locked
```

Component-specific semantic values belong in `props`.

Examples:

```text
state
speed
level
temperature
alarm
label
precision
```

---

## 5. Component public definition

The current serializable definition remains the public component schema.

Conceptually:

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

The definition must remain serializable. It must not contain live React components, Konva nodes, JavaScript closures, browser objects, or native action handlers.

The definition answers:

> What can this component expose and what is its stable reusable contract?

It does not answer:

> How is the implementation executed?

---

## 6. Properties: public configuration, bindings, and internal state

A component developer may define arbitrary semantic properties appropriate to that component.

For example, a pump might expose:

```text
state
speed
alarm
label
alarmColor
```

while internally using values such as:

```text
fanAngle
alarmBlinkPhase
pressed
hovered
```

Those internal values do not need to exist in the public contract.

### 6.1 Property visibility

The property model should evolve to distinguish whether a value is exposed to the SCADA Workbench.

Target direction:

```ts
interface PropertyDefinition {
  title: string
  kind: PropertyKind
  defaultValue: ComponentScalarValue

  exposed?: boolean
  configurable?: boolean
  bindable?: boolean

  description?: string
  options?: readonly PropertyOption[]
}
```

Exact field names may change during implementation, but the semantic distinction is normative:

- **public configurable property**: visible to a scene author as component configuration;
- **public bindable property**: may receive a runtime value from a data binding;
- **internal state**: available only to the component implementation.

### 6.2 Runtime value resolution

A later runtime should conceptually resolve values in this order:

```text
ComponentDefinition default
          ↓
Scene-authored property value
          ↓
Runtime binding / runtime override
          ↓
Component implementation
          ↓
Renderer
```

Runtime updates must not continuously rewrite authored scene configuration or flood the editor history stack.

---

## 7. Actions: declaration vs implementation

An action is part of the public contract.

Examples:

```text
start()
stop()
resetAlarm()
setSpeed(speed)
```

An `ActionDefinition` describes the callable interface and remains serializable.

Conceptually:

```ts
interface ActionDefinition {
  title: string
  description?: string
  parameters?: Record<string, ActionParameterDefinition>
  output?: ValueSchema
}
```

The action implementation is separate.

This distinction allows the same action contract to be implemented in several ways without changing how the SCADA Workbench sees the component.

### 7.1 Supported implementation classes

The target component system should support three implementation levels:

```text
Configuration / steps
Controlled script
Trusted native handler
```

#### Configuration / steps

Suitable for common behavior without code:

```text
start
  -> set property state = running
  -> emit started
```

#### Controlled script

Suitable for more complex component-local logic authored in the Component Workbench.

Example authoring experience:

```js
if (props.disabled) {
  return
}

setProperty('state', 'running')
emit('started')
```

The exact scripting language and sandbox are implementation decisions, but scripts must execute against a deliberately small runtime API.

#### Trusted native handler

Built-in or trusted plugin components may provide application-linked implementations.

Conceptually:

```ts
interface ComponentRegistration {
  definition: ComponentDefinition
  renderer: ComponentRenderer
  createDefaultProps(): ComponentProps
  nativeActions?: Record<string, ComponentActionHandler>
}
```

Native functions belong to runtime registration, never to the serialized definition.

### 7.2 Same contract regardless of implementation

A scene author should not need to know whether `pump.start` is implemented with configuration, script, or native code.

From the SCADA Workbench, it is always simply:

```text
Pump
Actions
- Start
- Stop
- Reset alarm
```

---

## 8. Events

Events represent occurrences emitted by a component.

Examples:

```text
clicked
started
stopped
alarmRaised
stateChanged
```

Events are also public contract elements. The internal implementation decides when to emit them.

Later behavior infrastructure can connect events to actions or property assignments without exposing component internals.

```text
button.clicked
      ↓
pump.start
```

or:

```text
pump.alarmRaised
      ↓
alarm-banner.show
```

Pointer/editor events and semantic component events must remain separate APIs.

---

## 9. Anchors remain visual geometry

Anchors are visual attachment points for scene connections.

They are not runtime data ports.

```text
Property -> runtime data/value
Action   -> runtime operation
Event    -> runtime occurrence
Anchor   -> visual scene connection geometry
```

A future typed runtime-port concept, if ever introduced, must remain distinct from anchors.

---

## 10. One component model, multiple visual sources

The component system must not create separate capability models for "SVG components", "image components", or "code components".

A component has one public contract regardless of how its visual implementation is produced.

The visual layer may mix:

- SVG assets;
- raster images such as PNG/JPEG/WebP;
- system-created vector primitives;
- text;
- nested groups;
- trusted native renderer output when necessary.

SVG and raster assets may be freely combined with vector primitives and text inside one component.

A single SVG or a single image is therefore only a special case of a composite visual component.

---

## 11. Visual Layer Tree

User-authored composite components should use a stable visual tree.

Conceptually:

```text
Component Visual Root
├── Group
│   ├── SVG
│   └── Vector
├── SVG
├── Image
├── Vector
├── Text
└── Group
    └── ...
```

Target layer families:

```ts
type VisualLayer =
  | GroupLayer
  | SvgLayer
  | ImageLayer
  | VectorLayer
  | TextLayer
```

Each layer owns a local transform relative to its parent.

Conceptually:

```ts
interface VisualLayerBase {
  id: string
  name: string
  parentId: string | null

  x: number
  y: number
  width: number
  height: number
  rotation: number
  scaleX: number
  scaleY: number

  visible: boolean
  opacity: number
}
```

This allows, for example, a pump body to contain a separately positioned fan that can rotate around its own local origin while the whole pump instance is moved or resized as one scene component.

### 11.1 Stable visual tree first

The preferred model is:

```text
Component Workbench
    -> builds stable visual layers

Runtime
    -> changes properties, layer state, styles, transforms, and animations
```

Runtime layer creation/removal may be added as an advanced capability later, but ordinary component behavior should not require rebuilding the visual tree on every state change.

---

## 12. Visual styles and Konva capability

The project uses Konva as the current rendering and interaction implementation. Konva already supports the capabilities needed for rich SCADA visuals, including, depending on node type:

- fill and stroke;
- stroke width and dash patterns;
- opacity;
- shadows;
- gradients;
- transforms;
- clipping;
- filters;
- text styling;
- image rendering;
- tweens and frame-based animation;
- vector shapes and paths.

Therefore **browser CSS is not a required component styling contract**.

The component architecture should preserve useful Konva-class capabilities without exposing raw Konva objects to user code.

### 12.1 Renderer-independent Visual API

Controlled scripts may eventually receive a Visual API such as:

```js
visual.setVisible('alarm-light', true)

visual.style('alarm-light', {
  fill: '#ef4444',
  opacity: 0.9,
  shadowColor: '#ef4444',
  shadowBlur: 12
})

visual.transform('fan', {
  rotation: 45
})

visual.startAnimation('fan-spin')
visual.stopAnimation('fan-spin')
```

The exact API is not yet fixed. The architectural rule is:

> User-authored component code talks to a controlled visual abstraction, not directly to `Konva.Node`.

This protects component portability and preserves the option to change or supplement the renderer later.

---

## 13. Visual rules, expressions, animations, and scripts

Complex behavior belongs inside the component, but complexity does not imply that every component must be hand-coded.

The Component Workbench should provide progressively more powerful implementation mechanisms:

```text
Direct visual/property configuration
        ↓
Expression
        ↓
Visual / behavior rules
        ↓
Animation configuration
        ↓
Controlled script
        ↓
Trusted native implementation
```

### 13.1 Direct configuration

A component developer can configure layer geometry and appearance through property panels.

### 13.2 Expressions and rules

Most data-driven visual behavior should be expressible without imperative code.

Examples:

```text
alarm-light.visible <- props.alarm
fan.rotation        <- expression based on props.speed
label.text          <- props.label
water.scaleY        <- props.level / 100
```

The concrete expression syntax is a later design decision.

### 13.3 Animation configuration

Pure visual motion should be expressible as reusable animations, for example:

```text
fan-spin
alarm-blink
fade-in
pulse
flow
```

Properties or rules can start, stop, or parameterize those animations.

### 13.4 Controlled scripts

Scripts exist for behavior that is awkward to represent with declarative configuration.

Scripts should be able to use controlled component APIs such as, conceptually:

```text
props
getProperty(name)
setProperty(name, value)
emit(event, payload?)
invoke(target, action, input?)
visual.*
log(...)
```

The final API will be designed with the runtime.

Scripts must not automatically receive unrestricted access to:

```text
window
document
raw Konva nodes
arbitrary module imports
eval
unrestricted network clients
```

External protocols belong behind runtime/data-source abstractions rather than inside individual components.

---

## 14. Built-in/native components follow the same public contract

Built-in components may be authored directly in React/Konva by application developers when that is the best implementation technique.

They may use advanced native rendering and runtime code internally.

However, the SCADA Workbench still sees only the same public contract:

```text
Properties
Actions
Events
Anchors
```

A Component Workbench-authored pump and a native built-in pump should therefore be interchangeable from the scene author's point of view.

The implementation source must not become part of editor orchestration.

---

## 15. Component Package target model

The target reusable unit is a component package.

```text
Component Package
├── Metadata
├── Definition
│   ├── Properties
│   ├── Actions
│   ├── Events
│   ├── Anchors
│   └── Size
├── Assets
│   ├── SVG
│   ├── Raster images
│   └── other approved resources
├── Visual
│   ├── Layer Tree
│   ├── Styles
│   ├── Rules / Expressions
│   └── Animations
├── Behavior
│   ├── Configured steps
│   └── Controlled scripts
└── Native Registration (application/plugin side, when applicable)
```

Not every package needs every section.

Examples:

- a simple indicator may need one vector layer and one property;
- a pump may combine SVG + image/vector layers + animations + actions;
- a trusted chart component may use a native renderer while exposing the same public schema.

---

## 16. Pump example: encapsulation boundary

A reusable pump can expose:

```text
Public properties
- state
- speed
- alarm
- label

Public actions
- start
- stop
- resetAlarm

Public events
- started
- stopped
- alarmRaised

Public anchors
- inlet
- outlet
```

Its private visual implementation may be:

```text
pump-root
├── pump-body.svg
├── fan.svg
├── run-light      (vector circle)
├── alarm-light    (vector circle)
├── vendor-logo.png
└── label-text
```

Private rules may contain:

```text
state == running -> run-light visible
state == alarm   -> alarm-light visible
speed            -> fan animation speed
label            -> label-text content
```

The scene author sees only the public contract.

A runtime flow is therefore:

```text
External/mock runtime value
        ↓
DataBinding
        ↓
pump.speed
        ↓
component-private rule / animation
        ↓
fan visual state
```

The SCADA author does not need to know that a `fan` layer exists.

---

## 17. SCADA Workbench simplicity rule

The SCADA Workbench must not grow component-development controls merely because the underlying component system becomes more powerful.

It should remain contract-driven.

For a selected pump, the normal component UI should be close to:

```text
Properties
  Label       [1# Pump]
  State       [bind data...]
  Speed       [bind data...]
  Alarm       [bind data...]

Actions
  Start
  Stop
  Reset alarm

Events
  Started
  Stopped
  Alarm raised
```

It should not expose:

```text
SVG path editing
internal layer tree
visual rule source
animation implementation
script source
Konva properties
native handler details
```

Those belong to the Component Workbench.

---

## 18. Current implementation mapping

The repository already implements the first generic contract slice:

```text
ComponentDefinition
        ↓
ComponentRegistry
        ↓
Editor palette / node factory
        ↓
ComponentSceneNode
        ↓
SceneNodeRenderer
        ↓
Component Renderer
```

The generated Inspector already consumes `ComponentDefinition.properties` rather than branching on concrete component types.

The current built-in pump and status indicator are architecture acceptance components for this generic path.

The following parts of this document are target architecture and are not yet fully implemented:

- exposed vs internal property semantics;
- Component Package persistence;
- heterogeneous editable Visual Layer Tree;
- visual rule/expression model;
- animation model;
- controlled component script runtime;
- configurable/script/native action implementation boundary;
- Component Workbench debugging and package validation;
- runtime bindings, values, actions, and events.

These should be implemented incrementally without weakening the public/private boundary.

---

## 19. Architectural invariants

The following rules are normative for future work:

1. **Component Workbench owns complexity; SCADA Workbench consumes only public component contracts.**
2. **Component internal layers and implementation details are private by default.**
3. **Properties, Actions, Events, and Anchors form the stable public component vocabulary.**
4. **Editor/base geometry is not duplicated as component semantic properties.**
5. **Component capability does not depend on visual source. SVG, raster images, vector primitives, text, groups, and native rendering may coexist behind one contract.**
6. **A component may be implemented through configuration, expressions/rules, animations, controlled scripts, trusted native code, or combinations of them.**
7. **User scripts do not receive raw Konva nodes or unrestricted browser/runtime authority.**
8. **Konva capabilities should be preserved through component visual abstractions rather than exposed as a renderer-specific public API.**
9. **Runtime data flows into exposed component properties; component-private visual behavior remains encapsulated.**
10. **Visual anchors remain separate from runtime data/action/event semantics.**
11. **Native built-ins and Component Workbench-authored components must look equivalent to the SCADA Workbench at the contract level.**
12. **Increasing Component Workbench power must not increase normal SCADA scene-authoring complexity.**

These invariants take precedence over short-term convenience when designing Component Lab, runtime bindings, scripting, actions/events, packaging, or renderer extensions.
