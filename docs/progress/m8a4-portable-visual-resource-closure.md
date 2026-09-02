# M8A4 — Portable visual resource closure

Status: **accepted · 2026-09-02**

## Why this gate exists

The M8 closeout review found that component-type dependency closure was not yet full visual-resource closure. A distributable component could contain an SVG/Image layer such as:

```text
assetRef = assets/vendor-logo.png
```

The component package and enclosing `.scada-work.json` could validate and transfer, while a fresh browser did not actually possess that host-relative resource.

That made the phrase **dependency-complete work artifact** stronger than the implementation justified.

## Accepted design boundary for this repair

M8A4 deliberately does **not** introduce a package v2 resource table, broad asset manager, upload catalog or remote resource fetcher.

Instead, the transport/distribution boundary is strict while local authoring remains flexible:

```text
local editable Component visual
    assetRef may still be authoring-local
        ↓ explicit distribution/export
DistributableComponentPackage
    SVG/Image assetRef must already be self-contained
        ↓
accepted portable forms: data:image/...
rejected forms: relative path / absolute host path / http(s) / blob: / non-image data URL
```

The accepted self-contained image media types are:

- `image/svg+xml`
- `image/png`
- `image/jpeg`
- `image/gif`
- `image/webp`
- `image/avif`

The package version remains `1` because the artifact shape does not change. This gate tightens validity of an existing field rather than adding a resource table or new wire contract.

## Implementation

`src/features/component-library/distributable-component-package.ts` owns portable visual-resource validation.

For every `svg` or `image` visual layer:

- the `assetRef` must be a non-empty, whitespace-stable `data:` URL
- the media type must be one of the accepted `image/*` forms above
- the data payload must be present

The check is applied both when:

- creating a distributable package from a ready local component
- parsing any incoming distributable package

Therefore publication, component file transfer, SCADA work packaging/import and standalone runtime loading inherit the same fail-closed boundary through the existing package codec.

Local `ComponentVisualDefinition` validation is intentionally unchanged. A draft/editable component may still contain an unresolved authoring asset reference; it simply cannot cross the portable distribution boundary until normalized to a self-contained resource.

## Deterministic evidence

`scripts/check-distributable-component-package.ts` proves:

- vector-only packages remain compatible
- an image-bearing package using an embedded SVG `data:image/svg+xml,...` resource is accepted
- the embedded asset survives deterministic serialize/parse round-trip
- empty resource refs fail closed
- host-relative and root-relative paths fail closed
- `http:` and `https:` refs fail closed
- `blob:` refs fail closed
- non-image data URLs fail closed
- malformed/unsupported packages continue to fail closed
- publication still consumes the same package v1 codec

Because M8 work packages already parse each dependency through this codec, invalid visual-resource dependencies are rejected without adding a second work-package rule.

## Browser evidence

`scripts/pages-standalone-runtime-smoke.mjs` extends the deployed standalone fixture with a real SVG/Image visual layer whose resource is embedded as a magenta `data:image/svg+xml,...` URL.

The fresh-browser smoke:

1. loads the normal deployed portable dependency fixture
2. adds the self-contained image layer to the package artifact
3. loads that dependency through the exact `.scada-work.json` standalone path
4. waits until the Konva scene canvas contains the distinctive embedded-asset pixels
5. confirms Studio IndexedDB is still not initialized
6. confirms there are no browser page errors

This proves the resource is not only accepted by the codec but renders in the fresh-browser standalone runtime without external asset installation or network fetch.

## Acceptance evidence

- PR #109: `feat: close portable visual resource boundary`
- final PR head `2ada74c8ffd249599a97c8609d71a619d84ddb9a`
- PR CI #765 (`33494929623`) passed Build, runtime/model checks, Lint and publication-api
- merged revision `main@f318b6a0b832316b03eb1a15caa3633da0da26fd`
- main CI #766 (`33588555660`) passed
- Deploy GitHub Pages #244 (`33588555564`) passed
- Pages Browser Smoke #195 (`33588593832`) passed, including the image-bearing standalone fixture

M8A4 is therefore accepted. The portable package boundary no longer accepts undeclared host-relative visual dependencies.

## Explicit non-goals

M8A4 does not add:

- package-owned multi-file resource tables
- asset deduplication/content addressing
- upload/media-library UI
- remote HTTP asset fetching
- blob URL persistence
- generic MIME/file support
- automatic rewriting of existing local authoring refs
- Component Attribute / Property schema migration
- standalone Scene semantic orchestration (M8B2)

A future real product requirement may justify a package v2 resource table. M8 closeout does not require inventing it now.

## Next gate

The remaining M8 closeout repair is **M8B2 Standalone canonical semantic parity**. Concrete runtime transport remains deferred by M7B2.
