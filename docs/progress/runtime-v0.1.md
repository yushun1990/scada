# SCADA Runtime v0.1 Progress

This document records completed runtime slices against the roadmap in [`PLAN.md`](../../PLAN.md).

The rule for M5 delivery is simple: every merged runtime slice must update this progress log in the same pull request as the implementation.

## Target acceptance gate

```text
indicator.status
      ↓ public bindable state property
Mock runtime value
      ↓
RuntimeValueStore
      ↓
DataBinding
      ↓
Effective component props
      ↓
Preview renderer
      ↓
visible state changes automatically
```

The gate is not complete unless runtime updates remain outside authored `SceneDocument` props and editor undo/redo history.

## Status

| Slice | Status | Result |
| --- | --- | --- |
| M5.1 RuntimeValueStore | merged · PR #40 · `2e5ea96501cdc89347792511d3e8833c955b8678` | Runtime-only immutable observable value store, independent of scene/history |
| M5.2 DataBinding + effective props | merged · PR #41 · `1ccef65f546400be77026989c125a58feecc2e25` | Persisted generic bindings and runtime override resolver without authored-prop mutation |
| M5.3 Preview runtime lifecycle | merged · PR #42 · `46db2b6c98257abd7059e238fd4e80904ec07e40` | Preview-only runtime lease, subscription, stop and clear lifecycle |
| M5.4 Mock data source | merged · PR #43 · `287bddcd83bc300f52c0db9288326fb26080d14c` | Deterministic runtime data-source contract and indicator state-cycle source |
| M5.5 Minimal binding UI | merged · PR #44 · `bb3e28d106358bdc9fe55cab3959bb13b3af493f` | Schema-compatible bindable Property UI persists DataBinding through editor history |
| Runnable Runtime v0.1 gate | **accepted · 2026-08-09** | Manual visual acceptance confirmed the complete `indicator.status.state <- mock.indicator.state` Preview loop |
| M5.6 Action/Event runtime kernel | merged · PR #46 · `872bf6d54cc7437b713109c7e1c6ad60388a77ef` | Generic contract-validated Action invocation and Event emission with Native handler boundary |
| M5.7 Minimal behavior flow | merged · PR #47 · `acdbd552b2efa8a5110527b07fc14560fdf3b3eb` · manual smoke pending | Persisted Event -> Action behavior routing with schema-driven authoring UI and Preview execution |

## M5.1 RuntimeValueStore

Tracking: PR #40, merged as `2e5ea96501cdc89347792511d3e8833c955b8678`.

### Completed

- Added `src/runtime/runtime-value-store.ts`.
- Added `src/runtime/index.ts` as the runtime module entry point.
- Runtime values reuse the existing scalar component value domain for the first runtime slice.
- Store state is held outside `SceneDocument` and outside `useSceneHistory`.
- Every mutation publishes a new immutable snapshot.
- Repeating the same value is a no-op and does not notify subscribers.
- Supports single-value update, batch update, delete, clear, read, existence checks, snapshot reads, and subscription cleanup.
- `getSnapshot` and `subscribe` are shaped for later React `useSyncExternalStore` consumption without introducing a React dependency into the runtime core.
- Empty runtime value keys are rejected so later data sources and bindings have stable identities.

### Architectural result

```text
External / Mock source
        ↓
RuntimeValueStore
        ↓ immutable runtime snapshot
Binding / Preview consumers
```

There is deliberately no path from `RuntimeValueStore` back into authored scene state.

## M5.2 DataBinding + effective props

Tracking: PR #41, merged as `1ccef65f546400be77026989c125a58feecc2e25`.

### Completed

- Bumped `SceneDocument` to version 5 for the first persisted binding contract.
- Added generic `DataBinding` with a runtime-value source key and target component Property.
- Existing v1-v4 scenes continue to load and migrate with empty bindings.
- v5 scene validation rejects malformed binding ids/keys, non-bindable target Properties, duplicate binding ids, and multiple bindings targeting the same Property.
- Promoted component Property value validation into the component-system layer so persisted props and runtime overrides share one type/enum rule.
- Added `resolveEffectiveComponentProps` with deterministic precedence: definition default, authored scene props, then valid runtime binding override.
- Invalid or type-incompatible runtime values fall back to authored/default values instead of leaking invalid data into component renderers.
- `SceneNodeRenderer` accepts an optional runtime snapshot and computes effective props immediately before invoking a registered component renderer.
- Nested group children receive the same runtime snapshot.
- No component type special cases were added.

### Architectural result

```text
ComponentDefinition defaults
           +
SceneNode.props (authored)
           +
SceneNode.bindings (persisted mapping)
           +
RuntimeValueSnapshot (runtime-only)
           ↓
resolveEffectiveComponentProps
           ↓
ComponentRenderer props
```

`SceneNode.props` remains the authored source of truth. Runtime evaluation creates effective values instead of rewriting scene configuration.

## M5.3 Preview runtime lifecycle

Tracking: PR #42, merged as `46db2b6c98257abd7059e238fd4e80904ec07e40`.

### Completed

