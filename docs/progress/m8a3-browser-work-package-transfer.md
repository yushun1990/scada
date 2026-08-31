# M8A3 — Explicit browser SCADA work package transfer

Status: **active · 2026-08-31**

## Goal

Expose the accepted M8A2 dependency-complete work artifact through explicit browser file transfer:

```text
persisted local SCADA work
+ exact portable dependency closure
    ↓ explicit export
.scada-work.json
    ↓ fresh browser / explicit import
preflight package + local inventory
    ↓ explicit confirmation
atomic Scene + missing-dependency persistence
    ↓ activation
normal SCADA editor/runtime registry
```

M8A3 is a browser transfer/persistence slice. It is not yet the standalone runtime shell.

## Export boundary

Workspace export operates on the exact persisted Scene record, not an unsaved editor-memory snapshot.

For every referenced component type:

- trusted built-in/native types are host capabilities and are not embedded
- a portable type must resolve to exactly one distributable local-ready or installed-remote package
- missing, ambiguous or non-distributable dependencies fail closed
- the resulting dependency list is passed through the accepted M8A2 work-package codec before download

The browser file name uses `.scada-work.json` while the file content remains the transport-neutral M8A2 artifact.

## Import boundary

File selection is inspection only. It parses and validates the complete work artifact against an isolated built-in host-capability registry and then compares bundled dependencies with current browser inventory.

A same-type local or installed dependency may be reused only when its normalized distributable component package is exactly equivalent to the bundled package. Different definitions fail closed before confirmation rather than silently changing runnable semantics.

Missing portable dependencies are eligible to become fresh local editable ready components. Their local repository ids/timestamps are generated on import; distribution artifacts never carry local authoring identity.

The imported work likewise receives a fresh local work id.

## Persistence transaction

After explicit user confirmation, the complete package and inventory are revalidated/replanned immediately before persistence.

The imported Scene and all missing dependency records are then added in one IndexedDB transaction. Generated-id collisions use `add()` semantics and abort the transaction instead of overwriting existing records.

Runtime component activation happens only after that transaction commits.

This prevents a failed work import from leaving half of its component closure persisted.

## Deterministic verification

`check-scada-work-transfer.ts` covers:

- exact export dependency resolution from local-ready and installed-remote inventory
- missing dependency rejection
- ambiguous source rejection
- non-ready/non-distributable dependency rejection
- fresh-browser import planning
- exact existing-package reuse
- differing same-type package collision
- ambiguous local/remote same-type collision
- pure transfer-planner source boundary with no browser persistence or Studio-global registry dependency

The check is wired into normal CI.

## Browser verification

`pages-scada-work-package-transfer-smoke.mjs` is wired into the deployed Pages smoke suite and uses two isolated browser contexts.

The deployed smoke is designed to prove:

1. a portable starter component can participate in a persisted SCADA work
2. Workspace export downloads one dependency-complete `.scada-work.json`
3. a fresh browser imports only after explicit confirmation
4. the work and missing component dependency are persisted with fresh local identities
5. the dependency activates through the normal Studio registry/palette
6. a different same-type dependency is rejected before confirmation and without Scene/component persistence changes

Because this is browser-visible distribution behavior, **M8A3 is not accepted until the PR is merged, Pages is deployed, and this fresh-browser smoke passes against the deployed revision.**

## Current implementation evidence

- PR #106: `feat: add explicit browser SCADA work transfer`
- CI #739 (`33385199707`) passed on the initial implementation head, including Build, runtime/model checks, Lint and publication-api regression

Final PR-head CI and deployed Pages evidence must still be recorded before acceptance.

## Explicit non-goals

M8A3 does not add:

- standalone/read-only runtime route or shell
- publication hosting for works
- concrete runtime transport configuration
- automatic remote dependency fetching
- overwrite/update semantics for conflicting local components
- executable portable Actions/Events or `implementationDraft`
- a second work/runtime artifact format

## Next expected slice

After M8A3 acceptance, re-evaluate the minimum standalone runtime boundary. The expected next slice is M8B1: a read-only runtime shell that consumes the exact same accepted work package rather than editor-local Scene state or a new debug snapshot format.
