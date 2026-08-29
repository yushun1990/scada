# SCADA Backend

The backend is intentionally a thin **component package publication/distribution service**. It does not own SCADA runtime evaluation, component rendering, DSL execution, local authoring state, or device presentation state.

M6.7B1 established immutable publication revisions. M6.7B2 connected public retrieval, explicit offline installation, and explicit browser publication without making the backend a prerequisite for local authoring or runtime evaluation.

## Runtime boundary

```text
Component Workbench
        ↓ local Save / ready state
IndexedDB
        ↓ explicit Publish
SCADA Publication API
        ↓ immutable published revision
PostgreSQL

remote consumer
        ↓ public retrieval
client package validation
        ↓ explicit install / offline cache
existing ComponentRegistration / ComponentRegistry activation path
```

`ready` is a local authoring/runtime-eligibility state. It is **not** a synonym for remotely published.

## Publication API

Public reads:

- `GET /health`
- `GET /api/component-publications`
- `GET /api/component-publications/:componentType`
- `GET /api/component-publications/:componentType/revisions/:revision`

Browser publication authentication:

- `GET /api/auth/session`
- `POST /api/auth/login`
- `POST /api/auth/logout`

Authenticated publication:

- `POST /api/component-publications/:componentType/revisions`

### Browser publisher session

The public frontend never receives `SCADA_ADMIN_TOKEN`.

The accepted M6.7B2C browser path is:

```text
configured publisher username/password
        ↓ HTTPS login from an allowed Origin
server verifies identity
        ↓
opaque random session id
        ├─ browser: HttpOnly cookie
        └─ PostgreSQL: SHA-256 hash + identity + expiry
        ↓
explicit Publish with credentials: include
```

The current narrow self-hosted publisher identity is configured with:

- `SCADA_PUBLISH_USERNAME`
- `SCADA_PUBLISH_PASSWORD`

This establishes the browser/session/identity boundary for the current product stage. It is intentionally replaceable and is not a commitment to the final production IAM model.

Browser login/logout and session-authenticated publication require an allowed request `Origin`. CORS credentials are enabled only for configured origins, but CORS is not treated as the write-authorization boundary.

### Server / operations publisher

`SCADA_ADMIN_TOKEN`, when configured, remains a separate server/CI/operations channel:

```http
Authorization: Bearer <SCADA_ADMIN_TOKEN>
```

It must never be embedded into the public frontend bundle.

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

For an existing component type, `baseRevision` is the last remote revision the publisher explicitly observed as current.

Rules:

- first publication requires `baseRevision: null`
- a successful first publication creates revision `1`
- each later successful publication creates `baseRevision + 1`
- stale `baseRevision` returns `409 publication_conflict` with `currentRevision`
- browser conflict handling does not silently overwrite, refresh, or retry
- adopting a newer base requires an explicit remote-state refresh
- `requestId` is an idempotency key
- retrying the same requestId + same publisher/type/base/package returns the original revision
- reusing the same requestId with different publication input or publisher identity returns `409 idempotency_conflict`
- published revisions are never updated or deleted by the publication API

The browser stores the last observed remote revision separately from local `ComponentLibraryEntry` authoring state. A successful Publish advances that observation; a conflict does not.

## PostgreSQL model

Publication authority:

```text
component_publication_revisions
├─ revision_id       immutable revision identity
├─ request_id        unique idempotency identity
├─ component_type
├─ revision          monotonic integer per component type
├─ base_revision
├─ title             list/head projection
├─ package           JSONB immutable package payload
├─ published_by      publisher identity
└─ published_at
```

Browser publication sessions:

```text
publication_sessions
├─ session_hash      SHA-256 hash of opaque browser session id
├─ subject           publisher identity
├─ display_name
├─ expires_at
└─ created_at
```

The raw browser session id is not persisted in PostgreSQL.

`UNIQUE(component_type, revision)` protects revision identity. Per-request and per-component transaction advisory locks serialize concurrent retries/publishers before optimistic-concurrency decisions are made.

The server stores packages as JSONB rather than decomposing private visual layers or future implementation details into relational tables. Full component runtime validation remains a client/package responsibility before a retrieved artifact enters the existing activation path; the server validates the publication envelope and basic package/type consistency rather than becoming SCADA runtime authority.

## Deployment state — M6.7B3 decision: defer deployment

M6.7B3 reviewed the current frontend/API topology, browser cookie boundary, deployment assets, publisher credentials, PostgreSQL lifecycle and browser verification requirements and explicitly chose **defer production deployment**.

The reason is operational readiness rather than an architectural rejection of the publication backend:

- the GitHub Pages build does not yet set `VITE_PUBLICATION_API_URL`
- no current production API hostname or accepted same-site frontend/API topology is recorded
- the historical GitHub Pages -> separately hosted API topology would be cross-site and must not assume third-party-cookie availability
- the deploy script provisions only PostgreSQL credentials and `SCADA_ADMIN_TOKEN`; it does not yet provision the B2C browser publisher credentials or intentionally configure the production session-cookie policy
- the PostgreSQL volume is persistent, but no production backup / restore-verification / migration-preflight procedure is accepted
- TLS termination and the production trusted-Origin/CORS values remain outside the current repository contract
- minimum production monitoring/alerting and failure-diagnostic expectations are not yet accepted

`.github/workflows/deploy-backend.yml` therefore remains `workflow_dispatch` only. Do not restore a `push` trigger while this decision remains deferred.

Production deployment may be reconsidered only after the reopening conditions in `docs/progress/m6.7b3-production-deployment-decision.md` are intentionally satisfied, including an end-to-end browser flow:

```text
Login
  -> explicit Publish
  -> public retrieval
  -> explicit install
  -> local/offline cache
  -> offline Scene activation
```

CI remains the authority for the publication API/browser-auth contract while production infrastructure is deferred. It continues to use ephemeral PostgreSQL and Fastify to verify session creation/revocation, trusted-Origin enforcement, publisher-bound idempotency, optimistic-concurrency conflicts, immutable retrieval, and the separate administrator operations channel.

## Deployment topology note

The historical deployment shape was:

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

Those Quadlet/deploy assets remain useful infrastructure evidence, but this topology crosses site boundaries when the frontend remains on `github.io`. Production must not assume third-party-cookie availability. Prefer a same-site/custom-domain frontend + API topology where practical, or explicitly smoke-test the chosen cross-site cookie configuration before a future **deploy now** decision.