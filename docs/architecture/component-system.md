# Component System and Component Workbench Architecture

Public input/output and future composition semantics are amended by
[Component inputs, outputs and composition](adr-component-input-output-composition.md)
(`active` architecture review). The accepted
[Attribute/Property split](component-attributes-properties.md), portable
execution restrictions and [PLAN](../../PLAN.md) gates remain in force. This
document distinguishes current capability from later design; examples do not
authorize a new execution path.

## 1. Purpose

This document defines the long-term component boundary for SCADA Editor Lab.

The central product rule is:

> **The Component Workbench owns and encapsulates complexity. The SCADA Workbench consumes only the component's public contract.**

A component may be visually simple or internally sophisticated. It may be implemented from SVG assets, raster images, vector primitives, text, nested groups, scripts, or trusted native code. None of those implementation details should leak into normal SCADA scene authoring.

The current `ComponentDefinition` / `ComponentRegistration` / `ComponentRegistry`
implements a subset of this model. Current portable user execution is
declarative; trusted registrations can provide typed Action/Event processing.
Future composition and authored discrete execution need separately authorized
implementation and acceptance.

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
- define public Attributes and semantic Properties, keeping transient state private;
- define typed public Actions and Events when an accepted execution capability exists;
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
- configure the component's public Attributes;
- bind semantic Properties to runtime data;
- author interactions that consume declared Events and request declared Actions;
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
│   ├── Attributes
│   ├── Properties
│   ├── Actions
│   ├── Events
│   └── Anchors
│
└── Private Implementation
    ├── Assets
    ├── Visual Layer Tree
    ├── Private transient state
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

A SCADA scene author must not directly edit `alarm-light.fill`, `fan.rotation`
or an SVG child path. Deliberately exposed Attributes configure presentation;
semantic Properties provide runtime inputs that private visual rules consume.

For example, if a component developer wants the alarm color to be configurable, the correct design is:

```text
public Attribute: alarmColor
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

  attributes: ComponentAttributeValues
  propertyFallbacks: ComponentPropertyFallbackValues
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

Component-specific runtime semantic fallback values belong in
`propertyFallbacks`; effective runtime values belong to the host snapshot.
Static authored configuration belongs in `attributes`.

Examples:

```text
state
speed
level
temperature
alarm
```

`label` and `precision`, when authored display configuration, are Attributes.

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

  attributes: Record<string, AttributeDefinition>
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

## 6. Attributes, Properties and private state

The accepted [M9 value authority](component-attributes-properties.md) separates
authored Attributes such as `label` and `alarmColor` from runtime semantic
Properties such as `state`, `speed` and `alarm`.

```text
Attribute default + instance-authored override
        ↓
read-only authored configuration

Property default/authored fallback + accepted external/derived runtime values
        ↓
one effective host-owned Property snapshot
        ↓
component implementation and renderer
```

Value Bindings write only Properties through the accepted runtime authority.
The `bindable` flag does not grant component code ownership of a Property.
Runtime telemetry never rewrites Attributes or editor history.

`fanAngle`, `alarmBlinkPhase`, `pressed` and `hovered` may be component-private
transient state. They do not require public Property declarations. Actions and
private operations can update that private state; they cannot directly write
public semantic Properties, including unbound fallbacks. Accepted Scene DSL
Property assignment remains declarative host-owned derivation.

The former “public configurable property” direction is superseded by M9.
Do not rebuild static configuration with Property flags or flatten values back
into a mixed `props` namespace.

---

## 7. Actions: declaration vs implementation

An Action is a typed discrete input intent / operation request in the public
contract. Chinese UI calls it **操作**. It is not an object method or permission
to mutate semantic state.

Examples:

```text
start
stop
resetAlarm
pulse(severity)
```

An `ActionDefinition` describes that input and remains serializable. Ordered
typed parameters match the existing DSL/runtime arguments. It has no public
return/output schema and carries no executable source.

Conceptually:

```ts
interface ActionDefinition {
  title: string
  description?: string
  parameters?: readonly ActionParameterDefinition[]
}
```

The action implementation is separate.

The host resolves an instance, validates arguments and dispatches the input to
its implementation. Function-like DSL syntax still lowers to such a request;
native handler functions remain private host implementation details.

### 7.1 Current and future execution boundaries

Current execution boundary (M10-R0): trusted native handlers and declarative
visual rules/animations are implemented. The configuration-step Actions and
controlled-script authoring described below are historical target concepts,
not accepted portable execution capabilities. Current portable user packages
must have empty Actions/Events to activate; Action `implementation` source is
rejected and `implementationDraft` remains inert. Reopening portable execution
requires a separate accepted ADR, isolation/capability model and standalone
parity evidence. PLAN governs scheduling.

Future configured updates or controlled implementation logic must follow
the [input/update/effect decision](adr-component-input-output-composition.md#3-internal-updateeffect-model-and-host-authority).
This replaces the old `start → set semantic state → emit started` example:

```text
start request → validated input → optional startRequested occurrence
                             → separately authorized host device effect
