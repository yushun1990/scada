# M10A GLB and resource admission decision proposal

- Status: `active` — proposal for M10A review; no production admission capability is accepted by this document.
- Date: 2026-10-22.
- Work item: `M10A-RESOURCE`; finding: `R3D-004`. Defines prerequisites for `R3D-006`; does not close it.
- Base: `main@9b483b5962c1ca6fcdabda3628b96eee7cfd7aa0` (PR #226).
- Authority: [PLAN](../../PLAN.md), [3D architecture: Resource authority](3d-scene-editor.md#resource-authority), [M10 governance](../governance/m10-3d-delivery-governance.md), [M10A acceptance](../acceptance/m10-3d-acceptance-matrix.md#m10a-acceptance).
- Companion: [resource corpus contract](../acceptance/m10a-glb-resource-corpus.md).

## Decision and limits of authority

Propose a deliberately narrow first profile, `m10a-glb-core-embedded-1`, for the
disposable rendering spike: GLB 2.0, embedded geometry and PNG/JPEG images,
no glTF extensions and no separately downloaded decoders. The profile is an
experiment identifier, not a new persisted package field. Existing Scene v8,
Component Package v2 and Work Package v1 retain their accepted behavior.

The numbers below are candidate input ceilings for reproducible experiments.
They are **not measured safe limits or accepted M10D–M10G performance budgets**.
M10A closeout must attach fixtures, target environments and measurements, then
accept or revise this profile. No production codec, resource repository,
renderer dependency or gate transition is authorized here.

## Threats and trust boundaries

All supplied bytes and metadata are untrusted, including a locally selected
file, a previously cached resource, its MIME, filename, digest, declared sizes,
model names, extensions and imported IDs. A matching digest establishes byte
identity against the supplied manifest; it does not authenticate the publisher.

| Boundary / threat | Required control | Evidence owner |
| --- | --- | --- |
| File or package claims a harmless type | Bounded byte inspection and exact type/profile checks before loader invocation | M10B ingest |
| Embedded reference triggers network, local-file or blob access | Reject URI-bearing resources before loading; deny loader resolution outside validated bytes | M10B admission; M10A spike and M10D browser observation |
| Small input expands into excessive allocations or work | Pre-decode structural/decoded-size budgets, aggregate reservations and cancellable jobs | M10A measurement; M10B validator; M10D lifecycle |
| Extension, metadata or model text gains execution authority | Empty extension allowlist; bounded inert metadata; no source/plugin evaluation | M10B validation; M10D adapter |
| Manifest and bytes diverge, or a resource changes after validation | Exact closure plus immutable byte snapshot and digest verification | M10B package/repository |
| Failure leaves partial documents, resources or stale renderer state | Staging, atomic commit, cancellation generation and explicit disposal | M10B persistence; M10D runtime |
| Model IDs silently redirect authored targets on reimport | Validate sidecar against actual imported targets; reject ambiguity | M10B/M10C contract; M10E reimport |

Browser image decoders and a later pinned renderer remain trusted host code with
their own vulnerability and allocation risks. A byte-count estimate is not a
proof of total browser/GPU memory use. Admission, renderer disposal and measured
browser behavior are separate evidence.

## Format and decoder profile

The source baseline is the published [Khronos glTF 2.0.1 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html),
which identifies source commit `8e798b02d254cea97659a333cfcb20875b62bdd4`.
GLB uses a 12-byte little-endian header (`glTF` magic, version, total length),
followed by aligned chunks; JSON precedes the optional BIN chunk. The first
buffer can refer to BIN by omitting its URI. In this published baseline, BIN
padding may exceed that buffer's declared length by at most three bytes.
GLB itself can still reference external resources. See its
[binary layout](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#binary-gltf-layout)
and [GLB-stored buffer rules](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#glb-stored-buffer).

The following restrictions are **this proposal's policy**, including rejections
of otherwise valid glTF assets. They are not claims that glTF requires this subset.

| Surface | Candidate admission policy |
| --- | --- |
| Version | GLB header version exactly `2`; JSON `asset.version` exactly `2.0`; `asset.minVersion` absent or exactly `2.0`. Reject future versions explicitly. |
| MIME | Manifest MIME exactly `model/gltf-binary`; filename is never authority. Local file MIME may be empty or `application/octet-stream` and is classified from validated bytes; any other conflicting nonempty type fails. |
| Container | Exactly one JSON chunk and one BIN chunk, in that order; exact total length; 4-byte alignment; JSON space padding and BIN zero padding. Reject unknown/duplicate chunks and trailing bytes. A geometry-free JSON-only GLB is outside this first profile. |
| JSON | Bounded UTF-8 object; reject duplicate keys, invalid UTF-8, non-finite values, invalid schema fields/types, excessive depth and unknown properties outside the explicit metadata policy. Do not repair malformed source silently. |
| Resources | Exactly one buffer, backed by BIN. Reject the presence of every `buffers[*].uri` and `images[*].uri`, including empty, relative, root-relative, protocol-relative, HTTP(S), file, blob and data forms. No URL normalization or fetch fallback. |
| Images | Embedded `bufferView` only; MIME exactly `image/png` or `image/jpeg`, checked against signature and decoded format. Reject SVG, WebP, GIF, KTX2, animated images, conflicting MIME and invalid/truncated payloads. |
| Extensions | `extensionsUsed`/`extensionsRequired` absent or empty, and no nonempty `extensions` map anywhere. Reject even optional extensions; never ignore them and render a partial interpretation. |
| Decoders | No Draco, Meshopt, Basis/KTX2 or external WASM decoder. PNG/JPEG use host browser decoding after header/budget checks. Exact Three/R3F versions and browser decode path remain spike decisions; this PR adds no dependencies. |
| Initial geometry | Triangle primitives, ordinary accessors (including valid interleaving), core materials and node TRS animation. Reject sparse accessors, skins, morph targets, non-triangle modes and embedded cameras for this experiment. No animation of public semantic Properties. |
| Metadata | Core names/generator/copyright are bounded inert text. Permit only node `extras.scadaId` as a bounded nonempty string; reject other `extras` members/locations and unknown executable-looking fields. Never insert model text as HTML or pass metadata through a plugin dispatcher. |

Model transforms and animation samples must be finite, references valid and
hierarchies bounded/acyclic. Invalid accessor indices, strides, ranges and
attribute counts must fail before renderer allocation. No source transform or
camera automatically becomes Scene3D runtime-camera or authored Scene state.

`extras.scadaId` is only an importer hint: it must be unique within the model,
must not override Scene IDs and cannot resolve an ambiguous reimport. The
presentation sidecar's imported-node, material and clip targets must resolve
against the validated model, not merely against other sidecar strings.

## Candidate quantitative ceilings

Use `MiB = 1,048,576 bytes`. All sizes, offsets, indices and counts must be safe
integers; check sums/products before allocation. Every limit applies to actual
input as well as declarations. The maximum is inclusive. Exceeding any limit
rejects the whole input; do not downsample, truncate or omit a referenced object.

| Quantity | Candidate ceiling | Scope / measurement obligation |
| --- | --- | --- |
| Encoded GLB bytes | 32 MiB | Per unique model; check before reading the full file |
| JSON chunk / depth / individual metadata string | 2 MiB / 64 / 4 KiB UTF-8 | Bound parse work, including ignored display metadata |
| Logical package input / resource count | 128 MiB / 128 | Unique resource bytes plus manifest/document bytes; not a selected archive format |
| Nodes / hierarchy depth | 4,096 / 64 | Per model, including unselected scenes and unused nodes |
| Mesh primitives / accessors / buffer views | 2,048 / 8,192 / 8,192 | Per model, including unused entries |
| Vertex attribute elements / index elements | 1,000,000 / 3,000,000 | Per accessor; also subject to total expanded geometry below |
| Materials / textures / images | 256 / 64 / 64 | Per model; repeated material slots do not bypass texture reservations |
| Encoded image bytes | 8 MiB | Per image slice, within the GLB byte ceiling |
| Image width / height / pixels | 4,096 / 4,096 / 16,777,216 | Per image; all three checks required before decode and confirmed afterward |
| Decoded image estimate | 64 MiB per image; 128 MiB aggregate | RGBA8 estimate `width × height × 4`, summed over unique decoded image sources per model |
| Texture upload estimate including mips | 192 MiB aggregate | Per model; sum each independently allocated texture variant's mip chain |
| Expanded geometry and animation estimate | 64 MiB aggregate | Per model; account for deinterleaving/copies, index expansion and animation arrays |
| Clips / animation channels / keyframes | 128 / 1,024 / 1,000,000 | Per model totals, including interpolation output expansion |
| Active admission jobs | 1 | A cancelled job releases its reservation before another begins |
| Session accounted live resource bytes | 512 MiB | Sum retained source bytes, CPU decoded/copy estimates, GPU upload estimates and pending reservations across models/instances |

The session figure is an accounting ceiling, not a JS heap or GPU-memory claim.
Sharing may be counted once only when the adapter actually shares that resource;
per-instance copies and pending loads count separately. Cache hits cannot bypass
session reservations. Decoder working memory and driver overhead require the
later measured headroom decision.

PNG/JPEG are compressed inputs even though geometry compression is excluded.
Bound encoded bytes, dimensions and decoded growth independently: a compression
ratio alone cannot admit an image. Reject a header/decode dimension disagreement,
release the image and abort the job. The spike must demonstrate worker/cancel
behavior and record whether native image decode can be interrupted; no timeout
or total-memory guarantee is claimed in advance.

The transport container remains an open M10A decision. ZIP/deflate is not admitted
by this profile. If selected later, its own measured encoded/expanded/entry-count
limits, path rules and duplicate-entry behavior must be added before extraction
code or canonical Work Package v2 is introduced.

## Validation and commit sequence

Use this order in the future ingest boundary. Each stage produces a stable code
and a bounded location, as specified in the corpus contract. No rejection should
fall through to a loader, partial import or automatic repair.

1. **Envelope and reservation.** Bound file/package size before full reads.
   Acquire the single job slot and conservatively reserve encoded/read/copy
   capacity before reading, copying, hashing or parsing the full input. Validate
   the bounded versioned outer documents/reference graph and manifest field
   types, lowercase 64-hex SHA-256 identities, integer byte lengths, supported
   MIME and unique entries. Snapshot caller-owned bytes within that reservation
   so later mutation cannot change the object being checked. Enforce the read
   ceiling on actual incoming bytes even when a declared size is available.
2. **Identity and closure.** Compare actual byte lengths, compute SHA-256 over
   each original resource's complete bytes (including GLB padding), and compare
   with the expected digest. For a raw local import, compute the same identity
   without pretending there is a trusted expected digest. Require equality of
   reachable resource digests, manifest digests and supplied byte-map keys.
   Reject missing, unreferenced, duplicate or conflicting entries. Shared
   resources use one entry; two references do not require two copies.
3. **Container and syntax.** Validate GLB headers/chunks/JSON under the limits
   above. No renderer, object URL or image decoder is needed. Do not hash a
   reserialized or sanitized surrogate in place of the original bytes.
4. **Semantic admission.** First preflight profile restrictions, counts,
   offsets, strides and ranges from bounded metadata, using checked arithmetic
   to compute byte/count/decoded-growth budgets. Reject over-budget declarations
   before scanning large binary arrays or expanding accessors; reserve any
   expanded allocations first. Then check attribute values, hierarchy and
   animation within those budgets and validate sidecar targets against the
   actual model. Check all declarations, even unused ones; aliased accessors
   cannot create unaccounted repeated work or materialization.
5. **Bounded decode and staging.** Decode approved image slices; verify results,
   apply session reservations and stage the resource/document result. The loader
   receives only this validated immutable snapshot. Its resolver denies all
   authored URLs. If a host needs an internal object URL, only its own cache may
   create/use/revoke it; that URL never enters persistence or the package.
6. **Commit or abort.** In M10B, persist document/resources/references in one
   transaction only after validation succeeds. In standalone, keep the result
   package-scoped without authoring installation. Failure, cancellation, quota
   error or stale generation publishes no partial result and releases staged
   buffers, image handles, URLs and reservations. Reimport failure preserves the
   old document and bytes. A later M10E committed import is one undoable command.

Cancellation fences publication immediately. If native decode cannot be stopped,
retain its job slot and reservations until completion settles and the late
result's handles are closed; a replacement job receives `RESOURCE_JOB_BUSY` in
the meantime. Never free the accounting reservation while its allocation is
still in flight. Immediate reclamation is not assumed by this proposal.

A cache entry needs both digest and validated profile/version identity. Recheck
stored bytes on read before reuse; content addressing does not excuse corruption
or an older, weaker admission profile. Never persist a boolean “trusted” flag
that bypasses the current validator.

The [Khronos Validator](https://github.com/KhronosGroup/glTF-Validator/blob/main/README.md)
can provide an independent conformance oracle for fixtures; its
[Node interface](https://github.com/KhronosGroup/glTF-Validator/blob/main/node/README.md)
has an external-resource callback that must be deny-all in this work. Pin the
tool version when the executable corpus is added. Conformance alone does not
establish this application's URI, extension, resource-limit or persistence
policy; tests must also call the actual production ingest exports when M10B is
authorized. The validator's [issue classifications](https://github.com/KhronosGroup/glTF-Validator/blob/main/ISSUES.md)
include information/warning diagnostics for some unsupported extensions, URIs
and extra chunks, so exit zero is insufficient. Retain the full report and pin
configuration, resource-validation settings and severity overrides with the
tool version; do not filter away evidence needed by the profile.

## Existing draft gaps and compatibility

PR #226's `validateComponentPackageV3Draft` checks manifest shape and whether
`modelDigest` names a GLB-typed entry. It has no resource byte input. It does not
verify SHA-256, integer byte lengths, unused resources, actual model targets,
GLB content or decoded budgets. Unknown fields can be projected away. Those
observations are limitations of an isolated structural draft, not evidence of
a production network-fetch vulnerability or a safe ingest path.

This proposal does not retrofit those future checks into the draft or change
current 2D data-URL handling. Once M10A closes, M10B owns binary ingest/closure and
repository rollback; M10C owns the versioned Component Package v2-to-v3 migration.
Fixtures must exercise those real exports without renderer casts.

## Alternatives and remaining decision evidence

| Alternative | Proposed disposition / reason |
| --- | --- |
| Accept every loader-supported extension | Exclude from this profile; loader support does not establish a bounded decoder or package capability contract |
| Fetch remote resources or accept embedded data URIs | Exclude; one BIN-backed model makes byte ownership and no-fetch observation explicit |
| Enable Draco/Meshopt/KTX2 immediately | Defer to a reviewed extension profile with pinned decoders, malformed fixtures and expansion measurements |
| Treat manifest shape or a green conformance report as admission | Exclude; neither verifies exact bytes, application limits or transaction rollback |
| Freeze universal memory/FPS numbers now | Defer; the candidate ceilings above require named-device measurements before acceptance |

The next M10A work item is the isolated rendering/capability spike using this
reviewed candidate profile and the companion fixture recipes. Record exact
fixture hashes, browser/OS/GPU/hardware, dependency versions, lazy bundle sizes,
cold/warm load times, frame percentiles, heap/resource counts and unload/context
failure behavior. Include boundary fixtures near the proposed ceilings, not
only the minimal model. Accept/revise each ceiling and container choice in the
M10A closeout; keep `M10B` `not-started` until then.
