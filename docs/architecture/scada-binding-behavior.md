# SCADA Binding and Component Behavior Direction

Status: **design direction under evaluation; not yet a frozen runtime contract**.

This note records the architectural direction reached while reviewing M6.5. It is intentionally written before further QuickJS integration so that implementation does not outrun the product model.

The key correction is:

> **SCADA is not a rule engine. It may compute rich presentation state from multiple data points and map discrete changes/user interactions to actions, but device orchestration, process sequencing, automation rules, and business state machines belong outside the SCADA layer.**

For ClinkZ, richer automation DSL/state-machine capabilities may exist at the platform level. They must not be pushed into normal SCADA scene authoring merely because the runtime can support them.

---

## 1. Product boundary

The SCADA Workbench primarily connects three things:

```text
runtime data
    ↓
component public Properties / Actions / Events
    ↓
component-private visual behavior
```

Its ordinary responsibilities are:

1. derive a component value/state from one or more data points;
2. invoke a component Action when a local condition/transition requires a visual behavior;
3. map a component/user Event to a device/platform Action;
4. keep the scene author outside component-private layers and renderer details.

It is **not** responsible for general automation such as:

```text
Device A changes
    ↓
wait / retry / count / sequence / process state
    ↓
control Device B
```

If a derived value has business meaning beyond the current SCADA presentation — for example it drives alarms, history, cross-service automation, or multiple consumers — it should normally become a platform/ClinkZ virtual value or automation result instead of remaining a page-local SCADA calculation.

---

## 2. Component public contract remains the scene boundary

A reusable component exposes:

```text
Properties  — what the component currently represents
Actions     — what the component can be asked to do
Events      — what the component reports happened
Anchors     — visual connection geometry
```

The SCADA Workbench should operate against that public contract only.

A complex visual transition should therefore be encapsulated as a component Action rather than forcing a scene author to manipulate private layers.

Example:

```text
Component Action: enterFault(severity)
```

may internally perform:

```text
body fill change
+ warning layer visibility
+ pulse animation
+ blink contribution
+ text transition
```

The scene author sees only `enterFault`, not the private layers or Visual Runtime targets.

This preserves the established rule:

> **The Component Workbench owns complexity; the SCADA Workbench consumes a stable public contract.**

---

## 3. Three scene-level binding families

The current direction is to separate ordinary SCADA behavior into three binding families.

### 3.1 Value Binding

Maps one or more runtime inputs to a component Property.

```text
Data Snapshot
    ↓
Pure Expression
    ↓
Component Property
```

Examples:

```text
${running}
    → component.running

${level} / ${maxLevel} * 100
    → component.levelPercent
```

A more complex component state may depend on multiple points:

```text
case
  ${fault} -> "fault"
  ${running} and ${pressure} < 0.3 -> "warning"
  ${running} -> "running"
  else -> "stopped"
```

This is still presentation logic, not a rule engine, because it is a pure mapping:

```text
inputs → value
```

It has no device-side business side effect.

### 3.2 Behavior Binding

Maps a local data transition/condition to a **Component Action**.

```text
Data transition / condition edge
    ↓
Component Action
    ↓
component-private transient behavior
```

Example:

```text
${fault}: false → true
    → component.enterFault("critical")
```

This exists because not every UI change is a stable Property assignment. Some component capabilities are inherently transient or behavioral:

```text
pulse()
flash()
playTransition()
enterFault()
resetVisual()
```

The runtime must distinguish a continuously true condition from a transition so that repeated telemetry values do not accidentally replay a one-shot Action on every update.

The normal UI may expose simple trigger semantics such as:

```text
when condition becomes true
when value changes
when condition is true
```

without forcing users to learn edge/stream terminology.

### 3.3 Interaction Binding

Maps a user/component Event to an external Action.

```text
User interaction
    ↓
Component Event
    ↓
Device / Platform Action
```

Example:

```text
pump.startRequested
    → ${device.start}()
```

A reusable component should not need to know which real device it controls. It emits a semantic Event; the scene binding decides which device/platform Action receives it.

---

## 4. Ordinary users should configure conditions + actions, not scripts

For normal SCADA authors, the intended interaction is not a blank script editor.

A behavior may be represented as a small structured configuration:

```text
Conditions
  [running] = true
  AND
  [pressure] < 0.3

Action
  [Component] → [Show warning]
```

The implementation may have an AST/expression representation, but the user should normally choose variables, operators, values, component Actions, and device Actions directly from the UI.

Data references and callable capabilities must be selected from known schemas/contracts. Textual forms such as `${...}` are useful as precise serialized/editor representations, but users should not be required to memorize or manually type identifiers.

The editor should provide direct insertion via selection, search, click, or drag.

---

## 5. Expression capability may be rich while side effects remain narrow

The SCADA expression layer may need to combine multiple values and therefore should not be restricted to one-point bindings.

Reasonable expression capabilities include:

```text
boolean composition
comparison
arithmetic
case/conditional mapping
small pure helper functions
multiple point references
component/public values
```

The architectural constraint is not "expressions must be weak".

It is:

> **SCADA computation may be expressive, but its side effects must remain deliberately narrow.**

A computation can derive a sophisticated UI state from several points. It must not quietly become a general process automation language with timers, arbitrary loops, device-to-device orchestration, network access, or hidden business state.

If ordinary expression/configuration is insufficient, an advanced script may eventually exist as a last-resort escape hatch, but its contract should be reviewed as a compute/update mechanism rather than assumed to be an unrestricted command API.

---

## 6. Elm/Iced-inspired runtime separation

Elm/Iced is useful here as an architectural influence, not as an API to copy.

The useful separation is:

