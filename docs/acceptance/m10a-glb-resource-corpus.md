# M10A GLB/resource corpus contract

- Status: `active` — fixture specification for review, not an executed corpus.
- Date: 2026-10-22; work item: `M10A-RESOURCE`; finding: `R3D-004`.
- Profile and validation stages: [M10A resource proposal](../architecture/adr-m10a-glb-resource-profile.md).
- Base: `main@9b483b5962c1ca6fcdabda3628b96eee7cfd7aa0`.

## Evidence boundary

This document specifies reproducible inputs and expected outcomes. No GLB
validator, binary fixture files, decoder experiment or browser/security pass is
delivered by this docs-only change. The current package draft accepts metadata
only and cannot run these admission assertions.

M10A builds disposable fixture bytes for its spike. After M10A acceptance, M10B
must run the corpus against production codec/ingest exports without React or a
GPU; M10D adds loader/network/disposal observations. A test-only reimplementation
of validation is not evidence. Candidate limits are imported from the eventual
profile authority, not copied into a second policy algorithm.

## Fixture and diagnostic convention

Each executable case must record its ID, profile revision, generation recipe,
source-license/provenance, byte length, SHA-256, expected stage/code/location,
actual result and tested repository revision. Commit small deterministic
fixtures or their generator plus independently checked expected bytes. Generate
large/hostile inputs in a bounded temporary directory; never download an
untrusted sample or allocate its claimed size just to test rejection.

Use candidate diagnostics `{ code, stage, path, limit?, observed? }`. `path` is
a JSON pointer or byte offset, bounded and escaped for plain-text display; it
must not echo embedded payloads. Codes below are a proposed future contract,
not diagnostics already exported by the repository. One failure is sufficient;
if multiple stages fail, report the earliest stage in the proposal's sequence.
Within a stage, fixtures assert membership of the relevant code rather than
depending on incidental traversal order. Cap collected diagnostics at 32.

Start each mutation from a valid positive control. For stages 3–5, recompute the
outer manifest length/digest after mutation so the test reaches the intended
failure instead of accidentally passing on an earlier hash mismatch. Identity
tests deliberately retain the stale digest. All rows with multiple variants
require a separate executable case for every listed variant.

## Positive controls

| ID | Input | Required observation |
| --- | --- | --- |
| P01 | Minimal triangle, aligned JSON/BIN, one buffer, no URI/extensions | Admission succeeds; sidecar node/material targets resolve; source digest unchanged |
| P02 | P01 with one small embedded PNG, then a separate JPEG case | Correct decoded dimensions; no external-resource resolution |
| P03 | P01 with a core node-rotation animation and stable `extras.scadaId` | Clip/node targets resolve without renderer UUIDs or public Property writes |
| P04 | Legal BIN padding lengths 0, 1, 2 and 3; valid interleaved attributes | No false rejection of the published baseline's padding or accessor layout |
| P05 | Two component references to the same model digest, one byte-map entry | Exact closure succeeds; verified shared ownership, no duplicate persistent resource |
| P06 | Each applicable candidate maximum minus one, maximum and maximum plus one | The first two pass if other constraints hold; plus one reports the corresponding limit, with bounded test generation |

P01–P04 also need a pinned independent conformance-validator report. P06 must
separate metadata counters from real decode measurements; a fake size declaration
does not prove the browser can decode the boundary-sized resource. Where other
limits make a maximum unreachable, record that relationship and test the first
binding constraint instead of manufacturing an invalid positive control.

## Negative and failure corpus

Stages: **1** envelope/reservation; **2** identity/closure; **3** container/syntax;
**4** semantic/budget admission; **5** decode/staging; **6** commit/abort.