- Added `PreviewRuntime` as the owner of the Preview-only `RuntimeValueStore`.
- Preview activation uses an idempotent lease/ref-count model so multiple root nodes share one runtime session.
- The first active Preview root starts the runtime; the last released root stops it and clears runtime values.
- `SceneNodeRenderer` roots acquire the Preview runtime only when `editorMode` is false.
- Designer mode uses no Preview runtime subscription and falls back immediately to authored component props.
- React consumes runtime snapshots through `useSyncExternalStore`; the runtime core itself remains React-independent.
- Nested group children inherit the root runtime snapshot and do not acquire duplicate runtime leases.
- Explicit `runtimeValues` injection remains available for renderer tests and future runtime composition.
- Runtime stop clears transient values instead of writing them back into `SceneDocument`.

### Architectural result

```text
Designer
  -> no preview runtime lease
  -> authored props

Preview root
  -> acquire PreviewRuntime
  -> subscribe RuntimeValueStore
  -> effective runtime props

Last Preview root release
  -> stop PreviewRuntime
  -> clear runtime values
  -> authored props on Designer return
```

## M5.4 Mock data source

Tracking: PR #43, merged as `287bddcd83bc300f52c0db9288326fb26080d14c`.

### Completed

- Added renderer-independent `RuntimeDataSource` and stop contracts.
- Added `createSequenceMockDataSource` as the first deterministic generator.
- Sequence sources validate that at least one value exists and that the interval is positive.
- Preview Runtime owns source start/stop together with its existing lease lifecycle.
- Source startup failure rolls back already-started sources and clears transient runtime state.
- The default Preview Runtime exposes `mock.indicator.state`.
- `mock.indicator.state` cycles deterministically through `off -> normal -> warning -> alarm` every 1200 ms.
- Leaving Preview stops the interval before runtime values are cleared.
- Mock sources write only to `RuntimeValueStore`; they do not reference SceneDocument, component types, Properties, or Renderers.

### Architectural result

```text
PreviewRuntime lease
        ↓
RuntimeDataSource.start
        ↓
mock.indicator.state sequence
        ↓
RuntimeValueStore
        ↓
DataBinding / effective props
```

## M5.5 Minimal binding UI and runnable gate

Tracking: PR #44, merged as `bb3e28d106358bdc9fe55cab3959bb13b3af493f`.

### Completed

- Preview mock values publish discoverable source metadata separately from the data-source execution contract.
- The schema-driven component Inspector renders a binding selector only for Properties declared with `bindable: true`.
- Runtime source options are filtered by the target Property schema and complete source value domain; no component type branch decides compatibility.
- The `mock.indicator.state` source is compatible with `indicator.status.state` because all four generated values are valid select options.
- The same source is not offered to the pump state Property because its select value domain is different.
- Binding creation and removal persist in `ComponentSceneNode.bindings` and use the normal editor `commit()` path, so the configuration itself is undoable/redoable.
- Rebinding preserves the existing binding id; unbinding removes only the target Property binding.
- The Inspector still exposes the authored Property value as the fallback used when no valid runtime value is present.
- Runtime source updates never call the binding configuration command and therefore remain outside editor history.
- SCADA Workbench exposes only public Property + data-source selection; component visual internals and runtime implementation details remain hidden.

### Runnable path

```text
Designer
  indicator.status.state = authored fallback
  Data binding = mock.indicator.state
        ↓
Preview
  PreviewRuntime starts source
        ↓
mock.indicator.state
  off -> normal -> warning -> alarm
        ↓
RuntimeValueStore snapshot
        ↓
resolveEffectiveComponentProps
        ↓
StatusIndicatorComponentRenderer
        ↓
visual state changes
        ↓
return Designer
        ↓
runtime stops / clears
        ↓
authored state visible again
```

### Acceptance — 2026-08-09

Manual visual acceptance passed after PR #44 was merged.

Confirmed acceptance criteria:

- a public bindable component Property can be configured from the SCADA Inspector
- `indicator.status.state` can bind to the compatible mock state-cycle source
- entering Preview starts runtime evaluation and the deterministic mock sequence
- runtime value changes visibly drive the component renderer
- authored component props remain the persisted fallback rather than being overwritten by runtime data
- leaving Preview stops runtime activity and restores the authored visual state
- runtime value changes do not create editor undo/redo history entries
- binding configuration itself remains undoable/redoable
- the binding path remains schema-driven and contains no `indicator.status` or `pump.submersible` branch in generic binding orchestration

**Result: the first runnable SCADA Runtime v0.1 gate is accepted.**

The project has therefore crossed the planned boundary from a static scene editor into a runnable SCADA experiment.

### Deferred after the gate

- No general data-source browser or production source-management UI yet.
- No manual/toggle/ramp/sine mock editors yet.

## M5.6 Action/Event runtime kernel

Tracking: PR #46, merged as `872bf6d54cc7437b713109c7e1c6ad60388a77ef`.

### Completed