```text
current inputs/state
    ↓
View / derived presentation
```

and for discrete behavior:

```text
Message
    ↓
Update
    ├─ new/transient component state
    └─ explicit Effects
```

For SCADA this suggests a hybrid model:

```text
High-frequency runtime data
    ↓
Current Input Snapshot
    ↓
Value Binding / Expression
    ↓
Component Properties
    ↓
View
    ↓
Visual Runtime
```

while discrete transitions and interactions use:

```text
Data transition / user interaction / Component Action
    ↓
Message
    ↓
Update
    ├─ transient component runtime state
    └─ Effects
```

The scene/component behavior implementation should prefer "calculate what should happen" over arbitrary code directly mutating browser/renderer objects.

Effects should remain explicit and host-executed.

---

## 7. State ownership

To avoid multiple competing sources of truth, component runtime state should be conceptually separated into:

```text
Authored State
  component/package definition and defaults

External Inputs
  values supplied by scene bindings/runtime data

Derived State
  pure results computed from current inputs

Transient Runtime State
  hover/pressed state, transition progress, pulse/blink epochs, one-shot visual behavior
```

If `running` is bound to a device Property, the component should not silently create a second authoritative `running` value through arbitrary script mutation.

Transient state is appropriate for visual behavior that has no independent device/business truth, such as "the enter-fault pulse is currently 240 ms into its animation".

---

## 8. Primary device context and copy/rebind ergonomics

A major scene-authoring assumption worth exploring is:

> **One component instance commonly represents one primary device instance.**

This is not an absolute restriction, but it should be the optimized path.

Instead of hard-coding every binding against a concrete device ID, most bindings can be relative to the component instance's **primary device context**:

```text
${device.running}
${device.fault}
${device.speed}
${device.start}()
${device.stop}()
```

The persisted representation should use stable structured references rather than fragile display-name string replacement.

This makes copy/reuse dramatically simpler.

Example workflow:

```text
1. Configure Pump01 component once.
2. Copy / paste the component.
3. Change primary device: Pump01 → Pump02.
4. Relative Property/Action/Event references resolve against Pump02 automatically.
```

The copy should retain:

```text
Value Bindings
Behavior Bindings
Interaction Bindings
conditions
component Actions
external Action parameters
trigger semantics
```

Only the primary device context normally changes.

If the target device exposes a compatible model/TD contract, rebinding can be automatic. The editor should surface only missing/incompatible capabilities.

### 8.1 External references remain possible

Some components legitimately consume other points, for example a pump plus an external pressure sensor.

The model should therefore distinguish:

```text
relative primary-device references
external explicit references
```

Changing the primary device automatically rebinds the former. External references remain explicit and may require separate confirmation/remapping.

---

## 9. Copy is a first-class authoring capability

Ease of use is not achieved only by making one behavior easy to configure.

Users should not have to repeat already completed work.

Therefore copy/duplicate behavior should preserve the complete component binding bundle. Rebinding should operate over structured references rather than string substitution.

This suggests a reusable internal concept such as:

```text
Component Instance
├─ primary device context
├─ authored scene props
├─ value bindings
├─ behavior bindings
├─ interaction bindings
└─ external references
```

Copy + primary-device rebind becomes the normal high-frequency workflow for repeated equipment of the same model.

---

## 10. Relationship to M6.4 Visual Runtime

The accepted M6.4 Visual Runtime remains valuable and should not be replaced by this model.

Its canonical renderer-independent targets and composition semantics continue to answer:

> how should private visual state be represented and composed?

The intended layering becomes:

```text
SCADA runtime data
    ↓
Bindings / expressions / transitions
    ↓
Component Public Contract
    ↓
Component Behavior / View
    ↓
Visual Runtime
    ↓
Renderer
```

Named visual effects and base visual targets remain component-private implementation capabilities unless deliberately exposed through a component Property or Action.

---

## 11. Relationship to M6.5 Controlled Script work

The work already completed in M6.5 is not automatically discarded.

Useful pieces include:

```text
host-owned runtime state
JSON-safe protocol values
sandbox boundary validation
engine-neutral execution abstraction
resource/host capability boundaries
```

However, the architectural center should be reviewed before implementing a production QuickJS adapter.

The earlier shape:

```text
script
  → runtime.properties.set(...)
  → runtime.visual.set(...)
  → runtime.actions.invoke(...)
```

is highly flexible but risks making imperative script mutation the primary behavior model.

The stronger direction to evaluate is:

```text
Binding / Message
    ↓
Compute / Update
    ↓
Derived/Transient State + explicit Effects
    ↓
Host / Visual Runtime
```

Advanced scripting, if retained, becomes an implementation/escape-hatch mechanism inside this behavior model rather than the product-facing center of SCADA dynamics.

QuickJS therefore remains a possible execution engine, not an architectural dependency or user-facing programming model.

---

## 12. Current design checkpoints

Before further sandbox-engine implementation, the next architecture pass should settle at least:

1. the minimal persisted forms for Value, Behavior, and Interaction Bindings;
2. how condition groups represent AND/OR/NOT without becoming a rule-engine language;
3. transition semantics for one-shot Component Actions;
4. how Component Actions map internally to component behavior/transient state;
5. what Effects are permitted and which layer executes them;
6. how primary device context and stable relative references are represented;
7. copy/duplicate/rebind behavior;
8. which existing M6.5 capability APIs remain host internals versus user-script APIs;
9. whether an advanced script is needed for SCADA v1 at all, and if so whether it is compute/update-oriented rather than imperative.

No QuickJS-specific API should be frozen before these points are reconciled with the accepted component and Visual Runtime architecture.
