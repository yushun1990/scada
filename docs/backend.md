# SCADA Backend

The backend is intentionally a thin **component package publication/distribution service**. It does not own SCADA runtime evaluation, component rendering, DSL execution, local authoring state, or device presentation state.

M6.7B1 redesigns the source/API contract before any production deployment is resumed.

## Runtime boundary

```text
Component Workbench
        ↓ local save / ready state
IndexedDB
        ↓ explicit publication request
SCADA Publication API
        ↓ immutable published revision
PostgreSQL

remote consumer
        ↓ retrieve published revision
client package validation
        ↓
existing ComponentRegistration / ComponentRegistry activation path
```

`ready` is a local authoring/runtime-eligibility state. It is **not** a synonym for remotely published.

## Publication API

Public reads:

- `GET /health`
- `GET /api/component-publications`
- `GET /api/component-publications/:componentType`
- `GET /api/component-publications/:componentType/revisions/:revision`

Authenticated publication:

- `POST /api/component-publications/:componentType/revisions`

The publication endpoint currently uses the existing development/admin bearer-token boundary:

```http
Authorization: Bearer <SCADA_ADMIN_TOKEN>
```

A browser authentication/user identity model is intentionally deferred to M6.7B2. The admin token must not be embedded into the public frontend bundle.

## Publication request semantics

A publish request carries:

```json
{
  "schemaVersion": 1,
  "requestId": "client-generated-idempotency-key",
  "componentType": "custom.example",
  "baseRevision": null,
  "package": {
    "packageVersion": 1,
    "definition": {},
    "visual": {},
    "implementationDraft": ""
  }
}
```

For an existing component type, `baseRevision` is the last remote revision the publisher believes is current.

Rules:

- first publication requires `baseRevision: null`
- a successful first publication creates revision `1`
- each later successful publication creates `baseRevision + 1`
- stale `baseRevision` returns `409 publication_conflict` with `currentRevision`
- `requestId` is an idempotency key
- retrying the same requestId + same type/base/package returns the original revision
- reusing the same requestId with different publication input returns `409 idempotency_conflict`
- published revisions are never updated or deleted by the publication API

## PostgreSQL model

New publication authority:

```text
component_publication_revisions
├─ revision_id       immutable revision identity
├─ request_id        unique idempotency identity
├─ component_type
├─ revision          monotonic integer per component type
├─ base_revision
├─ title             list/head projection
├─ package           JSONB immutable package payload
└─ published_at
```

`UNIQUE(component_type, revision)` protects revision identity. Per-request and per-component transaction advisory locks serialize concurrent retries/publishers before optimistic-concurrency decisions are made.

The older mutable `components` table is deliberately left untouched in an existing database so the migration is non-destructive, but it is no longer the authority for the M6.7B publication API.

The server stores the package as JSONB rather than decomposing private visual layers or future implementation details into relational tables. Full component runtime validation remains a client/package responsibility before a retrieved artifact enters the M6.7A activation path; the server validates the publication envelope and basic package/type consistency rather than becoming SCADA runtime authority.

## Deployment state

Deployment assets still exist under `deploy/`, but M6.7B1 does **not** provision or resume a production backend.

CI instead starts PostgreSQL 16 and the Fastify service ephemerally and verifies:

- revision 1 publication
- idempotent retry
- idempotency-key reuse rejection
- stale base-revision conflict
- revision 2 publication
- latest revision lookup
- immutable revision 1 retrieval after revision 2 exists

Production deployment belongs to M6.7B2 only after the browser authentication/retrieval integration decision is reviewed.

## Historical deployment topology

The previous deployment used:

```text
GitHub Pages
    |
    | HTTPS
    v
system Nginx :443
    |
    v
127.0.0.1:3000
SCADA API (rootless Podman)
    |
    v
PostgreSQL (rootless Podman)
```

The Quadlet/deploy scripts remain useful infrastructure evidence, but they must not be treated as the current product contract until M6.7B2 explicitly accepts a deployment path.
