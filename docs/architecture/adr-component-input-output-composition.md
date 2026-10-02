# ADR: Component inputs, outputs and composition

- Status: `active` — architecture amendment under review; acceptance of this
  documentation PR freezes the decisions below for subsequent implementation.
- Date: 2026-10-03
- Work item: `CIO-ARCH` — component contract semantic audit and authority correction
- Evidence: [source audit and handoff](../progress/component-input-output-audit.md)
- Execution gate: [PLAN](../../PLAN.md), M10A plus authorized product polish.

This is a design decision, not an executable-component, nested-layer or Scene
interaction implementation. It does not close or reopen M6–M10 gates. Pending
acceptance, it must not be used to bypass the currently accepted execution
boundaries. Later implementation requires its own scoped authorization and
evidence.

## 1. Decision and authority

The reusable Component public contract remains:

```text
Attributes + Properties + Actions + Events + Anchors
```

The model is authored configuration plus semantic inputs and discrete
inputs/outputs, not a mutable object whose public methods can change arbitrary
state. Public English uses **Action** and **Event**; Chinese UI uses **操作**
and **事件**. **Message** is an internal runtime concept only. A private
**Layer Operation** is labeled **图层操作**, never an implicit public Action.

This amendment has the following exact dispositions. Unlisted accepted
contracts remain unchanged.

| Existing authority / description | Disposition on acceptance |
| --- | --- |
| PLAN §3.1, README contract glossary, `component-attributes-properties.md` §8: Action as “callable component capability” | Supersede that interpretation with typed discrete input intent / operation request. Keep all five public contract categories. |
| `component-system.md` §6–8 and §13: mixed configuration/Property namespace, callable interface with `output`, steps/scripts that directly set semantic `state` | Amend to the accepted M9 split and this input/output model. No public synchronous result schema or component-owned semantic Property writer is authorized. |
| Accepted controlled-layer-method ADR: `property.set/get`, “editor and runtime use the same engine”, source “syntax whitelist” validation | Amend its scope explicitly: editor-only private visual operations; no semantic Property write capability or portable runtime execution. Current metadata/source-size checks are not a source-language whitelist. Keep sandbox isolation and bounded host operations. |
| `scada-binding-behavior.md`: exploratory Message/Update and imperative scripting discussion | Clarify Message as internal and host effects as normative; accepted M6–M9 Value/Behavior/Interaction semantics remain. Add the later Scene Trigger/Effect direction without changing persistence. |
| Superseded private-node workspace proposal and old progress terminology | Historical evidence only; “object + methods” is not a future architecture requirement. |
| M9, M10-R0, 3D architecture/governance/acceptance | Preserve Attribute/Property ownership, portable capability restrictions, one semantic runtime, renderer separation, resource closure and staged gates. |

This is one amendment chain, not a second competing contract. The component
system document supplies the overall boundary; the Attribute/Property document
supplies the accepted value authority split; this ADR supplies discrete
input/output, private-operation and composition rules. PLAN controls when any
of them may be implemented.

## 2. Public value and discrete contract semantics

| Contract element | Meaning and owner | Permitted data flow |
| --- | --- | --- |
| Attribute | Authored static configuration; definition default owned by the type, instance override owned by authoring | Default + authored override → read-only resolved configuration → private presentation/update logic. No telemetry writer. |
| Property | Externally/runtime-owned semantic state/input | Default/authored fallback + accepted external/derived runtime layers → one effective host-owned snapshot → renderer and Action processing. |
| Action | Typed discrete input intent / operation request addressed to a component instance | External caller/parent interaction → host validation and dispatch → component-local update and permitted effect requests. |
| Event | Typed discrete occurrence/output declared by the component type | Component implementation observes an occurrence → host validates and publishes the instance-scoped occurrence → separately authored consumers. |
| Anchor | Visual attachment identity and presentation geometry | Component presentation → visual connection geometry, never a runtime data or event port. |

### Value ownership

Authored fallback values are useful for preview and for absent runtime input.
They do not turn Properties into static Attributes or permit component code to
become a second semantic writer. Accepted Scene DSL assignments lower into
declarative Value Bindings/derived state committed by the host. They are not
JavaScript member assignments to a live component.

Component-local transition progress, pressed/hover state, animation epochs and
visual overrides are private transient state. An Action may update that state
or request an effect. Neither an Action implementation, a configuration step
nor a Layer Operation may directly overwrite public semantic Properties or
authored Attributes. This includes unbound Property fallbacks: lack of a
binding is not a transfer of ownership to the component.