| ID | Mutation / input family | Stage · expected code |
| --- | --- | --- |
| N01 | Unsupported manifest MIME; uppercase/short/non-hex digest; fractional, negative, zero or unsafe-integer byte length | 1 · `RESOURCE_MANIFEST_INVALID` |
| N02 | Encoded GLB/package size or resource count above configured ceiling; actual incoming bytes exceed the configured read ceiling | 1 · `RESOURCE_INPUT_LIMIT` |
| N03 | Duplicate manifest digest or duplicate transport resource key; conflicting MIME/length for one identity | 1 · `RESOURCE_DUPLICATE` |
| N04 | Actual byte length differs from manifest while both remain within configured input ceilings | 2 · `RESOURCE_LENGTH_MISMATCH` |
| N05 | Flip one byte with unchanged expected digest; corrupt a cached resource | 2 · `RESOURCE_DIGEST_MISMATCH` |
| N06 | Referenced digest missing from manifest or byte map; unused manifest entry; unlisted extra bytes entry | 2 · `RESOURCE_CLOSURE_MISMATCH` |
| N07 | Truncated header at every boundary; wrong magic; version 1 or future version | 3 · `GLB_HEADER_INVALID` / `GLB_VERSION_UNSUPPORTED` |
| N08 | Wrong total length; truncated chunk header/body; unaligned chunk; invalid padding; trailing bytes | 3 · `GLB_LENGTH_INVALID` / `GLB_CHUNK_INVALID` |
| N09 | BIN before JSON; missing/duplicate JSON or BIN; unknown chunk | 3 · `GLB_CHUNK_INVALID` |
| N10 | Invalid UTF-8/JSON; duplicate key; non-object root; excessive JSON bytes/depth | 3 · `GLB_JSON_INVALID` / `GLB_JSON_LIMIT` |
| N11 | JSON future `asset.version`/`minVersion`; wrong field types; unknown schema fields | 4 · `GLTF_VERSION_UNSUPPORTED` / `GLTF_SCHEMA_INVALID` |
| N12 | Any buffer/image URI: empty, relative, `/`, `//`, HTTP(S), file, blob, data; escaped JSON spelling of the same keys/values | 4 · `GLTF_URI_FORBIDDEN` |
| N13 | Extra buffer; bufferView past declared buffer into padding; integer-overflow range; invalid buffer index | 4 · `GLTF_BUFFER_INVALID` |
| N14 | Accessor out of bounds, invalid stride/alignment/component type, mismatched attribute counts, index beyond vertex count, non-finite attribute/sample | 4 · `GLTF_ACCESSOR_INVALID` |
| N15 | Sparse accessor, skin, morph target, non-triangle primitive, embedded camera | 4 · `GLTF_FEATURE_UNSUPPORTED` |
| N16 | Unknown/known optional/required extension, undeclared nested extension, Draco/Meshopt/KTX2 payload | 4 · `GLTF_EXTENSION_FORBIDDEN` |
| N17 | Image URI plus bufferView; missing image MIME; unsupported image type; MIME/signature mismatch | 4 · `GLTF_IMAGE_INVALID` (URI variant: `GLTF_URI_FORBIDDEN`) |
| N18 | Huge PNG/JPEG dimensions in tiny encoded input; encoded image above ceiling; aggregate decoded image or texture-variant estimates above ceiling | 4 · `GLTF_IMAGE_LIMIT` |
| N19 | Node/primitive/accessor/material/texture/clip/channel count or expanded geometry/keyframe budget exceeded; include unused and aliased entries | 4 · `GLTF_MODEL_LIMIT`; reject before large value scans/materialization |
| N20 | Hierarchy cycle, multiple parents, missing child/scene root, excessive depth, non-finite transform or invalid animation target/time sequence | 4 · `GLTF_GRAPH_INVALID` / `GLTF_ANIMATION_INVALID` |
| N21 | Unknown extras/script/shader payload; duplicate/empty/oversized `extras.scadaId`; prototype-looking unknown key | 4 · `GLTF_METADATA_INVALID` |
| N22 | Sidecar imported-node/material/clip target absent in actual GLB; ambiguous stable-ID mapping on reimport | 4 · `GLTF_TARGET_UNRESOLVED` |
| N23 | Several individually admissible models/instance copies exceed live aggregate reservations; concurrent admission request | 1 or 4 · `RESOURCE_SESSION_LIMIT` / `RESOURCE_JOB_BUSY` |
| N24 | Signature/header valid but truncated or corrupt image payload; decode rejection or dimension disagreement | 5 · `GLTF_IMAGE_DECODE_FAILED` |
| N25 | Inject an unexpected loader resource resolution after validation | 5 · `RESOURCE_RESOLUTION_DENIED`; no actual request |
| N26 | Mutate caller-owned bytes after admission starts; swap byte map after hash; request reuse under another profile revision | 2–5 · immutable snapshot survives or explicit rejection; never consume changed/unvalidated bytes |
| N27 | Cancel during read/hash/decode, deliver a late completion from an old generation | 1–5 · `RESOURCE_CANCELLED`; stale result cannot publish/commit; non-interruptible decode retains its slot/reservation and rejects replacement work with `RESOURCE_JOB_BUSY` until settled and closed |
| N28 | Inject quota/write/transaction abort during import/reimport | 6 · `RESOURCE_COMMIT_FAILED`; old document/resources unchanged |
| N29 | Reload, unload or cancel after a successful stage; repeated load/unload | 5–6 · no stale handles/reservations; reference-count and disposal observations |

## Side-effect assertions

For every rejected fixture, assert no document/resource commit or registry
installation. Stages 1–4 invoke no image decoder, renderer constructor, object-URL
factory or resource resolver. Stage 5 uses only already validated slices; its
failure must close image handles and release reservations. Stage 6 rollback must
be tested against the actual repository transaction, not a mock of commit logic.

Network evidence must count attempted resolver calls **and** observed requests.
Run the later spike in Chromium and Firefox with resource requests intercepted,
including data/blob behavior that a normal HTTP-only log could miss. A browser
blocked request is still a failed no-fetch test. Record host-generated in-memory
URLs separately from forbidden model-authored URLs. Do not equate “offline
render succeeded” with proof that no hidden request was attempted.

Supplement the corpus with valid metadata that looks like a URL or HTML in a
permitted name: it remains bounded plain text and must never be resolved or
rendered as markup. Do not reject all strings with a colon as a substitute for
schema-aware URI checks.

## Closeout and deferred container evidence

The M10A report must link fixture hashes and source revisions, conformance
reports, actual spike results and measured boundary behavior. Mark unavailable
browser/native-decoder counters as unavailable; do not replace them with a
passing estimate. The decision record must explain each retained or revised
ceiling and the cost of excluded model features.

If a compressed transport is later selected, add path traversal (including
encoded/backslash forms), duplicate names, symlinks, nested archives, truncated
entries, claimed-vs-actual expansion and aggregate decompression cases before
implementing it. This proposal makes no archive-container acceptance claim.

M10B owns production malformed-input/closure/rollback results. M10D owns
renderer no-fetch, disposal and fresh-browser results. M10G adds fuzz/soak and
final performance evidence. None is replaced by this fixture specification.
