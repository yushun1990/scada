# M7B2 — First concrete production transport selection

Status: accepted decision · defer concrete transport · 2026-08-31

## Decision

Do **not** implement MQTT, WebSocket, HTTP/SSE, or a vendor-specific production adapter yet.

M7B2 is accepted as a deliberate **defer concrete transport until a real integration target exists** decision.

This is not a rollback of M7B. M7B1 remains useful and complete: it established the protocol-neutral production lifecycle/error/reconnect boundary so a real adapter can be added later without changing Component or Scene semantics.

## Why no concrete transport is justified today

The repository currently has no accepted external runtime integration target that defines all of the following:

- actual telemetry/platform endpoint
- browser-direct versus gateway/backend deployment topology
- authentication and credential ownership
- external value/address naming
- inbound batching/update semantics
- outbound Action command mapping
- command correlation/idempotency expectations
- protocol-specific reconnect/subscription/session behavior

The project remains browser-first and intentionally keeps IoT access/protocol details outside reusable Component APIs. The repository also contains no existing MQTT or WebSocket protocol commitment that should be preserved.

Choosing a transport now would therefore require inventing a product-external protocol before its consumer exists.

## Alternatives considered

### MQTT over WebSocket

Rejected **for now**, not rejected permanently.

It is familiar in SCADA/IoT systems and supports bidirectional traffic, but a useful implementation still needs broker topology, topic conventions, authentication, QoS/session policy, payload schema, retained-message rules, and command idempotency semantics.

Adding an MQTT client today would make those invented choices look architectural when they are actually integration-specific.

### Raw WebSocket + JSON

Rejected **for now**, not rejected permanently.

It is browser-native and maps cleanly onto `ManagedRuntimeAdapter`, but the transport itself does not define message envelopes, authentication, subscriptions, value identity, Action invocation acknowledgements, or idempotency. Implementing it now would mostly mean inventing a private protocol.

### HTTP polling / SSE + HTTP command

Rejected **for now**, not rejected permanently.

SSE is browser-native for inbound streaming, but outbound Actions need a separate request channel. Polling adds timing/load semantics. Both approaches still require an actual API contract and authentication topology.

### Vendor/platform SDK

Cannot be selected without a concrete target platform.

## Accepted architecture after M7B2

The stable boundary remains:

```text
real external integration
        ↓
protocol-specific RuntimeAdapterTransport       chosen later
        ↓
ManagedRuntimeAdapter                           accepted M7B1
        ├─ RuntimeDataSource
        │      ↓
        │  RuntimeValueStore
        │
        └─ ScadaDeviceActionDispatcher
               ↓
          external command
```

No protocol configuration enters:

- Component public Properties / Actions / Events / Anchors
- distributable component packages
- Scene semantic contracts
- publication-server contracts

A host/application integration layer will own concrete adapter configuration when a target exists.

## Reopening trigger

Concrete transport implementation should restart only when at least one real integration target can answer:

1. **Endpoint/topology** — what system does the browser/runtime actually connect to?
2. **Authentication** — who owns credentials/tokens and how are they refreshed?
3. **Inbound mapping** — how do external values map to RuntimeValueStore keys and batches?
4. **Outbound mapping** — how does a typed `ScadaDeviceActionInvocation` become an external command?
5. **Reconnect semantics** — what state/subscriptions must be restored after reconnect?
6. **Delivery semantics** — can commands be correlated or made idempotent, and what acknowledgements exist?
7. **Deployment constraints** — browser CORS/CSP/TLS/proxy/broker limitations and production hosting topology.

When those answers exist, select the narrowest adapter that fits them and test it against the already accepted M7B1 lifecycle fixture model.

## Why this is the safer sequencing decision

A speculative concrete adapter provides little new evidence: M7B1 has already proven the host lifecycle contract.

A reusable component set, by contrast, exercises accepted public Component APIs, visual composition, runtime value bindings, Actions/Events, packaging, import/export, persistence, and activation without inventing external infrastructure.

Therefore the M7 implementation sequence advances to M7C.

## Result

```text
M7B1 generic lifecycle foundation      accepted
M7B2 concrete transport selection      accepted decision: defer until target exists
M7C reusable component set             NEXT
```

This decision must be revisited when a real production integration target appears; it must not be interpreted as a permanent ban on MQTT, WebSocket, HTTP/SSE, or vendor adapters.
