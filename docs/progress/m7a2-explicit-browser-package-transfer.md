# M7A2 — Explicit browser component package export / import

Status: accepted · 2026-08-30

## Goal

Complete the portable-package browser workflow established by M7A1 without introducing a publication-backend dependency:

```text
ready local ComponentLibraryEntry
        ↓ explicit export
M7A1 transport-neutral package
        ↓ file transfer
fresh browser
        ↓ parse + validate + collision preflight
explicit confirmation
        ↓
ComponentRepository persistence
        ↓
normal component activation path
```

## Accepted result

PR #98 (`feat: add explicit browser component package transfer`) implemented the M7A2 product path.

### Export

- export is explicit from Component Library
- only local, non-built-in `ready` components expose export
- export uses the shared M7A1 distributable package codec
- the downloaded document contains only the transport-neutral artifact
- local repository identity, local authoring status/timestamp, and `builtIn` metadata do not cross the package boundary

### Import

- file selection performs parse/validation and a read-only collision preflight first
- selecting a file does not persist, activate, or overwrite anything by itself
- an explicit user confirmation is required before mutation
- a successful import receives a fresh local repository id and becomes a local editable `ready` component
- persistence goes through the normal `ComponentRepository` / IndexedDB boundary
- activation reuses the existing generic runtime activation refresh

### Collision policy

Import fails closed when the package Component Type collides with any of:

- built-in component type
- local-authored component type
- installed-remote component type

Import never silently overwrites another component and never mutates installed-remote provenance.

## Deterministic verification

`scripts/check-component-package-transfer.ts` verifies the side-effect-free import plan and all three collision classes.

The deployed-browser smoke verifies the complete portable workflow:

```text
browser A ready local component
        ↓ export file
browser B fresh IndexedDB
        ↓ explicit import confirmation
persisted local component
        ↓ generic activation
SCADA palette
        ↓ repeat same import
collision rejection with no mutation
```

PR #99 repaired only hydration timing in that new deployed smoke; it did not change runtime or product behavior.

After #99 merged, `main@029579a7396917b9cc9214cfb01278d075d60413` completed:

- Deploy GitHub Pages #232 — success
- Pages Browser Smoke #183 (`33288164839`) — success

This satisfies the final M7A2 acceptance requirement for deployed browser behavior.

## Boundary / non-goals

M7A2 does not:

- publish automatically
- require the publication backend
- activate on mere file selection
- overwrite same-type components
- bundle native renderer modules
- bundle external asset trees
- change remote revision semantics

Production publication-backend deployment remains deferred by the accepted M6.7B3 decision.

## Result

M7A portable-package baseline is accepted:

```text
canonical transport-neutral codec     M7A1
explicit browser file transfer        M7A2
```

The next M7 concern is the production runtime-adapter foundation, beginning with protocol-neutral lifecycle/error/reconnect semantics before choosing MQTT, WebSocket, HTTP, or another concrete transport.