If a future requirement needs a component-produced semantic value or a new
Property writer role, it needs an explicit ownership/ordering decision and
versioned contract; it is not implied by this ADR. Existing host Property-store
commit APIs and declarative derived layers remain valid internal mechanisms.

### Action semantics

An Action declaration describes intent, name and typed arguments. It contains
neither executable source nor a renderer/native object reference. Invocation
does not imply physical device completion or change in telemetry truth.

For example, `Pump.start` requests a start operation. The current trusted pump
emits `startRequested`; the host may route that occurrence to an authorized
device effect. Only subsequent runtime input establishes `Property.state =
running`. A transient `pulse` Action can instead update a private animation
epoch without a device effect. `started` would describe an observed completed
occurrence, not merely receipt of `start`.

Current Action arguments remain ordered scalar values with declared kinds,
explicit nullability and trailing optional parameters. No rename to Message,
RPC result schema, correlation protocol or new argument representation is
introduced. Function-like DSL spelling such as `$self.reset()` is accepted
syntax for a lowered request, not object-method authority. Native JavaScript
handler return values/Promises are host implementation details, not a public
Action result contract.

### Event definition, payload and ownership

1. The **component type** owns Event names, meaning and payload schema. The
   **instance implementation** determines when a declared occurrence happened.
   The **host** validates, scopes and routes it. A consumer owns the response.
2. An Event definition describes “what happened”. It contains no target,
   operation, handler, forwarding policy or instructions for its consumers.
3. Current payloads are named scalar records. Required/optional fields,
   nullability and enum constraints are part of the type contract; unknown
   fields fail closed. No payload schema means no payload is accepted. Payload
   values are immutable after validation and contain no executable callbacks
   or renderer handles.
4. Source instance identity belongs to the host envelope, not to a caller's
   arbitrary payload. Current Preview supplies node ID, component type,
   sequence and timestamp. Sequence/timestamp are host observations, not
   guarantees of durable delivery, ordering across sessions or exactly-once
   device execution.
5. Reactions belong in separately authored interactions or a parent’s private
   implementation. Payload-to-Action argument mapping, when introduced, must
   be explicit and type-checked at both contracts; no implicit spread or
   treating a payload as an executable command.
6. Editor/pointer events are not automatically semantic Component Events.
   A trusted presentation adapter may translate an actual interaction into a
   declared semantic occurrence. A layer diagnostic named `emit` is not public
   Event emission authority.

## 3. Internal update/effect model and host authority

The conceptual flow is:

```text
resolved Attributes + effective Properties + private transient state
                              +
              Action input / observed interaction
                              ↓
                 internal message / update
                              ↓
       new private transient state + explicit effect requests
                              ↓
                  host validation / execution
                    ├─ private visual presentation
                    ├─ declared Event publication
                    └─ explicitly authorized host effect
```

This freezes responsibility, not an internal reducer signature, scheduling
engine or new persisted Message schema. Public Action/Event names survive any
internal message representation. Frequent telemetry remains snapshot/value
propagation; it need not become a new public discrete API.

The host owns effects and their lifecycle. Serialized/authored components
receive no ambient DOM, React, Konva, Three, network or device authority.
Component Actions cannot manufacture that authority by naming an operation.
Device/platform effects still use explicit host capabilities such as
`ScadaDeviceActionDispatcher`; missing required capabilities fail closed.
Trusted application handlers/adapters remain implementation mechanisms and
do not grant their ambient privileges to portable content.

## 4. Public Component Action versus private Layer Operation

| Dimension | Public Component Action | Private Layer Operation |
| --- | --- | --- |
| Owner | Component type public contract | Owning component’s private visual implementation |
| Consumer | Scene/runtime host or authorized parent interaction | Component developer/private implementation and editor testing |
| Address | Component instance + declared Action key | Stable private layer target + operation identifier within its owner |
| Authority | Validated discrete input; host processes permitted requests | Narrow host-validated visual operation for actual layer capabilities |
| Publication | Declared public input contract | Never promoted by storage, a UI tab or a matching name |
| Current execution | Trusted registered handlers; portable public execution remains unavailable | Explicit editor test through controlled QuickJS; portable runtime does not execute it |

Ordinary SVG/Image/Vector/Text/Group layers are private visual implementation
elements. Stable IDs, typed visual data and operations do not give them the
five-part Component contract. Do not add fake Properties/Actions/Events tables
to every visual layer or create a generic mutable-object capability registry.

### What remains valid in controlled-layer-method design

- Private source stored as data separately from public `definition.actions`.
- Explicit editor test invocation, lazy QuickJS isolation, memory/stack/time
  limits, and structured allowlisted host operations.
- Stable-ID target validation; copied snapshot inputs with no live host
  references and a returned list of operation requests; host application rather
  than raw renderer access.
