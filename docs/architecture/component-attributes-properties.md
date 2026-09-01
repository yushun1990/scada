# Component Attributes and Properties Architecture

Status: **accepted design direction; implementation migration is planned after the current M8 portability gate**.

This note refines the component public-contract model defined in `component-system.md` and the scene binding model defined in `scada-binding-behavior.md`.

The key correction is:

> **Component authoring configuration and runtime semantic data are different concepts and must not share one undifferentiated Property namespace.**

A reusable component should expose static **Attributes** for authored presentation/configuration and dynamic **Properties** for runtime semantic values. Actions, Events, and Anchors remain separate first-class contract elements.

The target public vocabulary is therefore:

```text
Component Public Contract
├─ Attributes
├─ Properties
├─ Actions
├─ Events
└─ Anchors
```

This split is intended to keep a small set of generic industrial components reusable across many visual/runtime states instead of creating state-specific component types.

---

## 1. Problem

The current component model uses `Properties` for values with different authority and lifecycle characteristics.

For a pump, these two groups are not equivalent:

```text
alarmColor
runningColor
faultColor
precision
animationSpeed
```

and:

```text
running
alarm
fault
speed
pressure
```

The first group is authored configuration describing how the component should present itself. The second group represents runtime state/data that may be bound to device or platform values.

Keeping both in one namespace creates several long-term problems:

- the Inspector cannot clearly distinguish ordinary configuration from point binding;
- component authors must rely on flags such as `bindable` to recover a distinction that should exist in the type model;
- runtime binding can accidentally become authoritative over visual configuration;
- package/schema semantics become harder to validate;
- component libraries tend toward state-specific visual variants instead of reusable components.

The last problem leads directly to component-type explosion, for example:

```text
Pump
PumpRunning
PumpStopped
PumpAlarm
PumpFault
PumpRunningAlarm
...
```

The target architecture keeps one reusable `Pump` and lets Attributes + Properties determine its authored appearance and runtime state.

---

## 2. Attribute semantics

An **Attribute** is authored component configuration.

Typical examples:

```text
runningColor
stoppedColor
alarmColor
faultColor
fontSize
borderWidth
precision
unit
animationSpeed
thresholdDisplayMode
```

Normative rules:

1. Attributes are persisted authored configuration.
2. Attributes are visible/configurable only when deliberately exposed by the component definition.
3. Attributes are **not runtime data-binding targets**.
4. Runtime telemetry must not directly overwrite Attributes.
5. Attribute changes occur through authoring/configuration flows, not through normal runtime-value propagation.
6. Component-private rules may read Attributes when deriving visual output.

An Attribute may have a component-definition default and an instance-authored override.

Conceptually:

```text
ComponentDefinition attribute default
        ↓
Scene-authored attribute override
        ↓
Component implementation / visual rules
```

There is no runtime telemetry layer in this resolution chain.

---

## 3. Property semantics

A **Property** is a runtime semantic value exposed by the component.

Typical examples:

```text
running
alarm
fault
speed
pressure
temperature
level
value
```

Normative rules:

1. Properties represent values that may participate in runtime state/data flow.
2. Public Properties may be bound to device/platform/runtime values.
3. Value Bindings write Properties, never Attributes.
4. Renderer and Component Action handlers observe one deterministic effective Property snapshot.
5. Runtime Property updates do not rewrite authored Attribute configuration or flood editor history.
6. A Property may have a definition default or authored preview/fallback value, but that does not make it an Attribute; its semantic role remains runtime-capable state.

Conceptually:

```text
Property default / authored fallback
        ↓
runtime binding / derived value
        ↓
effective Component Property snapshot
        ↓
component implementation
```

The exact persistence field names and layering remain an implementation decision, but the Attribute/Property authority boundary is normative.

---

## 4. Rendering rule

A component implementation combines dynamic Properties with static Attributes to derive visual state.

Example:

```text
Property.running = true
Attribute.runningColor = #00c853
Attribute.stoppedColor = #9e9e9e
        ↓
private component rule
        ↓
body.fill = running ? runningColor : stoppedColor
```

For a fault state:

```text
Property.fault
+ Attribute.faultColor
+ Attribute.faultBlinkSpeed
        ↓
component-private rule / animation
        ↓
private visual layers
```

The SCADA Workbench must not bind telemetry directly to `faultColor` merely because the renderer eventually consumes that value.

This preserves the existing encapsulation rule:

> Runtime data enters the public semantic contract; private component behavior turns semantic state plus authored configuration into visual output.

---

## 5. Target schema direction

Exact API names may change during implementation, but the public definition should converge toward a shape equivalent to:

```ts
interface ComponentDefinition {
  type: string
  title: string
  category: string

  attributes: Record<string, AttributeDefinition>
  properties: Record<string, PropertyDefinition>
  actions: Record<string, ActionDefinition>
  events: Record<string, EventDefinition>
  anchors: VisualAnchorDefinition[]
}
```

Conceptually:

