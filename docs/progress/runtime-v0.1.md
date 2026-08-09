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
| M5.4 Mock data source | implementation complete · PR #43 | Deterministic runtime data-source contract and indicator state-cycle source |
| M5.5 Minimal binding UI | pending | SCADA user binds only exposed bindable properties |
| Runnable Runtime v0.1 gate | pending | Mock value visibly drives `indicator.status` in Preview |
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

Tracking: PR #43, based on `main` after M5.3 merge `46db2b6c98257abd7059e238fd4e80904ec07e40`.

### Completed

- Added renderer-independent `RuntimeDataSource` and stop contracts.
- Added `createSequenceMockDataSource` as the first deterministic generator.
- Sequence sources validate that at least one value exists and that the interval is positive.
- Preview Runtime now owns source start/stop together with its existing lease lifecycle.
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

### Not included

- No binding editor UI yet, so scene components do not consume the mock key unless a binding already exists in scene JSON.
- Additional manual/toggle/ramp/sine generators remain follow-up additions after the first runnable gate proves the source contract.
- No Action/Event runtime yet.

## Next slice

**M5.5 Minimal binding UI + first runnable Runtime v0.1 gate.**

The next implementation must let a SCADA Workbench user bind an exposed `bindable` Property to the known mock runtime key without seeing component internals. The acceptance path is:

```text
indicator.status.state
        <- mock.indicator.state
        ↓
enter Preview
        ↓
off / normal / warning / alarm cycle
        ↓
visible indicator changes automatically
```

Returning to Designer must restore the authored `state` value and runtime updates must not create editor history entries.
