# M7 closeout — Packaging, adapter foundation and reusable components

Status: accepted / closed · 2026-08-31

## Accepted M7 outcome

M7 established three boundaries without coupling them together:

```text
Reusable Component authoring
        ↓
transport-neutral component package
        ↓
explicit browser transfer / optional publication

external runtime platform
        ↓
protocol-neutral ManagedRuntimeAdapter
        ↓
RuntimeDataSource + ScadaDeviceActionDispatcher

portable declarative packages
        ↓
local persistence + generic activation
        ↓
normal SCADA palette/runtime
```

The concrete production protocol remains intentionally deferred until a real target exists.

## Final acceptance evidence

M7C1 was the final implementation gate.

PR #102 merged as:

`main@247b66feb48195c25f43c82b6e07d22975e447ff`

Evidence on that revision:

- PR CI #724 (`33363931532`) passed after isolating the deterministic portable-package fixture from Vite-owned native assets
- main CI #725 (`33363995515`) passed Build, complete runtime/model checks, Lint and publication API regression
- Deploy GitHub Pages #235 (`33363995500`) passed
- Pages Browser Smoke #186 (`33364034832`) passed the complete deployed suite, including download/import/persistence/palette activation of all three starter packages

M7 is therefore closed; no open M7 implementation gate remains.

## Deferred items are not M7 failures

The following require a separate trigger and do not keep M7 open:

- concrete MQTT/WebSocket/HTTP/SSE/vendor adapter — reopen only with a real integration target
- production publication backend deployment — still governed by the accepted M6.7B3 `defer deployment` decision
- portable executable component Actions/Events — reopen only when a reusable component genuinely requires executable portable behavior
- richer Property-to-visual projections — reopen when an actual component cannot be expressed through current rules/animation semantics
- component catalog/marketplace UX — not needed for the current local-first baseline

## Post-M7 product audit

The audit followed the main user path:

```text
SCADA Works
  -> Edit
  -> Design / Preview
  -> Save or raw Scene JSON export
```

Current facts:

1. `App.tsx` exposes workspace, SCADA editor and component editor routes only. There is no standalone work/runtime route.
2. `ScadaEditorPage.tsx` has only editor-local `Design` and `Preview` modes.
3. Scene export writes the raw `SceneDocument` JSON.
4. `WorkspacePage.tsx` exposes only `Edit` for a work; there is no Run/Publish/Package action.
5. Scene v7 stores component nodes by `type`; it does not embed portable user-component definitions.
6. `parseSceneDocument()` resolves component types against the current live Studio registry and fails closed when a registration is absent.
7. Visual anchor validation also resolves definitions through the same live registry.

Therefore a raw `.scene.json` is not a portable runnable SCADA work when it references user components. On a fresh browser the component dependencies must already be installed and activated before the scene can even be validated.

## Next product direction

The next milestone should close this product boundary rather than add more sample components.

Proposed M8 direction:

> **Portable SCADA Work + Standalone Runtime**

Desired end state:

```text
saved SCADA work
    + required portable user-component packages
        ↓ explicit packaging
validated versioned work artifact
        ↓
explicit import / standalone runtime load
        ↓
read-only runnable SCADA surface
```

Built-in/native components remain host capabilities; portable user components can be embedded as dependency artifacts.

## First M8 gate

Do not begin with an export button.

The first necessary foundation is:

### M8A1 Registry-scoped Scene validation boundary — NEXT

Today Scene validation reads the mutable product-global component registry directly. That makes safe package preflight impossible: validating a candidate work with bundled user components would require mutating live application registrations first.

M8A1 should make Scene validation explicitly depend on a supplied component-definition/registry view while preserving the current default Studio path.

Acceptance should prove:

- existing Scene v1-v7 parsing/migration behavior remains unchanged through the default wrapper
- a caller can validate a Scene against an isolated candidate registry without mutating `studioComponentRegistry`
- component Property/Action/Event contract checks use the supplied registry
- connection Anchor validation uses the same supplied registry
- unknown component types fail closed in that scoped registry
- deterministic tests prove two registries can validate the same scene differently without cross-contamination

Only after that boundary is accepted should M8 define a transport-neutral work-package codec.
