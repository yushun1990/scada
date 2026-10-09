# Component-authored Update runtime architecture handoff — CAR-ARCH

- Status: **proposed**, awaiting independent architectural review and acceptance.
- Date: 2026-10-09.
- Work item: CAR-ARCH, documentation-only prerequisite; no new execution gate accepted.
- Parent dependency: PR #221 (Component public input/output and composition amendment), branch docs/component-contract-intent-authority at b54260612018806a5bef9487672e822bf2f67fd7.
- Audited main: f8a060dc4255b6695ddecffa60493ade5d761c74; no claim of subsequent main merges.
- Design authority proposed here: [Component-authored Update runtime ADR](../architecture/adr-component-authored-update-runtime.md).
- Execution scheduling link: [PLAN](../../PLAN.md).

## Repository evidence used

- PLAN §3.1/§3.11 and §11: five-part public contract, separate host-owned Property truth, portable user Action/Event execution not yet admitted, M10A active.
- Pending PR #221: public Action input intent, Event output occurrence, private Layer Operation, explicit Scene routing and future nested-component contract preservation. Its acceptance cannot be presumed.
- src/component-system/definition.ts: typed declarations/argument and payload schema with no executable Action source.
- src/component-system/registration.ts and src/runtime/preview-runtime.ts: trusted native handler registration and typed Action/Event host dispatch.
- src/runtime/controlled-script-engine.ts: isolated script invocation only for init/propertyChanged/action concepts, **not** generic trusted presentation interactions or an admitted authored-component Update implementation.
- src/runtime/controlled-script-protocol.ts and src/component-system/controlledRuntime.ts: existing host call experiments include property.set, not an accepted semantic Property ownership transfer.
- docs/architecture/adr-proposal-controlled-layer-methods.md: scoped editor-only private visual operations through bounded QuickJS; not standalone/public execution.
- src/runtime/preview-scada-semantics.ts and src/runtime/device-action-dispatcher.ts: current canonical event/device-action routing remains host owned.

## Architectural proposal delivered

1. Three roles: fixed SCADA engine, in-Workbench component developer, public-contract scene consumer.
2. Public Attributes/Properties/Actions/Events/Anchors are independent from private Model/Update/presentation and layer operations.
3. Standard host-delivered interaction, Property and Action input messages converge on author-authored private Update semantics. Component author chooses occurrence->Event mapping; external Action declarations remain optional.
4. Private visual/command feedback and externally confirmed equipment state are distinct; PumpSwitch example covers pressed vs device.running and Event routing.
5. Component author logic is part of a versioned component-owned asset, not a host source-code modification. Complete component/work/standalone packaging and matching admission are future requirements.
6. Editor logic authoring can include typed symbol/API discovery, transient preview and AI generation without permission escalation or duplicated authoring/runtime authority.
7. Declared Event/Effect output remains validated and host controlled; no unrestricted JS, direct device/DOM/renderer authority, semantic Property writes, or partial/late effect commits.
8. Proposes CAR-1 execution ADR followed by separately authorized runtime, Workbench and portable-parity tranches. No implementation is started.

## Explicit non-goals

No source or schema change, no executable portable scripts, no new package version, no new editor panels, no altered CI/test suite, no Scene Trigger/Effect implementation, no nested layer implementation, no M10 3D gate advancement, no change to PR #222 candidate. The conceptual TypeScript message/update sample does not specify an accepted API.

## Verification and risks

Remote-read verification must confirm both changed docs on this branch and anchor/link targets under the parent branch. Markdown/link/fence checks here can cover only documentation structure. No local checkout, npm test/build/lint, browser test, CI, deployment or security evidence is claimed for these documentation-only edits.

Risk: calling this proposal “accepted” before explicit review would accidentally bypass M10-R0's executable-content gate. Its private Model/Update contract needs independent threat model, budget/scheduling/atomicity design, package version and malformed/capability fixtures, and Preview/standalone parity before any production implementation.

## Next eligible work

Review PR #221 first, then CAR-ARCH. Independently scope CAR-1 execution/sandbox/package decision and only after approval proceed through CAR-2 host runtime prototype, CAR-3 authoring/preview, CAR-4 portability/parity evidence. Existing CIO T1–T4 and M10A progression remain separate.
