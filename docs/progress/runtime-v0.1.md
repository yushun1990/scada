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
| M5.6 Action/Event runtime kernel | pending | Generic invoke/emit contract |
| M5.7 Minimal behavior flow | pending | Event -> action/property runtime path |

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
- No Action/Event runtime yet.

## Next slice

**M5.6 Action/Event runtime kernel.**

Now that the Property-binding runtime gate is accepted, the next runtime abstraction can establish generic Action invocation and Event emission while preserving these boundaries:

```text
ComponentDefinition
  declares Action / Event public contract
        ↓
Runtime kernel
  invokes / emits by node id + contract name
        ↓
Component implementation
  Native now, configured/script implementation later
```

Action/Event runtime semantics must remain independent of visual `SceneConnection` anchors and must not require the complete Component Workbench Script Runtime yet.