- Kept `ComponentDefinition.actions` and `ComponentDefinition.events` as serializable public contract declarations.
- Added optional `ComponentRegistration.actions` as the trusted Native implementation boundary.
- Added a controlled `ComponentActionHandlerContext` containing only instance identity, effective component props, and `emit()`.
- Native handlers receive no raw `SceneDocument` mutation API, `RuntimeValueStore`, Konva node, DOM object, or browser global through the runtime contract.
- ComponentRegistry rejects Native Action handlers that are not declared in the corresponding public Definition.
- Preview Runtime owns the active `SceneDocument` for the duration of its lease session, allowing interaction APIs to resolve instances by node id.
- Added `PreviewRuntime.invokeAction(nodeId, actionName, input?)` with component-instance, public-contract, and implementation validation.
- Added `PreviewRuntime.emitEvent(nodeId, eventName, payload?)` with public Event validation.
- Added `PreviewRuntime.subscribeEvents(listener)` and immutable event records containing sequence, timestamp, node identity, component type, event name, and payload.
- Action handlers receive effective runtime props, so future implementations observe the same Property state that the renderer sees.
- Added pump `start` / `stop` public Actions and `startRequested` / `stopRequested` public Events as the first Native contract proof.
- Pump Native handlers emit request Events only; they deliberately do not mutate authored props or pretend that a physical device has changed state.
- Action/Event semantics remain independent of visual Anchors and `SceneConnection`.

### Runtime path

```text
invokeAction(nodeId, "start")
        ↓
active Preview SceneDocument
        ↓
component instance + ComponentRegistry
        ↓
Definition.actions.start
        ↓
Registration.actions.start
        ↓
controlled Native handler
        ↓
emit("startRequested")
        ↓
Definition.events.startRequested
        ↓
Runtime Event subscribers
```

## M5.7 Minimal Event -> Action behavior flow

Tracking: PR #47, merged as `acdbd552b2efa8a5110527b07fc14560fdf3b3eb`.

### Completed in code

- Bumped `SceneDocument` to version 6 for the first persisted Behavior contract.
- Added `EventActionBehavior` on component instances: a source component Event triggers one target component Action.
- Existing v1-v5 scenes continue to load and migrate with empty behaviors.
- Scene validation requires the source Definition to declare the trigger Event and the target component Definition to declare the target Action.
- Behavior ids are globally unique and malformed or dangling target references are rejected on scene import.
- Group nodes cannot own runtime Behaviors in v6.
- Deleting a component also removes Behavior effects that target the deleted component, preventing dangling runtime references.
- Component duplication deliberately starts with empty bindings and behaviors so copying a visual subtree does not silently duplicate automation semantics.
- Preview Runtime dispatches matching source-node Behaviors after a public Event is emitted and reuses the M5.6 `invokeAction` path for the effect.
- Added a synchronous behavior-dispatch depth limit of 32 to prevent simple Event -> Action -> Event cycles from freezing Preview.
- Added schema-driven `ComponentInteractionsInspector` for SCADA Workbench use.
- The Actions tab lists the selected component public Actions and allows execution only in Preview when a current Runtime implementation exists.
- The Events tab lists the selected component public Events and allows Designer configuration of one target executable Action per Event.
- Behavior configuration uses the normal editor `commit()` path and is therefore undoable/redoable; Runtime dispatch never rewrites authored scene configuration.
- Entering Preview retains the logical selected component for the right-side interaction Inspector, while `SceneRenderer` still disables Transformer and editing interactions in Preview.
- Runtime Events are surfaced through the existing canvas message area to make the minimal interaction path observable without adding a dedicated diagnostics console yet.
- No component type branch was added to behavior orchestration; both authoring and Runtime resolve public contracts through ComponentRegistry.
- Behavior semantics remain independent of visual Anchors and `SceneConnection`.

### Runtime path

```text
source Component Event
        ↓
sourceNode.behaviors
        ↓
PreviewRuntime.dispatchBehaviors
        ↓
invokeAction(targetNodeId, action)
        ↓
target Component Runtime implementation
        ↓
optional target Event
```

### Manual smoke path

Use two pump instances because the pump currently provides the first executable Native Action/Event contract:

```text
Designer
  Pump A / Events
  启动请求 -> Pump B · 启动
        ↓
Preview
  keep Pump A selected logically
  Pump A / Actions / 启动 / 执行
        ↓
Pump A emits startRequested
        ↓
Behavior invokes Pump B.start
        ↓
Pump B emits startRequested
        ↓
canvas runtime message reports the target event
```

### Verification status

- PR #47 merged after CI #297 passed Build and Lint.
- The behavior model, runtime dispatch, and SCADA authoring path are code-complete on `main`.
- A browser manual smoke test is still required before the M5.7 behavior slice is marked accepted.

### Deliberately deferred

- No condition/expression evaluation yet.
- No Event -> Property assignment yet.
- No Action parameters UI yet.
- No user-authored Script Runtime yet.
- No dedicated Behavior graph/editor or semantic behavior wires.
- No async runtime scheduler/queue yet; the first dispatch is synchronous with a bounded recursion guard.

## Next checkpoint

After the M5.7 manual smoke test, the first M5 Runtime foundation is complete enough to move into **M6 Component Workbench v1** without reopening the public-contract/runtime boundaries established here.
