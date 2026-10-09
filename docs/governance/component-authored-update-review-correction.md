# Component-authored Update joint review correction

## Gate and authority

- Status: `active` — CAR-ARCH documentation correction awaiting independent review.
- Gate: M10A plus authorized product polish; no execution capability/gate accepted.
- Work item / findings: CAR-ARCH; JA-001 (P1), JA-002 (P2), jointly with CIO-ARCH.
- Audited production base: `f8a060dc4255b6695ddecffa60493ade5d761c74`.
- Reviewed PR #223 head: `2c548f916618420b4cb16ebe81470f1d3eec347f`.
- Corrected parent #221: `da633112082a27eafbf352ef9cd757ab3dd8c2fa`, branch
  `docs/component-contract-intent-authority`. It is an ancestor of this branch;
  a history-preserving branch merge retains the original review revisions.
- Verified architecture head: `2f195575fb43f49ffe0e12d6659a4df0e3ef7fb4`.
  The handoff commit adds this evidence record only; the exact delivery head
  is published in the PR #223 comment.
- Architecture: [private Model/Update ADR §2–3, §5–8](../architecture/adr-component-authored-update-runtime.md)
  and [corrected public contract](../architecture/adr-component-input-output-composition.md).
- Published review: [JA-001](https://github.com/yushun1990/scada/pull/223#discussion_r4226703954),
  [JA-002](https://github.com/yushun1990/scada/pull/223#discussion_r4226703965),
  [joint assessment](https://github.com/yushun1990/scada/pull/223#pullrequestreview-5465810689).

## Implemented

Documentation corrections only:

- JA-001: PumpSwitch declares a conceptual host-owned equipmentState input with
  unknown/stopped/running and unknown default/fallback. It requires usable
  observations of the current binding; unknown suppresses equipment requests
  and running animation while showing unavailable. Startup/missing input,
  loss, same-valued confirmation, invalid input and rebind have explicit
  obligations. Current trusted Pump defaults and source behavior are preserved.
- JA-002: choose local momentary feedback and optional maintained operator
  intent only. Failure diagnostics do not change private Model. No implicit
  Scene Effect result or claimed pending/acknowledged/completed state exists.
  Consumer-sensitive feedback needs a later separately declared public input
  and explicit routing decision.
- Add lifecycle/acceptance traces for rejection, slow/no response, contradictory
  telemetry, stale outcomes, rebind and runtime disposal/restart. Valid current
  telemetry remains authoritative even when it contradicts command intent.
- Remove the illustrative Update signature/effectResult union; source language,
  constrained declarative alternatives, ABI and package representation remain
  open. Record Model/hidden-state/commit ownership, presentation composition,
  generation fencing and versioned private-logic admission as CAR-1 obligations.

## Explicitly not implemented

No runtime, UI, schema, package, dependency, test-suite or workflow changes.
No generic telemetry quality subsystem, public outcome port implementation,
Scene T3 migration, nested T4 execution, portable scripts, QuickJS promotion,
M10 gate closeout, PR merge or review-thread resolution. PR #222 is unchanged.

## Compatibility and migration

Preserve the fixed Engine, Workbench-authored private logic direction, public
Attributes/Properties/Actions/Events, host-owned Effects and portable asset
ownership. The single host Property authority, Scene v8 canonical semantics,
capability guard, exact resources/dependencies and package-scoped Standalone
remain binding. No new persisted schema or migration is chosen. Required
private logic must eventually be admitted or rejected even when public
Actions/Events are empty; it cannot be silently stripped for activation.

## Verification

All published reviews/comments were read and their cited implications checked
against fetched main and PR heads. The [public correction evidence](component-contract-review-correction.md#verification)
records the production-export JA-001/JA-002 probes and four passing contract/
authority/adapter/portable checks. This branch has identical production source;
those results do not prove authored Update execution, input invalidation or a
consumer outcome channel.

| Command | Exact outcome |
| --- | --- |
| `python3 /tmp/scada-ja-doc-check.py /tmp/scada-ja-223 2c548f916618420b4cb16ebe81470f1d3eec347f` | PASS, exit 0 — exactly 6 correction files including inherited #221 corrections, all architecture/governance; 32 local links/anchors, balanced fences, no replacement characters. |
| `python3 /tmp/scada-ja-doc-check.py /tmp/scada-ja-223 da633112082a27eafbf352ef9cd757ab3dd8c2fa full-pr` | PASS, exit 0 — exactly 4 Markdown files in the stacked #223 diff; 28 local links/anchors resolve; fences/encoding pass. |
| `git diff 2c548f916618420b4cb16ebe81470f1d3eec347f --check` | PASS, exit 0 — no whitespace errors. |
| `git diff origin/main -- src scripts package.json package-lock.json .github` | PASS, exit 0 — empty; production source, tests, dependencies and workflows unchanged. |
| `git merge-base --is-ancestor da633112082a27eafbf352ef9cd757ab3dd8c2fa HEAD` | PASS, exit 0 — corrected #221 is an ancestor; #223 remains stacked on that branch. |

The exact private ADR diff and this handoff were read. Remote heads, ancestry
and thread state are rechecked at delivery; the final head is recorded in the
PR #223 comment. No new build/lint, browser, deployment, migration, security or
performance acceptance is claimed.

## Risks and follow-up

Independent reviewers must assess the corrected direction across both PRs;
JA findings/threads remain open for that review. Expressible local feedback
is distinct from a delivered execution guarantee.

CAR-1 must decide unknown/usable input admission and loss/freshness/rebind
delivery; normalized gestures and one occurrence per gesture; one Model and
hidden-state commit boundary; Model-aware rules/animation composition;
ordering/rollback versus irreversible dispatch; runtime/binding generations,
cancellation and stale suppression; isolation/capability/resource budgets;
versioned executable admission and Preview/Standalone parity. Compare
constrained declarative/handler and sandboxed-source options against the same
pump traces before choosing language, ABI or package schema.

If per-request feedback is offered, CAR-1 additionally needs an explicit typed
public outcome input, authorized Scene/Host route, origin-instance/occurrence/
runtime-activation/binding correlation, stale/superseded outcomes and a defined
zero/multiple-consumer policy. Dispatch acceptance/failure/acknowledgement are
never equipment confirmation. CAR-2 must not begin without the accepted
decision; CAR-3/4 need separate authoring/browser and portable parity evidence.

## Next eligible work item

Independently review these corrections, accept #221 before dependent #223,
then explicitly scope/review CAR-1. Scene T3, nested T4, #222 and M10A retain
their own gates and review requirements. No follow-up is implicitly started.
