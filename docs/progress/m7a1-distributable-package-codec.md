# M7A1 Transport-neutral distributable component package codec

Status: accepted implementation · 2026-08-30

## Goal

Separate the component distribution artifact from both:

- local editable `ComponentLibraryEntry` repository metadata
- remote publication request/revision envelopes

without inventing a second package shape that competes with the already accepted M6.7 publication payload.

## Result

`src/features/component-library/distributable-component-package.ts` is now the transport-neutral package authority.

The artifact contains only:

```text
packageVersion
definition
visual
implementationDraft
```

It deliberately excludes:

```text
local repository id
local draft/ready status
local updatedAt
builtIn metadata
publication request/revision ids
publication timestamps
remote provenance
```

## Codec boundary

The M7A1 codec now owns:

- local ready user package -> distributable artifact conversion
- distributable artifact validation
- deterministic normalized JSON serialization
- JSON document parsing
- pure conversion back into a ready local package using caller-supplied local id/timestamp

The codec has no persistence, registry mutation, activation, filesystem, browser file-picker, or network side effects.

`implementationDraft` remains inert string content. M7A1 does not create a JavaScript execution path.

## Publication compatibility

`publication-contract.ts` no longer defines its own competing package implementation. It consumes the M7A1 codec and retains compatibility aliases:

```text
ComponentPublishedPackage
parseComponentPublishedPackage
createComponentPublishedPackage
```

so the accepted M6.7 publication wire shape remains unchanged.

Published revision -> local activation-candidate conversion also reuses the shared pure package conversion path.

## Versioning

The distributable artifact has its own explicit v1 version constant even though the current editable local document is also v1.

This is intentional: a future local authoring schema migration must not silently mutate the distribution contract.

## Verification

A new deterministic CI fixture verifies:

- ready-only conversion
- built-in rejection
- local metadata exclusion
- cloned definition/visual boundaries
- deterministic serialize/parse round-trip
- malformed JSON rejection
- unsupported version rejection
- malformed definition/visual rejection
- explicit local identity injection on import conversion
- publication compatibility against the same artifact codec

CI continues to run the existing publication contract, remote installation/client checks, Build, Lint and PostgreSQL publication API integration.

## Scope deliberately deferred

M7A1 does not add:

- browser file export/import UI
- import collision policy
- ComponentRepository writes
- automatic activation
- native renderer module packaging
- external asset-tree bundling
- production runtime adapters

Those boundaries remain later M7 work.

## Next

**M7A2 Explicit browser package export / import.**
