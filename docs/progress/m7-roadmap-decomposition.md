# M7 roadmap decomposition

Status: accepted / closed · 2026-08-31

## Why M7 was split

The original M7 label combined three concerns with different dependency directions:

```text
portable component distribution
production runtime adapter boundary
reusable component proof set
```

M7 was therefore executed as M7A -> M7B -> M7C rather than as one broad feature batch.

## M7A — Portable component package boundary — accepted

### M7A1 Transport-neutral distributable package codec — accepted · 2026-08-30

Accepted result:

- versioned transport-neutral distributable component package
- valid non-built-in `ready` components only
- local repository identity/status/timestamps excluded
- deterministic parse / serialize / round-trip
- fail-closed validation
- publication reuses the same package semantics
- `implementationDraft` remains inert

Acceptance record: `docs/progress/m7a1-distributable-package-codec.md`.

### M7A2 Explicit browser export / import — accepted · 2026-08-30

Accepted result:

- explicit file export/import through the M7A1 codec
- file selection performs preflight without mutation
- explicit confirmation before persistence/activation
- deterministic collision rejection across built-in, local-authored and installed-remote types
- persistence through ComponentRepository / IndexedDB
- activation through the normal generic runtime path
- deployed browser-to-browser transfer smoke

Final M7A2 deployed evidence: Pages Browser Smoke #183 on `main@029579a7396917b9cc9214cfb01278d075d60413`.

Acceptance record: `docs/progress/m7a2-explicit-browser-package-transfer.md`.

## M7B — Production runtime adapter boundary — accepted foundation / concrete transport deferred

Production adapters plug into existing host interfaces:

```text
external telemetry / platform
        ↓
RuntimeDataSource
        ↓
RuntimeValueStore / compiled SCADA runtime

SCADA Interaction effect
        ↓
ScadaDeviceActionDispatcher
        ↓
external platform / device command
```

### M7B1 Protocol-neutral runtime adapter lifecycle foundation — accepted · 2026-08-31

Accepted semantics:

- stopped / connecting / connected / retrying / failed lifecycle
- injected retry policy and deterministic delay seam
- atomic inbound value batches through `RuntimeValueStore.setMany()`
- stale connection-attempt fencing after reconnect/stop
- outbound dispatch only while connected
- no silent outbound command queue/replay across reconnect
- observable connect/connection-loss/dispatch/close/retry failures
- stop aborts pending work and closes the live connection
- deterministic lifecycle regression in normal CI

Acceptance record: `docs/progress/m7b1-runtime-adapter-lifecycle-foundation.md`.

### M7B2 First concrete production transport selection — accepted decision · defer · 2026-08-31

Decision:

> Do not implement MQTT, WebSocket, HTTP/SSE, or a vendor adapter until a real integration target defines endpoint/topology, authentication, inbound mapping, outbound Action mapping, reconnect restoration, delivery/idempotency expectations, and browser/runtime deployment constraints.

M7B1 already provides the generic seam needed when that target appears. Concrete transport work may reopen independently; it is not a prerequisite for later browser/product milestones.

Decision record: `docs/progress/m7b2-production-transport-selection.md`.

## M7C — Reusable component proof set — accepted

### M7C1 Reusable portable starter package baseline — accepted · 2026-08-31

Accepted as actual M7A distribution artifacts under `public/component-packages/`:

- `starter.process-valve`
- `starter.running-motor`
- `starter.signal-quality`

The set proves:

- select / boolean / number Properties
- typed visual Anchors
- composite vector visuals
- Visual Rules
- property-gated Spin / Blink animation
- distributable package round-trip
- local persistence/hydration
- generic user-component activation
- deployed fresh-browser import and normal SCADA palette activation

Portable Actions/Events remain intentionally outside this slice because current ready user-package activation has no accepted executable implementation contract. Trusted built-ins continue to prove typed Actions/Events and host dispatch semantics.

Acceptance record: `docs/progress/m7c1-reusable-component-baseline.md`.

Final M7C1 evidence on `main@247b66feb48195c25f43c82b6e07d22975e447ff`:

- main CI #725 (`33363995515`) passed
- Deploy GitHub Pages #235 (`33363995500`) passed
- Pages Browser Smoke #186 (`33364034832`) passed, including the deployed reusable-package smoke

## Why M7 closes here

The accepted starter set did not demonstrate a blocking need for:

- arbitrary Property-to-text projection
- continuous numeric Property-to-visual projection
- portable executable Actions/Events
- automatic starter-package installation/catalog UX

Those remain legitimate future gaps, but creating an M7C2 without a concrete product use case would be roadmap inertia.

M7 therefore closes with:

```text
portable reusable component artifact              accepted
explicit browser transfer                         accepted
protocol-neutral production adapter lifecycle     accepted
concrete transport choice                         deferred until target
small reusable declarative proof set              accepted
```

Production publication-backend deployment remains separately deferred by M6.7B3.

## Post-M7 product gap discovered

The next material product boundary is not another component example.

A SCADA work currently has only:

- local IndexedDB persistence
- editor-local Design / Preview mode
- raw `.scene.json` export/import

There is no standalone runtime route or self-contained runnable work artifact.

More importantly, Scene v7 stores component nodes by component `type` and validates them against the live Studio component registry. A `.scene.json` that references a portable user component is therefore not dependency-complete on a fresh browser unless that component is installed/activated first.

This finding motivates the next roadmap gate: a portable SCADA work / standalone runtime boundary, beginning with registry-scoped Scene validation rather than mutating the live registry merely to preflight a candidate work package.

See `docs/progress/m7-closeout.md` and the current `PLAN.md` for the next gate.
