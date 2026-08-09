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
| M5.1 RuntimeValueStore | implementation complete · PR #40 | Runtime-only immutable observable value store, independent of scene/history |
| M5.2 DataBinding + effective props | pending | Runtime values override bindable properties without mutating authored props |
| M5.3 Preview runtime lifecycle | pending | Preview owns runtime start/stop and subscriptions |
| M5.4 Mock data source | pending | Deterministic mock values/generators feed RuntimeValueStore |
| M5.5 Minimal binding UI | pending | SCADA user binds only exposed bindable properties |
| Runnable Runtime v0.1 gate | pending | Mock value visibly drives `indicator.status` in Preview |
| M5.6 Action/Event runtime kernel | pending | Generic invoke/emit contract |
| M5.7 Minimal behavior flow | pending | Event -> action/property runtime path |

## M5.1 RuntimeValueStore

Tracking: PR #40, based on `main` after roadmap sync merge `1854ba54acc5031bad185a4604630c1f97e43440`.

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

The runtime state boundary now starts as:

```text
External / Mock source
        ↓
RuntimeValueStore
        ↓ immutable runtime snapshot
Binding / Preview consumers (next slices)
```

There is deliberately no path from `RuntimeValueStore` back into authored scene state.

### Not included

- No `DataBinding` model yet.
- No effective-props resolver yet.
- No Preview integration yet.
- No mock timer/generator yet.
- No UI yet.

Keeping these out of M5.1 makes the first runtime primitive independently reviewable and prevents runtime lifecycle concerns from leaking into the store.

## Next slice

**M5.2 DataBinding + effective component props.**

The next implementation must prove a generic resolver with this precedence:

```text
ComponentDefinition default
        ↓
SceneNode authored props
        ↓
Runtime binding override
        ↓
Effective props passed to renderer
```

The resolver must not special-case `indicator.status` or `pump.submersible` and must not mutate authored props.
