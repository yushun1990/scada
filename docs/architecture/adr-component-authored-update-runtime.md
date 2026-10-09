# ADR proposal: Component-authored private Update runtime as portable component asset

- Status: **proposed / architecture review**, not yet an accepted executable-content capability.
- Date: 2026-10-09.
- Work item: **CAR-ARCH** (Component Authoring Runtime architecture).
- Base authority: [Component input/output and composition ADR](adr-component-input-output-composition.md) (PR #221, pending review); [Component system](component-system.md); [M9 Attribute/Property authority](component-attributes-properties.md); [PLAN](../../PLAN.md).
- Scope: Component Workbench authoring model, portable implementation ownership, internal message/update boundary, host effect authority, execution prerequisites and rollout gates.
- Does **not** approve a new persisted schema, arbitrary JavaScript execution, new package capability, user-facing implementation, nested components, Scene interaction migration or M10B+ work.

## 1. Product decision: three roles, one reusable component asset

The SCADA Engine is fixed application/runtime infrastructure. A **component developer** authors visual design, public contract and private behavior inside the Component Workbench. A **scene author / component consumer** uses the published component by configuring Attributes, binding Properties, invoking declared Actions when useful and responding to declared Events. A reusable component should not require editing the SCADA application repository or adding a new trusted native registration for each authored component.

The accepted public contract remains:

| Public interface | Meaning |
| --- | --- |
| Attributes | Authored static configuration and presentation options |
| Properties | Externally/runtime-owned semantic input and state; the one effective host-owned snapshot |
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
  normalized interaction               effective Property              invoke Action
          \                                   |                              /
           \                                  |                             /
                host-owned validation and message delivery
                                    |
                   component-private Update(message, model, context)
                                    |
                        bounded, validated transition intent
                       /                   |                   \
             private Model'        declared Event(s)       allowed Effect(s)
                       \                   |                   /
                           host-controlled commit/dispatch
                                    |
                   private presentation + consumer routing
~~~

The invocation and return shape below are illustrative, **not** an already accepted TypeScript API:

~~~ts
type ConceptualMessage =
  | { kind: 'activate' }
  | { kind: 'pressStarted' | 'pressEnded' | 'pressCancelled' }
  | { kind: 'propertyChanged'; key: string; value: unknown }
  | { kind: 'actionInvoked'; action: string; args: readonly unknown[] }
  | { kind: 'effectResult'; requestId: string; result: unknown };

function update(
  message: ConceptualMessage,
  privateModel: unknown,
  context: Readonly<{ attributes: unknown; properties: unknown }>
): {
  privateModel: unknown;
  events?: readonly unknown[];
  effects?: readonly unknown[];
};
~~~

The **host** owns normalization, lifecycle, queueing, validated snapshots, atomic application, Event publication and effect dispatch. The author owns the private transition logic; it receives capability-limited values and returns data, not mutable runtime object references. A later execution ADR must decide whether results are returned or emitted through a bounded host bridge, and how that is enforced atomically.

### Input mapping is not public contract editing

The renderer/interaction adapter may observe pointer, touch and keyboard inputs. It turns them into stable engine-level interaction messages. A reusable switch may handle press start/end/cancel for visual feedback and semantic activation for a complete click/keyboard action. An authored interaction target/region may be needed for composite/SVG visuals. **Raw DOM or Konva event handlers are not the authored API**; nor does the Engine invent public start/stop Events from the shape of the component.

A component developer chooses how those internal inputs affect its state and which **declared** Events they emit. The scene author decides where those Events route. Standard activation should cover accessible keyboard input, cancellation, disablement and duplicate/held interactions; exact protocol and gesture ordering remain to be decided by the execution ADR.

Property updates present a settled effective snapshot. They must not silently reset internal transient feedback or convert authored fallback into a component-owned writer. If a component has no imperative transition logic, existing declarative visual rules/animations remain the preferred implementation; Update is optional, not mandatory for every asset.

### Public Action and Event remain independent

A public Action is only declared when another component or a scene legitimately needs to request a capability **of this component**, e.g. flash or reset its private presentation. It is not required merely because an operator can click the component. Invocation is normalized to an internal message and may share implementation with ordinary interaction.

A public Event names an occurrence and defines a typed payload; it does **not** contain a consumer handler, target or action. Any emitted Event must be declared by the type, validated by the host and scoped to the instance. Parent forwarding, if nested components are added later, is explicit; never bubble or promote child Events implicitly. Internal effect requests do not bypass Scene/Host authorization.

## 3. Worked example: PumpSwitch versus pump telemetry truth

A component developer authors a **PumpSwitch** with Attributes for text/colors/press feedback, Properties such as enabled and running, optional public Actions (none required for this use case), and two public Events: startRequested and stopRequested.

~~~text
operator presses visual target
  -> engine pressStarted
  -> Update sets PRIVATE pressed=true
  -> button immediately shows the pressed/red appearance
  -> engine activate (once for a valid gesture)
  -> Update consults READ-ONLY effective Property.running
       running=false => emit startRequested
       running=true  => emit stopRequested
  -> engine/Scene separately routes the Event to authorized device start/stop
  -> device may reject, delay or complete operation
  -> inbound telemetry updates host-owned Property.running
  -> switch feedback and pump fan presentation derive from confirmed running
~~~

A **momentary button** releases the pressed appearance on pressEnded/cancelled. A **maintained switch** may keep an authored/private operator-command position until subsequent feedback or failure; this position and optional pending feedback are **not** proof of device operation. The component must distinguish visual press/command feedback from confirmed equipment status. A scene should not have to script that distinction itself.

The Pump presentation derives rotor animation from confirmed Property.running. No imperative fan-start Action is required merely to mirror that state. An optional Pump Action.start, if one is publicly declared and implemented, still expresses a request, not guaranteed device start. The Scene may instead route PumpSwitch.startRequested directly to a device/platform Action through accepted host capability.

This example illustrates a contract, not a completed implementation of input messages, Update, device delivery or visual behavior.

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

Untrusted or malformed implementation source is rejected with clear diagnostics; a metadata-valid public Action/Event declaration without an executable capability must still fail closed at activation under existing M10-R0 rules. No silent downgrade to a declarative interpretation that loses authored behavior.

## 6. Execution authority and safety prerequisites

Existing production boundaries remain binding:

- The fixed Host owns device/platform effects, runtime data inputs, semantic Property ownership, Event routing, renderer state and resource lifecycle. A component script has no direct DOM/React/Konva/Three, device, filesystem, ambient network or unrestricted browser-global authority.
- The script may update its **private instance Model** and request validated visual contributions/declared Events/explicit allowed Effects. It may **not** write authoritative effective Properties, authored Attributes, scene nodes, or the package document at runtime. A new semantic writer role requires a separate decision.
- Runtime messages and outputs must be typed, bounded and validated against the component definition, instance, allowed target scope, capability list and visual target kinds. Invalid requests fail closed without partial commits.
- Time, memory/stack, recursion, queue growth, synchronous reentry and asynchronous completion must be bounded. Define failure isolation, cancellation/disposal, stale-result suppression and effect-result correlation; never infer device command success from a script return.
- Stable author references, private layer IDs and component-instance identity must not become a second renderer/runtime authority. Host-applied effects are requests with explicit target ownership, not mutable proxies to live renderer objects.
- Trusted native ComponentRegistration handlers remain a separate accepted implementation mode; their existence is not proof that arbitrary portable scripts are safe.

The current ControlledScriptEngine describes init/propertyChanged/action entry points and a bounded host-call vocabulary. The current QuickJS layer-method engine is **editor-only private visual trial execution**. Neither constitutes a production-admitted, portable component-level Update implementation. Experimental property.set/invoke bridges are not an accepted semantic Property writer or an authorization to connect user-authored source to production.

A subsequent accepted **Portable Component Execution ADR** must settle the isolation model, actual language/ABI, capability set, deterministic ordering and effect semantics, resource and rollback budgets, source/compiled artifact handling and preview/standalone parity before implementation or package-schema changes.

## 7. Relationships, migration order and acceptance evidence

This ADR extends the **private execution side** of PR #221's public input/output authority; it does not replace that ADR's Action/Event/Property ownership or authorize PR #222's work to bypass its dependency. Both remain subject to review and merge acceptance.

**Product direction to record now:** fixed Engine + Component Workbench-authored private behavior + portable component-owned executable asset + simple SCADA consumption. **Execution mechanism not authorized yet.**

Suggested separate follow-ups, not automatically started:

| Stage | Scope | Required evidence |
| --- | --- | --- |
| CAR-0 | Review and accept public-contract PR #221 and this architecture proposal; reconcile ownership with M10 gates. | Explicit decisions and no conflicting live architecture authorities. |
| CAR-1 | Independent execution ADR: private Model/Update protocol, normalized interactions, capabilities/ABI, sandbox and package versioning, failure/ordering model. | Threat model, compatibility matrix, negative/adversarial fixtures and migration/rejection plan. |
| CAR-2 | Narrow production-runtime prototype using production exports, with no new authoring/UI claims. | Typed messages, one effective Property truth, controlled state/effect commit, malformed/admission/budget/cancellation tests. |
| CAR-3 | Component Workbench Logic authoring plus simulated preview/debug/AI API hints as optional tooling. | One-gesture/one-history-command, reset/stale-run tests, authored save/reopen and scoped browser evidence. |
| CAR-4 | Portable component / work / standalone parity only after explicit capability and schema acceptance. | Exact-package dependency closure, versioned migration, import/export, sandbox failure, Preview/standalone behavior equality and deployed browser evidence where required. |

Do not merge stages just to reach runnable scripts quickly. Nothing here supersedes currently accepted M6–M9, M10-R0 restrictions, the ongoing M10A gate or existing Scene semantics. Scene Trigger -> Effect interaction authoring and nested Component Layer remain their own later decisions. A future runtime can share canonical component/message dispatch without inventing a second SCADA semantic engine.

## 8. Open implementation decisions (explicitly not frozen)

- Exact normalized event repertoire and author mapping (pointer vs activate vs accessibility), gesture cancellation and ordering.
- Single reducer/update entry versus a constrained multi-handler authoring format; how messages/actions/effects are represented on disk.
- Choice of source language (JavaScript/QuickJS or alternative), compiler/ABI, source mapping and editor diagnostics.
- Whether the sandbox returns a transition description or uses a bounded imperative host bridge; atomicity/scheduling model.
- Schema of private Model, allowed transience/persistence, serialization/size limits and restart semantics.
- Sandboxed async effects, cancellation and idempotency/correlation of external requests.
- Security review, package capability/version migration and dependency-closure rules; which capabilities are admitted first.

These decisions belong to CAR-1 and require evidence. Avoid accidental commitment to a specific TypeScript interface or update.js filename based solely on the conceptual examples above.