later telemetry → host-owned Property.state = running
```

An operation request is not proof of device completion. Visual transient state
can change locally, but semantic input ownership cannot be bypassed by a
configuration step, sandbox or Action handler.

#### Trusted native handler

Built-in or trusted plugin components may provide application-linked implementations.

Conceptually:

```ts
interface ComponentRegistration {
  definition: ComponentDefinition
  renderer: ComponentRenderer
  createDefaultProps(): ComponentProps
  actions?: Record<string, ComponentActionHandler>
}
```

Native functions belong to runtime registration, never to the serialized definition.

### 7.2 Same contract regardless of implementation

A scene author consumes the declared input, not its implementation. Available
execution capabilities must remain explicit; the current portable user path
cannot claim equivalence with trusted Action execution.

For a host supporting these declared inputs, the SCADA Workbench shows:

```text
Pump
Actions
- Start
- Stop
- Reset alarm
```

---

## 8. Events

Events represent typed discrete occurrences/outputs emitted by a component.
The component type owns the definition and payload schema; the implementation
determines when it occurred; the host validates and routes the instance-scoped
output. The Event definition says what happened, not what a receiver should do.

Examples:

```text
clicked
started
stopped
alarmRaised
stateChanged
```

Current payloads are named scalar records with required/optional fields and
explicit nullability. Unknown fields are rejected; an Event without a payload
schema accepts no payload. Validated payloads are immutable. Event definition
data contains no response target, callback or handler source.

Separately authored interactions can connect Events to Action requests without
exposing component internals or creating arbitrary Property-assignment effects.

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

Child Event consumption and explicit parent re-export follow
[the composition rules](adr-component-input-output-composition.md#5-future-reusable-component-as-an-internal-layer).
Neither ordinary visual layers nor editor `$emit` diagnostics implicitly
declare public Component Events.

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
    -> reads effective Properties and derives private visual state/animations
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
Direct authored visual/Attribute configuration
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
alarm-light.visible <- properties.alarm
fan.rotation        <- expression based on properties.speed
label.text          <- attributes.label
water.scaleY        <- properties.level / 100
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

Controlled execution is an implementation mechanism for behavior that is
awkward to represent with declarative configuration; it requires the accepted
capability for its specific execution domain.

Any future authored execution reads separate Attribute and effective Property
snapshots and computes private state plus explicit host effect requests. Public
Event publication and Action routing require contract validation. The earlier
generic `setProperty`/`invoke` API sketch is superseded; controlled execution
alone does not grant semantic Property ownership or arbitrary target access.

The existing private Layer Operation editor uses a bounded sandbox facade and
returned visual requests. Its legacy `methods`/`$self` names are compatibility
details, not the future public programming model. Exact current capability and
required corrections are specified in the
[controlled-layer ADR](adr-proposal-controlled-layer-methods.md).

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
Attributes
Properties
Actions
Events
Anchors
```

A Component Workbench-authored pump and a native built-in pump share contract
vocabulary. Interchangeability also requires the host’s actual accepted capabilities.

The implementation source must not become part of editor orchestration.

---

## 15. Component Package target model

The target reusable unit is a component package.

```text
Component Package
├── Metadata
├── Definition
│   ├── Attributes
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
│   ├── Animations
│   └── Private Layer Operation data (`methods`, editor execution only today)
└── Native Registration (application/plugin side, when applicable)
```

Current distributable v2 packages contain
`definition`, `visual` and inert `implementationDraft`; native registration is
an explicit host capability, not transported code. There is no accepted
portable executable Behavior section. Resource closure and versioned migration
remain governed by PLAN/M8/M9; M10 representation changes keep their own gates.

Examples:

- a simple indicator may need one vector layer and one property;
- a pump may combine SVG + image/vector layers + animations; public Actions
  additionally require an accepted host implementation capability;
- a trusted chart component may use a native renderer while exposing the same public schema.

---

## 16. Pump example: encapsulation boundary

A reusable pump can expose:

```text
Public properties
- state
- speed
- alarm

Public Attributes
- label
- runningColor
- alarmColor

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
Attribute.label  -> label-text content
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
Attributes
  Label       [1# Pump]
  Alarm color [orange]

Properties
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

Current code also implements M9 Attribute/Property storage and host snapshots,
editable private Group/SVG/Image/Vector/Text layers, declarative visual rules
and animations, versioned component/work packages and package-scoped standalone
semantics. The editor-only private operation sandbox is implemented separately
from portable execution. Public Action/Event processing exists for trusted
registrations; portable user declarations remain unavailable for activation.

Future reusable Component layers, portable authored public Action/Event
execution and the new Scene Trigger/Effect authoring direction are not
implemented. The [source audit](../progress/component-input-output-audit.md)
distinguishes retained safe mechanisms from migration debt. Subsequent work
must preserve this capability distinction and follow PLAN.

---

## 19. Architectural invariants

The following rules are normative for future work:

1. **Component Workbench owns complexity; SCADA Workbench consumes only public component contracts.**
2. **Component internal layers and implementation details are private by default.**
3. **Attributes, Properties, Actions, Events, and Anchors form the stable public component vocabulary. Actions are typed discrete input requests; Events are typed occurrences, not reaction definitions.**
4. **Editor/base geometry is not duplicated as component semantic properties.**
5. **Component capability does not depend on visual source. SVG, raster images, vector primitives, text, groups, and native rendering may coexist behind one contract.**
6. **Implementation mechanisms do not grant authority: configured/controlled updates operate on private state and host effects; accepted portable capability remains explicit.**
7. **User scripts do not receive raw Konva nodes or unrestricted browser/runtime authority.**
8. **Konva capabilities should be preserved through component visual abstractions rather than exposed as a renderer-specific public API.**
9. **Runtime data flows into exposed component properties; component-private visual behavior remains encapsulated.**
10. **Visual anchors remain separate from runtime data/action/event semantics.**
11. **Native built-ins and Component Workbench-authored components must look equivalent to the SCADA Workbench at the contract level.**
12. **Increasing Component Workbench power must not increase normal SCADA scene-authoring complexity.**
13. **Private Layer Operations are not public Component Actions; ordinary visual layers are not Components.**
14. **Future child Component instances preserve type-owned contracts; parents consume them read-only and explicitly declare any public Event re-export.**

These invariants take precedence over short-term convenience when designing Component Lab, runtime bindings, scripting, actions/events, packaging, or renderer extensions.