- Existing pure SVG theme transforms, declarative visual rules, animation
  overlays and private visual state composition.

### What needs correction rather than a mechanical rename

- `layer.methods`, `SvgLayerMethodDefinition`, `runLayerMethod` and
  `ComponentLayerMethodInspector` are compatibility names, not objects with
  public methods. New UI/design language converges from 图层“行为”/“函数” to
  **图层操作**, with ownership stated where public Actions are also shown.
- `$self.layers[i].show = ...`, `setVisible` and `showLayer` are an existing
  sandbox facade over recorded visual requests. They are not live references
  to layers or a recommended future mutable API. New authoring APIs should
  express target + typed operation input and let the host validate results.
- Contexts remain separate despite reusing `$self`: Scene DSL resolves the
  current Component public contract; the layer sandbox facade describes the
  selected private visual target. Neither namespace provides authority to
  access the other, and authored JavaScript is not Scene DSL.
- The current test runner receives all visual-layer snapshots. Its ID checks
  prove membership in that supplied scope, not that a selected layer owns all
  sibling targets. Component-private orchestration across layers can be valid,
  but requires an explicit owner/capability scope; do not expand access merely
  because a layer is present in a snapshot.
- Theme changes on a non-SVG target must not acquire invented SVG semantics.
  Current ignored/inapplicable requests are migration debt, not proof that all
  layer types implement every operation. Future scope and kind validation must
  reject unsupported requests before applying any result.
- Current `▶` applies visual changes to the authored document. A test preview
  should be transient; any explicitly committed authored visual result must
  be one atomic undoable command. Runtime visual overlays must never rewrite
  the package or the editor history.
- `$emit` currently records untyped editor result data that the inspector does
  not publish. Keep it inert for compatibility; never connect it directly to
  public Event routing. Real publication needs declaration/payload/instance
  validation and an explicitly authorized execution path.
- The general `ControlledRuntimeSession`/script protocol can set Property
  overrides in an isolated experiment. It is not wired into the portable
  composite runtime or this layer engine. Its safety limits do not establish
  semantic ownership; it must not be adopted as a second Property authority.

Do not rewrite persisted source or rename `methods` just for terminology.
Source/API migration requires explicit versioned readers, diagnostics,
malformed-input fixtures and recoverable failure; legacy private source may
remain editor-only data. A field named `implementation` in that data does not
reopen the rejected public Action `implementation` field.

## 5. Future reusable Component as an internal layer

**Not implemented:** current `ComponentVisualLayer` contains only
group/svg/image/vector/text. A Group is not a nested reusable Component.

When a later authorized feature adds component instances inside a component:

1. A child instance retains its original **Attributes, Properties, Actions,
   Events and Anchors** contract. Composition must not flatten it into a visual
   layer and discard its semantic inputs/outputs.
2. The child **type** owns that contract definition. A parent consumes a
   resolved type/version; it cannot add, delete, rename or redefine the child’s
   Attribute/Property/Action/Event/Anchor contract in the parent editor.
   Changing the child type requires editing/versioning that reusable type.
3. The parent may configure child instance Attribute overrides, supply/bind
   Property inputs through accepted host data flow, request declared Actions
   and consume declared Events. It cannot directly mutate child semantic state
   or reinterpret a child declaration as the parent’s own contract.
4. A future Component Layer inspector may show child Actions/Events and their
   complete argument/payload schemas **read-only**, and let them participate in
   parent-private interaction authoring. Consumption and configuration are not
   contract definition editing.
5. Child Events are available as parent-internal Trigger/interaction sources,
   but remain private implementation details at the parent boundary by default.
   There is no implicit bubbling, wildcard export or automatic event promotion.
6. To expose one, the parent declares its **own public Event** and an explicit
   forwarding/re-emit/mapping from a specific child occurrence. Even an
   identical name/payload requires this declaration. Both source and output
   schemas are validated; outside consumers observe the parent identity. The
   child type/definition is unchanged. Public Action forwarding and Anchor
   exposure likewise require explicit parent declarations rather than leaking
   child implementation addresses.
7. Resolution and routing use stable child instance identity scoped to the
   owner, never display-name strings, renderer objects or a global mutable
   registry. Dependency closure must include exact child types/resources and
   validate cycles, missing/incompatible contracts and host capabilities before
   activation. Unsupported execution fails closed; preserving a contract does
   not require pretending its implementation is available.

For example, a parent can privately consume `resetButton.clicked` and request
`pump.resetAlarm`. If it wants outside observers to receive `resetRequested`,
it separately declares that parent Event and an explicit mapping. Adding the
button never silently adds `clicked` to the parent contract.

