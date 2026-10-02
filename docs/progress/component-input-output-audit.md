# Component input/output semantic audit — CIO-ARCH

## Gate and authority

- Status: `active` architecture/docs review, 2026-10-03.
- Gate: M10A plus already-authorized product polish; independent documentation
  correction requested by the repository owner, not M10 implementation.
- Base and audited production head:
  `f8a060dc4255b6695ddecffa60493ade5d761c74` (`origin/main`, PR #220 merge).
  `git pull --ff-only origin main` returned `Already up to date` after fetch.
  The starting worktree was clean; the previous local branch was left intact.
- Delivery head: the documentation commit and exact SHA are recorded in the
  associated PR handoff. No production code differs from the audited head.
- Work item: `CIO-ARCH`; findings: `CIO-001`–`CIO-008` below.
- Architecture sections: [ADR §§1–7](../architecture/adr-component-input-output-composition.md),
  [Component system](../architecture/component-system.md),
  [M9 value authority](../architecture/component-attributes-properties.md),
  [controlled editor-operation scope](../architecture/adr-proposal-controlled-layer-methods.md).
- Read before edits: AGENTS/PLAN, the linked Component/SCADA architecture,
  2026-09-25 readiness review, 3D architecture, M10 governance and acceptance
  matrix. M6–M10 closeout decisions, Scene v8 and M10B+ gate status are unchanged.

## Audit findings

### CIO-001 — active documentation teaches mutable Component methods

At the audited head PLAN/README and the M9 glossary call Action a “callable
component capability”. Component-system §7 describes a callable interface with
an `output` schema and `start → set property state = running → emit started`;
§13 sketches generic `setProperty`/`invoke`. Earlier sections still mix display
configuration, Property input and private state despite accepted M9.

**Disposition:** supersede those interpretations explicitly in the ADR and
amend active documents. Action remains public typed discrete input, Event is
typed occurrence/output, and only accepted host runtime layers write semantic
Properties. Configured/controlled component updates own private transient state
and permitted requests. Accepted Scene DSL assignments remain declarative Value
Bindings; this is not a request to delete host commit APIs or rewrite the DSL.

### CIO-002 — Workbench vocabulary and contract consumption obscure ownership

[ComponentEditorPage](../../src/features/component-library/ComponentEditorPage.tsx)
uses “方法” / “方法（未开放）” for public Actions and “行为” for private layer
functions. [ComponentContractEditor](../../src/features/component-library/ComponentContractEditor.tsx)
uses “公开方法”. Its Action/Event view displays key/title/description, not the
complete typed parameter/payload contract. Portable declarations can only be
viewed/deleted; trusted definitions are read-only. These capability guards are
valid and must survive UI correction.

[Scene interaction Inspector](../../src/features/scada-editor/ComponentInteractionsInspector.tsx)
also presents “组件方法”, with a response selector under “事件行为”. It writes
separate `node.behaviors` data rather than embedding responses in Event
definitions, which is safe. It currently discovers only built-in handlers and
has no Action argument editor; it is not a generic typed interaction authoring
surface yet.

**Disposition:** T1 separates public 操作 from 图层操作 and displays available
typed schemas without implying portable execution. A future child inspector
consumes type-owned declarations read-only; it cannot reuse a contract editor
that adds/deletes/renames child definitions. No UI changed in this PR.

### CIO-003 — private operation storage is safe; its old source-language claim is not

[visual.ts](../../src/component-system/visual.ts) stores `methods` on
`VisualLayerBase` (and `SvgVisualLayer`), permits ordinary visual kinds and
deep-clones source/parameters during document/package transfer. Despite the
`SvgLayerMethodDefinition` name, this is private implementation data, separate
from `ComponentDefinition.actions`. It does not create per-layer public
Attribute/Property/Action/Event contracts. Current `main` has neither a reusable
component-layer kind nor component-root `visual.methods`; a local branch or
historical proposal is not evidence that those exist on main.

`assertSvgLayerMethods` checks metadata, names, counts, source length and
parameter shapes. It does **not** parse a JavaScript syntax whitelist. The
controlled ADR's old description overstated static validation. QuickJS handles
syntax errors at explicit editor execution; portable runtime never evaluates
this source.

**Disposition:** correct the ADR's claim; retain `methods` and API names for
compatibility. Do not mechanically rewrite source or add a new schema only to
rename functions. Any future source/protocol migration needs versioned parsing,
malformed-input fixtures, diagnostics and recoverable failure.

### CIO-004 — controlled sandbox does not settle operation scope or kind semantics

[runLayerMethod](../../src/runtime/controlled-layer-method-engine.ts) is a
separate lazy QuickJS adapter with memory/stack/time limits. It receives layer
snapshots and records allowlisted `setTheme`, `setLayerVisible`, `emit`, `log`
requests. It has no DOM/network/device bridge or Property setter. The old
controlled ADR's `property.set/get` capability and shared-runtime-execution
suggestion conflict with actual scope and semantic ownership.

The prelude exposes `$self.layers[i].show`, `setVisible` and helper functions.
These are sandbox-local proxies and recorded requests, not live layer objects.
The inspector passes every layer in the visual; host validation proves only
membership in that snapshot. Selected-layer ownership of siblings is not
explicit. `setTheme` checks a fixed theme list, but non-SVG application is
ignored by the inspector. Private parameter marshalling supplies/coerces
defaults and is not the public Action argument normalizer or a complete
contract/kind validation model.

**Disposition:** retain isolation/recorded requests; T2 requires explicit
component-private owner/scope, applicable operation kinds and complete result
validation before commit. Same-owner cross-layer orchestration can be valid;
ordinary layer existence alone is not authority. No general object capability
registry or Property mutation API is required.

### CIO-005 — editor test results have authored-state and command debt

[ComponentLayerMethodInspector.handleRun](../../src/features/component-library/ComponentLayerMethodInspector.tsx)
applies successful SVG theme and visibility results via `onUpdateLayer` and
`onUpdateVisual`. [ComponentEditorPage.updatePackage](../../src/features/component-library/ComponentEditorPage.tsx)
mutates the authored document through
[useDocumentHistory](../../src/editor/use-document-history.ts).

This is authored mutation, not a transient runtime test. A result affecting
both the selected layer and siblings can call both callbacks; the second
rebuilds from the original `visual` closure and can overwrite the first result.
Outside an explicit transaction each `mutate` is one history entry, so the path
also lacks one-command atomicity. The async execution result has no document
revision/selection cancellation fence. These are source-level findings, not
new browser acceptance claims.

`result.ok` gates application today, which is useful. However the host does not
validate/stage the complete result as a single transaction before application.

**Disposition:** T2 separates transient test from explicit apply, stages one
validated visual result, rejects stale/invalid requests and commits one command
with rollback/cancel evidence. These debts remain unfixed by this docs PR.

### CIO-006 — Event publication is typed; editor diagnostics and payload routing are different

[definition](../../src/component-system/definition.ts) and
[normalizers](../../src/component-system/interactions.ts) already separate
ordered scalar Action arguments from named scalar Event payload fields.
`PreviewRuntime.invokeAction` checks declarations/handler availability and
uses the same immutable Attribute/effective Property snapshots as rendering.
`emitEvent` checks the Event/payload, freezes the host envelope and publishes
instance identity, sequence and timestamp. Native pump handlers emit
`startRequested`/`stopRequested` without mutating `state`.

[ComponentRegistry](../../src/component-system/registry.ts) validates definitions
and rejects handlers for undeclared Actions; declaration alone does not prove
an implementation exists. `get`/`require` return host registrations, not a
public mutable component instance API. Future parent authoring must consume a
type-owned contract view and configure instance data, never mutate the returned
registration/child definition to edit its public contract. Keeping host
registration functions is compatible with discrete input semantics.

The layer engine's `$emit` records an unknown payload/name in `ops`; the
inspector does not publish it. `applyLayerMethodOps` only extracts result data,
with no runtime routing. It must not become public Event authority by connecting
a callback alone.

[Preview compatibility routing](../../src/runtime/preview-runtime.ts) matches
source Event name and invokes the target Action with no arguments. The
[compiled attachment](../../src/runtime/preview-scada-semantics.ts) likewise
passes only `eventName` to the propagation session; it does not lower payload
fields into device Action arguments. Typed emission does not prove payload
mapping is implemented.

**Disposition:** retain current typed host boundaries and inert editor outputs;
T3 must define explicit, validated routing/argument mappings. Child Event
publication at the parent boundary needs a separately declared parent Event
and mapping, never implicit bubbling or copying declarations.

### CIO-007 — current Behavior compatibility and canonical semantics must not fork

[Scene schema](../../src/scene/schema.ts) retains v6 `EventActionBehavior` with
`trigger.kind = 'event'` / `effect.kind = 'action'`, implicitly sourced from the
owning node and explicitly targeting a node. The codec validates both tags and
contract references. These discriminants and zero-argument compatibility are
architecture-safe and need no cosmetic replacement.

Canonical `scadaSemantics` owns Value derivation, condition/edge-driven local
Component Actions and Event-driven Device/Platform Actions. DSL call syntax is
lowered and typed, not JavaScript. `claimCompiledSemantics` suppresses legacy
auto-dispatch for claimed source nodes while still publishing to subscribers;
it prevents the canonical and compatibility consumers from automatically
running together.

**Disposition:** record narrow future `Behavior = Trigger → Effect` authoring
with Component Event source and Invoke Component Action target. T3 must resolve
canonical extension/migration and retain one routing authority before changing
UI/schema. Keep accepted edge/no-replay/settled-state/device-effect behavior;
do not convert it into a rule engine or second runtime.

### CIO-008 — historical/runtime/package boundaries can be mistaken for new authority

The superseded private-node workspace proposal still describes internal
objects with methods/events; M6 progress documents contain old active gates and
mixed Property vocabulary. The controlled ADR mixed accepted editor scope with
an unresolved proposal body. Active Component-system implementation mapping
also claimed delivered layers/packages/runtime were still future work. These
are corrected or explicitly marked historical in this PR.

The low-level [ControlledRuntimeSession](../../src/runtime/controlled-runtime-session.ts)
and [script protocol](../../src/runtime/controlled-script-protocol.ts) retain
Property override setters in an isolated experiment; source imports show no
connection to composite/Preview/standalone execution. Safety checks are useful,
but ownership and typed public interaction integration would need another
decision. `ComponentProps`/`createDefaultProps` and some comments retain old M9
migration wording; the value bag is Property-only, so names alone are not a new
mixed authority.

[Portable capability](../../src/features/component-library/portable-user-component-capability.ts),
[package codec](../../src/features/component-library/distributable-component-package.ts),
[activation](../../src/features/component-library/runtime-activation-core.ts),
[composite registration](../../src/component-system/composite-registration.tsx)
and [standalone core](../../src/features/runtime/standalone-work-runtime-core.ts)
keep public Action/Event execution unavailable for portable users. Legacy public
source is stripped with diagnostics by compatibility readers; canonical public
definitions reject it, retained declarations import as drafts, and current
export/activation remain fail-closed. Private source is transported as data.
Standalone uses an explicit package-scoped registry/runtime and host capability
checks, without local installation, persistence or editor telemetry.

**Disposition:** preserve M7–M10-R0 capability/resource/standalone boundaries.
Future nested closure must include exact child contracts/resources and reject
unsupported capabilities instead of erasing child declarations. Current
registration still includes a renderer; accepted M10C registry/presentation
separation remains later-gated, not implemented as part of this audit.

## Implemented

Documentation only: added one input/output/composition ADR and this audit;
amended PLAN/README, Component system, M9 semantics, SCADA direction/DSL and the
controlled-layer ADR; added scope/history corrections to editor foundation,
editor design/private-node proposal and relevant M6/issue #209 progress notes.
No `src`, `scripts`, dependencies, schemas, package versions or workflow changed.
All seven requested design questions are covered by ADR §§2–7; findings above
separate design debt from safe existing mechanisms.

## Explicitly not implemented

UI labels or contract forms; Property-store/registry refactors; layer scope,
preview/atomic-apply fixes; Event payload mappings; nested Component Layer,
parent interaction authoring or Event re-export; Scene Trigger/Effect UI/codec;
portable authored Action/Event execution; 3D work, dependencies or gate closeout.

## Compatibility and migration

Retain typed definitions, trusted handlers, `invokeAction`/`emitEvent`, shared
effective Property snapshots, accepted DSL spelling, v6 Behavior discriminants,
private `methods` storage and facade, bounded QuickJS, pure visual
rules/theme/animation and package-scoped standalone. Function-shaped host APIs
are implementation mechanisms; their names alone do not require replacement.

No data migration occurs here. Subsequent source/schema/package changes require
explicit versioning, legacy readers, malformed-input diagnostics and failure
recovery. Definition ownership and public contract preservation precede future
nested authoring; portable execution still requires a separate accepted ADR.

## Verification

Production source is unchanged from the audited base. Existing production-export
fixtures were run to check this baseline, not to claim new implementation:

| Command | Outcome |
| --- | --- |
| `npx --yes tsx scripts/check-typed-action-event-contract.ts` | PASS, exit 0 — ordered parameters/payload schema, DSL typing, settled Action snapshots and explicit device dispatcher. |
| `npx --yes tsx scripts/check-preview-component-state.ts` | PASS, exit 0 — separate immutable Attribute/Property snapshots and compiled/legacy routing isolation. |
| `npx --yes tsx scripts/check-layer-methods.ts` | PASS, exit 0 — metadata bounds, controlled host requests, denied host globals, timeout/memory and syntax failures across visual kinds. Does not verify editor atomic commits or a JavaScript syntax whitelist. |
| `npx --yes tsx scripts/check-portable-execution-boundary.ts` | PASS, exit 0 — public source rejection/migration, inert draft text and no unrestricted authoring execution. |
| `npx --yes tsx scripts/check-component-capability-consistency.ts` | PASS, exit 0 — declarative theme Property/rules, ready capability parity and package/work/standalone round-trip. |
| `npx --yes tsx scripts/check-standalone-work-runtime.ts` | PASS, exit 0 — legacy normalization, package-scoped runtime, explicit host capabilities and disposal, no Studio/mock state. |
| `npx --yes tsx scripts/check-scada-behavior-contract.ts` | PASS, exit 0 — flat conditions, relative rebind and enter/leave edges prevent telemetry replay. |
| `npx --yes tsx scripts/check-scada-dsl-runtime.ts` | PASS, exit 0 — indexed propagation/Event lookup, read-only Action arguments and branch-entry idempotence. |
| `npx --yes tsx scripts/check-m9b1-runtime-authority.ts` | PASS, exit 0 — private rules read separate namespaces and authored pump color Attributes. |
| `npx --yes tsx scripts/check-m9b2-package-scene-e2e.ts` | PASS, exit 0 — package/Scene/work/standalone preserve authored configuration and derive runtime visual state. |
| `npm run build` | PASS, exit 0 — TypeScript + Vite, 656 modules. Existing chunk warning retained; main JS 915.25 kB / 298.34 kB gzip. This is a build observation, not a new performance budget or before/after claim. |
| `npm run lint` | PASS, exit 0 — oxlint and all three UI authority checks. 27 existing oxlint warnings in unchanged source/scripts; no warning cleanup in this PR. |
| `git diff --check` | PASS, exit 0 — no whitespace errors. |
| `python3 /tmp/scada-cio-doc-check.py` | PASS, exit 0 — 15 Markdown-only files, balanced fences and 95 local links/anchors resolve. One-off local documentation check; no repository test added. |

Exact delivery head is recorded in the PR handoff. No browser, deployment, new
migration, security audit or performance acceptance is claimed by this
documentation change.

## Risks and follow-up

The authority correction is under review until this PR is accepted. Source
debts CIO-002/004/005/006/007 remain: existing labels, broad snapshot scope,
non-SVG theme no-op, argument coercion, authored test mutations, async/atomic
commit gaps, built-in-only Scene UI and absent payload mapping. Sandbox fixture
success does not close those debts. Legacy experimental Property setters cannot
be promoted into production merely because they have tests.

## Next eligible work item

Explicitly scope T1 public 操作/private 图层操作 and complete read-only typed
contract display while preserving portable restrictions. Suggested subsequent
T2 editor-operation ownership/preview/one-command apply, T3 narrow Scene routing
and T4 nested composition are defined in ADR §7 and **not started** here.
M10 remains at M10A; portable authored execution and later M10 gates keep their
separate prerequisites.
