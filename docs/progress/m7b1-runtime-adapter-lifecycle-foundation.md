# M7B1 — Protocol-neutral runtime adapter lifecycle foundation

Status: implementation complete · review gate

Date: 2026-08-31

## Goal

Establish production-grade lifecycle, error, reconnect, and command-delivery semantics around the already accepted host boundaries before selecting a concrete transport.

The architectural boundary remains:

```text
external telemetry
        ↓ protocol-specific RuntimeAdapterTransport
ManagedRuntimeAdapter
        ↓ RuntimeDataSource
RuntimeValueStore / compiled SCADA runtime

SCADA Interaction effect
        ↓ ScadaDeviceActionDispatcher
ManagedRuntimeAdapter
        ↓ current protocol-specific connection
external platform / device command
```

M7B1 deliberately does **not** choose MQTT, WebSocket, HTTP, or a vendor SDK.

## Why the existing host interfaces stay unchanged

The existing contracts already express the correct runtime direction:

```text
RuntimeDataSource.start(RuntimeValueStore) -> stop
ScadaDeviceActionDispatcher.dispatch(invocation)
```

Transport lifecycle is an infrastructure concern. Adding reconnect state, URLs, credentials, protocol topics, or queues to these generic SCADA runtime contracts would leak adapter concerns into the product/runtime model.

M7B1 therefore adds an outer lifecycle owner instead of widening those interfaces.

## Managed runtime adapter contract

`src/runtime/managed-runtime-adapter.ts` introduces:

- `ManagedRuntimeAdapter`
- `RuntimeAdapterTransport`
- `RuntimeAdapterConnection`
- `RuntimeAdapterRetryPolicy`
- `RuntimeAdapterDelay`
- immutable status snapshots and status subscriptions
- explicit issue reporting for connection/dispatch/close/retry failures

The adapter exposes the two accepted host capabilities:

```text
adapter.dataSource
adapter.actionDispatcher
```

Protocol implementations only need to implement the narrow transport connection factory and connection operations.

## Lifecycle semantics

The managed state machine is:

```text
stopped
   ↓ start
connecting
   ├─ success ─────────────→ connected
   └─ failure → retrying ──→ connecting
                    └──────→ failed   policy says stop

connected
   ├─ connection lost → retrying → connecting
   └─ stop ─────────────────────→ stopped

failed
   └─ RuntimeDataSource stop ───→ stopped
```

Status exposes:

- state
- connection attempt number
- consecutive failure count
- last error message

A successful connection resets consecutive failure count and clears the last error.

## Inbound telemetry semantics

A transport publishes one immutable scalar batch through its connection context.

The managed adapter applies one batch with:

```text
RuntimeValueStore.setMany(batch)
```

Therefore one transport batch is one runtime-value publication/source transaction.

Connection-attempt fencing prevents stale callbacks from an old failed/disconnected connection from mutating the RuntimeValueStore after retry or stop.

## Outbound command semantics

Outbound SCADA effects remain typed `ScadaDeviceActionInvocation` values.

Delivery rules are intentionally conservative:

- dispatch is allowed only while a live connection is in `connected`
- dispatch while stopped/connecting/retrying/failed is rejected and reported
- rejected commands are **not queued**
- transport dispatch failures are reported
- failed commands are **not automatically replayed** after reconnect

This avoids accidental duplicate device/platform effects. A later concrete adapter may implement stronger delivery guarantees only when the external protocol can define idempotency/correlation semantics explicitly.

## Stop and stale-session safety

Stopping the RuntimeDataSource:

- aborts in-flight connect/retry work
- closes the current connection when present
- prevents old connection callbacks from publishing values
- moves status to `stopped`
- is idempotent through the returned RuntimeDataSource stop handle

`RuntimeAdapterTransport.connect()` is required to observe the provided `AbortSignal` so protocol code cannot retain connection work indefinitely after runtime shutdown.

## Deterministic verification

`scripts/check-runtime-adapter-lifecycle.ts` covers:

- initial connection lifecycle
- atomic inbound multi-value publication
- normal connected outbound dispatch
- connection loss and policy-driven retry
- stale old-connection publication rejection
- outbound rejection during retry with no queue/replay
- reconnection and fresh inbound publication
- observable asynchronous dispatch failure
- stop abort/connection close/stale publication fencing
- idempotent stop handle
- retry exhaustion entering terminal `failed`
- outbound rejection while failed
- invalid adapter id rejection

The check is part of the normal CI runtime-model verification set.

## Boundary / non-goals

M7B1 does not add:

- MQTT/WebSocket/HTTP transport selection
- broker/topic/URL configuration in Scene or Component contracts
- credentials in component packages
- automatic command queueing or replay
- command persistence
- exactly-once delivery claims
- telemetry persistence/history
- production publication-backend deployment
- backend ownership of runtime evaluation

## Review gate

M7B1 is accepted only after Build, the deterministic lifecycle fixture, existing runtime/model regressions, and Lint pass in PR CI.

After acceptance, M7B2 should evaluate and select the **first concrete production transport** against this generic lifecycle contract rather than modifying component or scene semantics first.