These are composition invariants only. This PR chooses no Component Layer
schema/version, dependency container, binding syntax, inspector or runtime.
Current portable Action/Event restrictions continue to apply recursively; a
future nested feature cannot strip unsupported child declarations to activate.

## 6. Scene Workbench interaction direction

The future authoring direction is:

```text
Behavior = Trigger -> Effect

Trigger: Component Event occurrence from a specified source instance
Effect:  Invoke a declared Component Action on a specified target instance
```

Trigger answers **where did what happen?** Effect answers **which operation is
requested of which target?** Neither is stored inside the Event definition.
Keep discriminated `kind` for explicit validated runtime dispatch. Initial
variants are Component Event Trigger and Invoke Component Action Effect; exact
persisted tag spellings/versioning belong to the later codec decision. Do not
invent additional target/effect families before a demonstrated requirement.

Compatibility boundaries:

- Current Scene `behaviors` are the v6 compatibility Event → Component Action
  path carried by Scene v8. Their existing `kind: 'event'` / `kind: 'action'`
  tags, implicit source-node ownership and zero-argument invocation remain
  supported; they are not a new general interaction schema.
- Current canonical `scadaSemantics` remains the accepted persisted
  Value/Behavior/Interaction authority: derived Properties; condition/edge →
  local Component Action; Component Event → Device/Platform Action. The new
  authoring direction does not replace those meanings or the accepted DSL.
- `claimCompiledSemantics` suppresses legacy auto-dispatch for a claimed source
  node while subscribers still receive its Events. Future unification must
  provide an explicit migration and exactly one selected routing path per
  authored interaction, never run canonical and compatibility routes twice.
- Preview publishes typed Event payloads, but neither legacy routing nor the
  current compiled Event attachment maps payloads to Action arguments. Such
  mapping requires separate production fixtures and is not claimed here.

The later Scene tranche must decide how the canonical model represents the
narrow Component Event → Component Action case and how legacy authored routes
are retained/migrated. It must not introduce a second runtime/Property store or
silently ignore accepted semantics in standalone.

Non-goals: general rules/automation engine, arbitrary scripts, timers/retries,
device orchestration, arbitrary Property-assignment effects, renderer targets,
generic target/effect registries, public Message vocabulary, or new device
protocols. Existing accepted host device effects remain supported; they are not
new speculative effect variants for this first UI baseline.

## 7. Migration order and acceptance boundary

The [audit](../progress/component-input-output-audit.md) records findings
`CIO-001`–`CIO-008`, safe existing mechanisms and exact verification. Suggested
implementation tranches, **not started or automatically authorized here**:

| Order | Independently reviewable tranche | Required evidence |
| --- | --- | --- |
| T1 | Align public 操作 versus private 图层操作 UI; make schema read-only consumption and unavailable portable capability explicit. Preserve existing storage/API names. | Targeted model checks plus browser evidence for the changed labels, contract scope, typed schema display and read-only/cleanup behavior. |
| T2 | Correct editor Layer Operation scope/kind/input validation, transient test result, atomic explicit apply and inert diagnostic outputs. Preserve bounded sandbox and compatibility facade until migration is chosen. | Production-export tests for unsupported targets, same-scope requests, malformed/coerced arguments, partial failure/no commit, stale run cancellation, one command/undo, package round-trip; browser save/reopen/test/apply evidence. |
| T3 | Design then implement narrow Scene Trigger/Effect authoring and routing migration inside the existing semantic runtime. | Versioned codec/malformed-input/rollback fixtures if persistence changes; typed request/payload mapping, no duplicate dispatch, M9 parity, Preview/standalone and browser interaction proof. |
| T4 | Separate nested component-layer design and implementation after type/version/dependency and execution prerequisites are accepted. | Contract-preservation/read-only fixtures; private child triggers and explicit public re-export; identity/cycle/dependency closure, fail-closed capability, undo and packaged standalone parity. |

Portable public Action/Event implementation remains a **separate ADR gate**
requiring isolation, permitted effect capabilities, type validation and
Preview/standalone parity. It is not authorized by T1–T4 or the existence of
editor QuickJS. M10C registry separation remains in its accepted M10 sequence;
this ADR does not start that refactor early.

Architecture-safe mechanisms need no terminology-only rewrite: typed serializable
definitions/normalizers, trusted handler registration, `invokeAction`/`emitEvent`
host entry points, effective Property snapshots, accepted DSL call syntax,
compatibility Behavior tags, private `methods` storage, controlled sandbox,
pure visual rules/theme transforms and package-scoped standalone ownership.
Change them only where an independently justified semantic or compatibility
requirement demands it.