```ts
interface AttributeDefinition {
  title: string
  kind: AttributeKind
  defaultValue: ComponentScalarValue
  exposed?: boolean
  configurable?: boolean
  description?: string
  options?: readonly AttributeOption[]
}

interface PropertyDefinition {
  title: string
  kind: PropertyKind
  defaultValue: ComponentScalarValue
  exposed?: boolean
  bindable?: boolean
  description?: string
  options?: readonly PropertyOption[]
}
```

A public Attribute does not need a `bindable` flag because normal runtime binding is structurally invalid for Attributes.

Internal visual/transient state remains private implementation state and belongs to neither public Attributes nor public Properties unless deliberately exposed.

---

## 6. SCADA Workbench Inspector model

The Inspector should make the distinction obvious instead of presenting one mixed property list.

Target shape for a selected pump:

```text
Attributes
  Running color   [green]
  Stopped color   [gray]
  Alarm color     [orange]
  Fault color     [red]
  Animation speed [1.0]

Properties
  Running         [bind data...]
  Alarm           [bind data...]
  Fault           [bind data...]
  Speed           [bind data...]

Actions
  Start
  Stop
  Reset alarm

Events
  Started
  Stopped
  Alarm raised
```

The editor can generate ordinary configuration controls from `attributes` and point/value-binding controls from `properties` without component-type-specific branching.

---

## 7. Component Workbench model

The Component Workbench should let a component developer define both kinds of public input explicitly.

A component developer should be able to declare:

```text
Attribute: runningColor / color / default green
Property:  running / boolean / bindable
```

and then create a private visual rule equivalent to:

```text
body.fill <- running ? runningColor : stoppedColor
```

Expressions, visual rules, animations, and controlled implementation code may read both Attributes and Properties, but only Properties participate in ordinary scene runtime data binding.

This distinction belongs in the component schema/SDK itself, not merely in Inspector presentation.

---

## 8. Relationship to WoT / ClinkZ semantics

The split deliberately leaves a clean integration boundary for WoT-style runtime data:

```text
Thing Property / platform runtime value
        ↓ Value Binding
Component Property
        ↓
component-private rule
        ← Component Attribute
        ↓
Visual Runtime
```

The names do not require a one-to-one W3C WoT implementation dependency, but the semantic alignment is useful: runtime device state maps naturally to Component Properties while presentation configuration remains local component authoring data.

Component Events already exist as first-class contract elements and remain distinct from Properties:

```text
Property  = current runtime semantic value/state
Event     = discrete occurrence
Action    = callable component capability
Attribute = authored static configuration
Anchor    = visual connection geometry
```

---

## 9. Component-library consequence

The architecture should optimize for **generic reusable component types**, not combinations of visual state.

Prefer:

```text
Pump
  Attributes: runningColor, stoppedColor, alarmColor, faultColor
  Properties: running, alarm, fault, speed
```

over:

```text
PumpRunning
PumpFault
PumpAlarm
PumpRunningFault
```

New component types should normally represent a genuinely different visual/semantic component, not merely a different configured color, threshold, state, or bound runtime value.

This rule is expected to reduce starter/library component count while increasing reuse.

---

## 10. Migration requirements

This is an architectural correction to the existing public schema, so implementation must be deliberate and versioned rather than performed as scattered field renames.

The migration slice must include at least:

1. **Schema split**
   - introduce first-class `attributes` and `properties` definitions;
   - define instance-authored Attribute storage separately from runtime-capable Property values;
   - preserve Actions, Events, Anchors, and private implementation state.

2. **Legacy classification/migration**
   - classify existing configurable-only definitions as Attributes where appropriate;
   - retain runtime/bindable semantic values as Properties;
   - fail closed or require explicit migration for ambiguous definitions instead of silently guessing unsafe semantics.

3. **Inspector / Component Workbench**
   - render Attributes and Properties as separate sections;
   - generate normal controls for Attributes;
   - generate binding/value controls for Properties;
   - prohibit Attribute runtime binding in authoring UI and validation.

4. **Runtime contract**
   - Value Binding targets only Properties;
   - effective Property snapshots retain deterministic ownership/order;
   - Attributes are supplied as authored configuration to component rendering/behavior without becoming runtime binding state.

5. **Package and Scene compatibility**
   - version component-package/schema persistence as required;
   - preserve explicit migration for existing portable components and Scene documents;
   - ensure work-package validation uses the migrated component contract.

6. **Acceptance fixtures**
   - prove a single component changes runtime state through Properties while retaining authored visual configuration through Attributes;
   - prove runtime binding cannot target an Attribute;
   - prove legacy starter/user components migrate deterministically;
   - prove export/import and standalone runtime preserve the split contract.

---

## 11. Scheduling rule

The current M8 standalone portability work should not be destabilized by a mid-milestone schema rewrite.

Therefore:

- M8B1 remains the current implementation gate;
- after M8 closeout, this Attribute/Property split becomes an explicit architecture/migration gate before expanding the component catalog or adding substantial new component-authoring capability;
- do not grow a large component library on top of the current conflated configuration/runtime Property model.

The migration may be pulled earlier only if M8B1 reveals that the existing conflated model prevents correct standalone runtime behavior. Otherwise portability is completed first, then the schema is corrected once through a deliberate migration.
