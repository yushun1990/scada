# M8A3 — Explicit browser SCADA work package transfer

Status: **accepted · 2026-08-31**

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

M8A3 is a browser transfer/persistence slice. It is not the standalone runtime shell.

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

The deployed smoke proves:

1. a portable starter component can participate in a persisted SCADA work
2. Workspace export downloads one dependency-complete `.scada-work.json`
3. a fresh browser imports only after explicit confirmation
4. the work and missing component dependency are persisted with fresh local identities
5. the dependency activates through the normal Studio registry/palette
6. a different same-type dependency is rejected before confirmation and without Scene/component persistence changes

## Acceptance evidence

- PR #106: `feat: add explicit browser SCADA work transfer`
- final PR head: `44ac595be468aae261cbe60de9ede846018dac7b`
- final PR CI #745 (`33385557424`) passed
- merged revision: `main@2725abf1eafa953abfbabe456a1d63e9d3526dcd`
- Deploy GitHub Pages #239 (`33390783353`) passed
- Pages Browser Smoke #190 (`33390834150`) passed against the merged revision, including the fresh-browser work-package transfer scenario

M8A3 is therefore accepted.

## Explicit non-goals

M8A3 did not add:

- standalone/read-only runtime route or shell
- publication hosting for works
- concrete runtime transport configuration
- automatic remote dependency fetching
- overwrite/update semantics for conflicting local components
- executable portable Actions/Events or `implementationDraft`
- a second work/runtime artifact format

## Next boundary

M8B1 is the standalone/read-only runtime shell. It must consume the exact same accepted `.scada-work.json`, build runtime capabilities without installing the package into Studio state, and prove fresh-browser load/render behavior before any concrete runtime transport is selected.
