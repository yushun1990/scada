# ADR proposal: Component-authored private Update runtime as portable component asset

- Status: `active` — architecture proposal under review, not an accepted executable-content capability.
- Date: 2026-10-09.
- Work item: **CAR-ARCH** (Component Authoring Runtime architecture).
- Base authority: [Component input/output and composition ADR](adr-component-input-output-composition.md) (PR #221, pending review); [Component system](component-system.md); [M9 Attribute/Property authority](component-attributes-properties.md); [PLAN](../../PLAN.md).
- Scope: Component Workbench authoring model, portable implementation ownership, internal message/update boundary, host effect authority, execution prerequisites and rollout gates.
- Joint review correction: [JA-001 / JA-002 handoff and CAR-1 obligations](../governance/component-authored-update-review-correction.md).
- Does **not** approve a new persisted schema, arbitrary JavaScript execution, new package capability, user-facing implementation, nested components, Scene interaction migration or M10B+ work.

## 1. Product decision: three roles, one reusable component asset

The SCADA Engine is fixed application/runtime infrastructure. A **component developer** authors visual design, public contract and private behavior inside the Component Workbench. A **scene author / component consumer** uses the published component by configuring Attributes, binding Properties, invoking declared Actions when useful and responding to declared Events. A reusable component should not require editing the SCADA application repository or adding a new trusted native registration for each authored component.

The accepted public contract remains:

| Public interface | Meaning |
| --- | --- |
| Attributes | Authored static configuration and presentation options |
| Properties | Externally/runtime-owned semantic input and state; one effective host-owned snapshot, which can include fallback and does not inherently confirm equipment state |
| Actions | Optional, typed, discrete requests from outside **into** the component |
| Events | Typed, discrete occurrences emitted **out of** the component |
| Anchors | Visual connection geometry, not behavioral ports |

The proposed private implementation is distinct:

| Private component implementation | Responsibility |
| --- | --- |
| Model | Instance-local transient interaction/animation state, not the external semantic Property authority |
| Update | Component-developer-authored logic for processing engine-delivered messages and producing bounded results |
| Presentation | Declarative visual rules, animation and validated visual contributions derived from configuration, Properties and private state |
| Private operations | Scoped implementation helpers and layer operations, not automatically public Actions |

**Update is not an Action.** A public Action declaration is a typed input port; it may be translated by the host into an internal update message. A pointer/keyboard interaction and a Property snapshot transition can also enter Update without first invoking any public Action. Messages are an **internal runtime vocabulary**, not a renamed public Action or Event contract.

This is a component-authoring model and a proposed execution contract; no particular scripting language or function signature is accepted by this ADR alone.

## 2. Message / Update / output responsibilities

Conceptual data flow:

~~~text
Host / renderer adapter             External runtime data            Scene / parent
  normalized interaction          settled Property inputs             invoke Action
          \                                   |                              /
           \                                  |                             /
                host-owned validation and message delivery
                                    |
                         component-private transition
                                    |
                        bounded, validated transition intent
                       /                   |                   \
             private Model'        declared Event(s)       allowed Effect(s)
                       \                   |                   /
                           host-controlled commit/dispatch
                                    |
                   private presentation + consumer routing
~~~

These are responsibility categories, not a function signature or a closed
message union. Candidate inputs include normalized activation/press/cancel,
settled Property input changes, lifecycle reset and validated public Action
invocations. CAR-1 must define delivery, ordering and generation ownership.
If completion messages are admitted for component-requested Effects, their
scope and correlation need an explicit contract. They are **not** results of
independently authored public Event consumers.

The **host** owns normalization, lifecycle, queueing, validated snapshots, atomic application, Event publication and effect dispatch. The author owns the private transition logic; it receives capability-limited values and returns data, not mutable runtime object references. A later execution ADR must decide whether results are returned or emitted through a bounded host bridge, and how that is enforced atomically.

### Input mapping is not public contract editing

The renderer/interaction adapter may observe pointer, touch and keyboard inputs. It turns them into stable engine-level interaction messages. A reusable switch may handle press start/end/cancel for visual feedback and semantic activation for a complete click/keyboard action. An authored interaction target/region may be needed for composite/SVG visuals. **Raw DOM or Konva event handlers are not the authored API**; nor does the Engine invent public start/stop Events from the shape of the component.

A component developer chooses how those internal inputs affect its state and which **declared** Events they emit. The scene author decides where those Events route. Standard activation should cover accessible keyboard input, cancellation, disablement and duplicate/held interactions; exact protocol and gesture ordering remain to be decided by the execution ADR.

Property updates present a settled effective snapshot. They must not silently
reset internal transient feedback or convert authored fallback into a
component-owned writer. Components claiming equipment confirmation must consume
the explicit unknown/usable input distinction required by
[JA-001](adr-component-input-output-composition.md#effective-values-and-confirmed-equipment-state--ja-001).
Same-valued confirmation/loss and rebind must be observable through that
contract or explicit lifecycle delivery; a scalar-only propertyChanged callback
cannot recover missing information. Existing adapters may retain values on
disconnect, so loss/freshness invalidation must be supplied and tested by the
Host integration. If a component has no imperative transition logic, existing
declarative visual rules/animations remain the preferred implementation;
Update is optional, not mandatory for every asset.

### Public Action and Event remain independent

A public Action is only declared when another component or a scene legitimately needs to request a capability **of this component**, e.g. flash or reset its private presentation. It is not required merely because an operator can click the component. Invocation is normalized to an internal message and may share implementation with ordinary interaction.

A public Event names an occurrence and defines a typed payload; it does **not** contain a consumer handler, target or action. Any emitted Event must be declared by the type, validated by the host and scoped to the instance. Parent forwarding, if nested components are added later, is explicit; never bubble or promote child Events implicitly. Internal effect requests do not bypass Scene/Host authorization.

The Event can have zero, one or multiple consumers. A Scene-owned Effect is not an
Effect requested by this Update, and no result is implicitly delivered back.
The [JA-002 public response boundary](adr-component-input-output-composition.md#event-consumers-and-feedback-to-the-origin--ja-002)
distinguishes dispatch acceptance, command failure, protocol-specific device
acknowledgement and confirmed equipment state. None may be substituted for
another. Silence or unchanged telemetry does not distinguish slow, failed and
unanswered requests. Feedback about a consumer outcome requires a separately
declared typed public input and an explicit Scene/Host route; the Scene never
addresses private Model or Update. This ADR offers no such outcome route.

## 3. Worked example: PumpSwitch with explicit unknown equipment input

This is an authored component contract proposal, not a change to the trusted
built-in Pump or its current `state=running` default. The example deliberately
uses a declared unknown state so fallback cannot masquerade as running.

| Surface | Example contract and ownership |
| --- | --- |
| Attributes | Text, colors and local press-feedback configuration |
| Properties | `enabled` for interaction permission; `equipmentState` with `unknown`, `stopped`, `running`, default and absent-input fallback `unknown`; both read-only and host-owned |
| Actions | Optional; none is required merely to click this switch |
| Events | `startRequested` and `stopRequested`, each describing request intent only |
| Private Model | `pressed`, initially false; optional maintained `commandPosition`, initially unset, recording local operator intent only |

The names and enum are a concrete semantic example, not a new package schema
or mandatory Property for every component. A separately declared validity
Property is an alternative if delivered coherently with the value. `enabled`
does not assert a device safety interlock, connectivity or telemetry validity.

The Scene/Host input mapping must yield `unknown` until it has a usable
observation of the current equipment binding. Missing/invalid input, a
declared source-loss/freshness condition and rebind invalidate that observation.
An authored non-unknown fallback must not supply equipment confirmation; a
simulated Workbench observation is explicitly simulated. Existing scalar
bindings/adapters alone do not supply all of this lifecycle contract. CAR-1
must define its admission, invalidation and delivery without creating another
Property authority or a generic telemetry-quality subsystem.

Declaring the enum alone is insufficient: a wrapper receiving only today's
effective `state=running` cannot recover whether it came from fallback. The
mapping needs explicit source availability/current-binding evidence from the
host, rather than inferring it from scalar equality or a Property callback.
In the equal-valued regression, that scalar can remain running throughout;
the declared equipment input must still transition unknown → running → unknown.

### Local feedback and request selection

~~~text
operator presses visual target
  -> engine pressStarted
  -> Update sets PRIVATE pressed=true
  -> button immediately shows the pressed/red appearance
  -> engine activate (once for a valid gesture)
  -> Update reads the current settled, READ-ONLY inputs
       enabled=false or equipmentState=unknown => no equipment request
       equipmentState=stopped => publish startRequested
       equipmentState=running => publish stopRequested
  -> engine/Scene separately routes the Event to authorized device start/stop
  -> device may reject, delay or complete operation
  -> no consumer result is implicitly sent to this Update
  -> usable inbound telemetry updates host-owned equipmentState
  -> equipment indicator/fan derives from that observation, not command intent
~~~

A momentary button releases `pressed` on local press end/cancel regardless of
device speed or rejection. With unknown equipment input it may still give
local press feedback, but activation emits no start/stop request. Disablement
cancels the gesture and emits none. One valid activation produces one declared
request occurrence; exact pointer/keyboard/held/duplicate gesture recognition
and ordering are CAR-1 obligations.

A maintained variant can retain a private `commandPosition` recording the
requested start/stop target after a valid activation, displayed as operator
intent. Request selection still uses usable equipment input, not this private
position. It changes on the next valid local activation and clears on input
invalidation, rebind or runtime reset. It does **not** clear on an unobservable
command failure or claim pending, acknowledged or completed status. The observed equipment
indicator is separate. A failure-sensitive or per-request pending variant is
deferred until CAR-1 accepts a separately declared public outcome input and
explicit Scene/Host routing, correlation and fan-out policy. An internal
effectResult name cannot supply this missing public contract.

The Pump's equipment presentation runs its rotor only for a usable `running`
observation; `stopped` stops it, and `unknown` stops the rotor with an explicit
unknown/unavailable status (it must not imply confirmed stopped). No imperative
fan-start Action is required to mirror this input. An optional public Pump
Action.start remains a request. The Scene may route PumpSwitch.startRequested
to an authorized device/platform Action; Update must not privately send the
same device command to acquire a return value.

### Lifecycle trace and limits

| Case | Required behavior of this example | Boundary / remaining decision |
| --- | --- | --- |
| Startup, fresh Standalone or missing telemetry | Model starts released/unset; equipment input is unknown; no running animation or equipment request | Host must initialize the declared input without promoting authored fallback to confirmation |
| First usable running observation equals an older display/fallback scalar | Confirmation becomes observable through the explicit input distinction; only then show confirmed running | Scalar equality and Property-store notification alone are insufficient |
| Source deletion, invalid input or declared source loss | Input becomes unknown; stop rotor, show unavailable, clear command position and suppress requests | Actual disconnect/freshness invalidation must be provided; current adapter retention is not evidence of it |
| Rebind, even to equipment with the same scalar state | Revoke old observation/command context; reset local gesture and command position; use replacement observations only after validation for that binding | CAR-1 must deliver lifecycle reset/invalidation even when final scalar is equal and fence old binding work |
| Rejected command or dispatch failure | Local release still finishes; host reports diagnostics; private intent cannot diagnose rejection; observed equipment remains unchanged/unknown unless new input arrives | No implicit outcome route or private failure reset; a late host error cannot change Model |
| Delayed acknowledgement, delayed telemetry or no response | Keep local feedback independent; render only current usable equipment input; do not infer success/failure, automatically retry or replay | Acknowledgement has protocol-specific meaning; silence has none |
| Valid current-binding telemetry contradicts latest command intent | Render the observed state even if it differs from command position | Observation does not establish which request caused it; do not discard real state just because intent differs |
| Completion from an old runtime activation/binding/disposed instance | Must not mutate the new Model, publish Events or confirm new equipment; clear runtime-owned work on reset/disposal | CAR-1 defines identities, generations, cancellation and stale filtering; physical work already dispatched cannot be undone by local rollback |

For stale telemetry within one binding, the integration must define which
observation ordering/freshness it can establish; arrival order alone is not
proof of recency. Likewise a delayed current-binding observation is equipment
input, not an acknowledgement of a specific request. If future outcome feedback
is offered, older/superseded request outcomes require their own correlation
and stale policy even while current telemetry remains authoritative.

### What the direction guarantees and what CAR-1 must establish

The corrected direction fixes ownership now: host-only semantic Properties,
private authored gesture/intent state, explicit unknown/usable inputs,
independent Event consumers and host-only Effects. Given admitted input delivery
and transitions, local momentary feedback plus observed equipment presentation
needs no Scene-to-private result channel. A maintained local intent display is
also expressible, with the limits above. These are design obligations and
expressible behaviors, **not existing portable runtime capabilities**.

CAR-1 must establish the actual execution protocol before claiming guarantees
for input delivery, one gesture/one occurrence, local atomic commit, deterministic
ordering, Model-aware presentation, reset and stale suppression. Per-request
pending/failure-sensitive feedback additionally requires the public outcome
contract and route. Current `invokeAction`/`emitEvent`, adapter diagnostics and
editor QuickJS prove neither that protocol nor safe portable execution.

## 4. Workbench authoring and AI-assisted development

The Component Workbench should let a developer author **the component's private logic as part of the component document**. This can use an existing Coding/Development surface where appropriate; do not add a parallel code editor or a duplicate state authority solely for naming consistency.

Required authoring direction:

1. The public-contract editor declares Attributes/Properties/Actions/Events (including typed Action arguments and Event payloads); it does **not** store executable code inside the public Action/Event declaration.
2. A private Logic authoring surface exposes Model and Update implementation, message input mapping, source diagnostics, and a way to test it with simulated input/Property snapshots.
3. Completion, APIs and discoverable symbols are generated from **this exact component's declared contract**, validated private layer identifiers and a **versioned, host-approved capability catalog**, not from arbitrary global JavaScript objects.
4. Preview has repeatable input simulation, state/event/effect trace, invalid-input diagnostics and cancellation/reset. Authoring experiments are transient; explicit authored changes are one undoable document command.
5. AI may draft or refactor implementation, offer tests and explain available APIs, but generated code undergoes the same contract, scope, capability, sandbox and portability validation as manually written code. AI cannot silently grant permissions or publish a package.
6. Simple, entirely declarative components remain supported; never force every SVG/property mapping to execute an authored script.

For a nested component, its public contract is read-only to the parent; internal Events can be consumed only within a future explicitly designed private routing scope. A parent must declare and explicitly re-emit its own public Event if the occurrence should leave the component boundary. This inherits, and does not implement, PR #221 composition authority.

## 5. Portable implementation is an asset, not SCADA application code

The implementation artifact belongs to the **component**, not the application build. A component author must be able to save, export, install and reuse it without recompiling SCADA.

A **conceptual** package closure is:

~~~text
portable Component package
  definition/contract (serializable, non-executable declarations)
  visual resources, rules and animations
  private implementation asset
    source or verified compiled representation
    private Model/Update metadata and input mapping
    runtime API version + declared host capabilities
  exact validation/dependency/integrity closure
~~~

This is **not** a mandate to introduce these filenames, package fields or an update.js path. Exact source language, representation, storage locations, schema/version migration, ABI and script host bridge are open to a dedicated execution/design review. In particular, do not put author source into ComponentDefinition.actions or reactivate the R0-rejected public implementation field.

Authoring local repository identity remains independent of installed/published artifact identity. Component-package and work-package distribution must carry the exact dependency/resources closure; standalone consumption is package scoped and must not depend on Studio IndexedDB, a global mutable registry, or source checkout. Importing an asset is not permission to execute it. Preview and standalone must perform the same admission/capability checks and runtime semantics before portable code can be considered supported.

Untrusted or malformed implementation source must be rejected with clear diagnostics; a metadata-valid public Action/Event declaration without an executable capability must still fail closed at activation under existing M10-R0 rules. Required private logic must also participate in executable admission even if a component has no public Actions/Events. Unsupported logic, ABI or capabilities cannot be stripped to activate a superficially declarative asset. No silent downgrade that loses authored behavior is allowed.

## 6. Execution authority and safety prerequisites

Existing authority boundaries and obligations on future execution remain binding:

- The fixed Host owns device/platform effects, runtime data inputs, semantic Property ownership, Event routing, renderer state and resource lifecycle. A component script has no direct DOM/React/Konva/Three, device, filesystem, ambient network or unrestricted browser-global authority.
- The script may update its **private instance Model** and request validated visual contributions/declared Events/explicit allowed Effects. It may **not** write authoritative effective Properties, authored Attributes, scene nodes, or the package document at runtime. A new semantic writer role requires a separate decision.
- Runtime messages and outputs must be typed, bounded and validated against the component definition, instance, allowed target scope, capability list and visual target kinds. Invalid requests fail closed without partial commits.
- Time, memory/stack, recursion, queue growth, synchronous reentry and asynchronous completion must be bounded. Define failure isolation, cancellation/disposal, stale-result suppression and effect-result correlation; never infer device command success from a script return.
- Stable author references, private layer IDs and component-instance identity must not become a second renderer/runtime authority. Host-applied effects are requests with explicit target ownership, not mutable proxies to live renderer objects.
- Trusted native ComponentRegistration handlers remain a separate accepted implementation mode; their existence is not proof that arbitrary portable scripts are safe.

CAR-1 must specify one owned Model/commit boundary, including retained sandbox
globals, closures and async work; a deterministic presentation composition path
with existing Attribute/Property rules, animation overlays and reset/disposal;
and ordering among source propagation, Actions, private/child Events and Effects.
Current rules do not read Model, and renderer-local animation time is not an
accepted authored scheduler. Validation/rollback before local commit must be
distinguished from failures after irreversible external dispatch. Neither
Model rollback nor a retry can guarantee undo/exactly-once equipment effects.

A constrained declarative state machine or constrained handlers can lower to
the same host-owned transition protocol with Model-aware declarative
presentation. CAR-1 should compare those options and sandboxed source on the
same PumpSwitch trace and negative cases. The existing editor QuickJS engine
does not select JavaScript, QuickJS or imperative layer calls for this runtime.

The current ControlledScriptEngine describes init/propertyChanged/action entry points and a bounded host-call vocabulary. The current QuickJS layer-method engine is **editor-only private visual trial execution**. Neither constitutes a production-admitted, portable component-level Update implementation. Experimental property.set/invoke bridges are not an accepted semantic Property writer or an authorization to connect user-authored source to production.

A subsequent accepted **Portable Component Execution ADR** must settle the isolation model, actual language/ABI, capability set, deterministic ordering and effect semantics, resource and rollback budgets, source/compiled artifact handling and preview/standalone parity before implementation or package-schema changes.

## 7. Relationships, migration order and acceptance evidence

This ADR extends the **private execution side** of PR #221's public input/output authority; it does not replace that ADR's Action/Event/Property ownership or authorize PR #222's work to bypass its dependency. Both remain subject to review and merge acceptance.

**Product direction to record now:** fixed Engine + Component Workbench-authored private behavior + portable component-owned executable asset + simple SCADA consumption. **Execution mechanism not authorized yet.**

Suggested separate follow-ups, not automatically started:

| Stage | Scope | Required evidence |
| --- | --- | --- |
| CAR-0 | Independently review the JA-001/JA-002 corrections, then accept public-contract PR #221 before this dependent proposal; reconcile ownership with M10 gates. | Explicit decisions, consistent public/private examples and no conflicting live architecture authorities; review threads are not resolved by implementation alone. |
| CAR-1 | Independent execution ADR: unknown/usable input delivery and lifecycle; Model/presentation/commit/ordering; normalized interactions and generation fencing; optional explicit outcome routing; capabilities/ABI, sandbox and versioned admission. | Threat model, compatibility matrix, adversarial traces below, migration/rejection plan and a decision on whether per-request feedback is offered. |
| CAR-2 | Narrow production-runtime prototype using production exports, with no new authoring/UI claims. | Typed messages, one effective Property truth, controlled state/effect commit, malformed/admission/budget/cancellation tests. |
| CAR-3 | Component Workbench Logic authoring plus simulated preview/debug/AI API hints as optional tooling. | One-gesture/one-history-command, reset/stale-run tests, authored save/reopen and scoped browser evidence. |
| CAR-4 | Portable component / work / standalone parity only after explicit capability and schema acceptance. | Exact-package dependency closure, versioned migration, import/export, sandbox failure, Preview/standalone behavior equality and deployed browser evidence where required. |

Do not merge stages just to reach runnable scripts quickly. Nothing here supersedes currently accepted M6–M9, M10-R0 restrictions, the ongoing M10A gate or existing Scene semantics. Scene Trigger -> Effect interaction authoring and nested Component Layer remain their own later decisions. A future runtime can share canonical component/message dispatch without inventing a second SCADA semantic engine.

Required CAR-1 acceptance cases, followed by production-export fixtures in
CAR-2 and scoped Workbench/Standalone browser evidence in CAR-3/4:

- Startup/fresh load with running fallback but no telemetry; explicit unknown
  input suppresses equipment requests/animation. First confirmation and loss
  that leave the scalar unchanged must still reach the consumer distinctly.
- Source deletion, invalid values, retained values after disconnect and declared
  freshness expiry; state/validity coherence, no fallback promoted as usable.
- Rebind to the same scalar state, delayed old-binding input, reused instance ID,
  restart/disposal and superseded async work; no stale Model/Event/effect commit.
- Press/release/cancel, keyboard activation, disablement and held/duplicate
  input; immediate local feedback and one occurrence per valid gesture.
- Zero, one and multiple Event consumers, disconnected dispatch rejection,
  transport failure, delayed/no acknowledgement and valid contradicting
  telemetry; none is silently equated with equipment confirmation.
- If outcomes are offered: explicit typed public input/authorized route,
  origin instance + occurrence + runtime activation + binding correlation,
  newer requests overtaking older outcomes, cancellation, fan-out selection or
  aggregation and a defined no-consumer result. Private addresses are rejected.
- Invalid transition output, resource/queue exhaustion, retained hidden state,
  presentation ordering and local rollback versus post-dispatch failure;
  unsupported private logic/ABI/capability fails closed through package import,
  Preview and Standalone even with no public Actions/Events.

## 8. Open implementation decisions (explicitly not frozen)

- Exact normalized event repertoire and author mapping (pointer vs activate vs accessibility), gesture cancellation and ordering.
- Single reducer/update entry versus a constrained multi-handler authoring format; how messages/actions/effects are represented on disk.
- Choice of source language (JavaScript/QuickJS or alternative), compiler/ABI, source mapping and editor diagnostics.
- Whether the sandbox returns a transition description or uses a bounded imperative host bridge; atomicity/scheduling model.
- Schema of private Model, allowed transience/persistence, serialization/size limits and restart semantics.
- Unknown/usable equipment input representation, loss/freshness/rebind mapping and lifecycle delivery when scalar values do not change.
- Model-aware presentation composition with retained rules/overlays; hidden execution state, commit/rollback and ordering with the existing semantic runtime.
- Whether to offer per-request outcome feedback at all; if offered, its declared public input, explicit routing, origin/occurrence/activation/binding correlation and zero/multiple-consumer policy.
- Sandboxed async effects, cancellation and idempotency/correlation of external requests.
- Security review, package capability/version migration and dependency-closure rules; which capabilities are admitted first.

These decisions belong to CAR-1 and require evidence. Avoid accidental commitment to a specific TypeScript interface or update.js filename based solely on the conceptual examples above.
