# Component public-contract joint review correction

## Gate and authority

- Status: `active` — documentation correction awaiting independent review.
- Gate: M10A plus authorized product polish; independently scoped CIO-ARCH
  architecture prerequisite. No M6–M10 gate is advanced.
- Work item / findings: CIO-ARCH; JA-001 (P1), JA-002 (P2), jointly with PR #223.
- Audited production base: `f8a060dc4255b6695ddecffa60493ade5d761c74`.
- Reviewed PR #221 head: `b54260612018806a5bef9487672e822bf2f67fd7`.
- Reviewed dependent PR #223 head: `2c548f916618420b4cb16ebe81470f1d3eec347f`.
- Verified architecture head: `3d2594b2a0eb521647896a6e850a2d61b8ee898e`.
  The handoff commit adds this evidence record only; the exact delivery head is
  published in the PR #221 comment. The dependent branch must incorporate the
  delivery head before its own delivery.
- Architecture: [public contract ADR §2–3 and §7](../architecture/adr-component-input-output-composition.md),
  [M9 Property authority §3–4](../architecture/component-attributes-properties.md),
  [Component system §6–7](../architecture/component-system.md).
- Published review: [JA-001](https://github.com/yushun1990/scada/pull/221#discussion_r4226703622),
  [JA-002](https://github.com/yushun1990/scada/pull/221#discussion_r4226703633),
  [joint assessment](https://github.com/yushun1990/scada/pull/221#pullrequestreview-5465810339).

## Implemented

Documentation corrections only:

- JA-001: effective host-resolved values include default/authored fallback and
  do not inherently confirm equipment state. Contracts claiming confirmation
  or selecting equipment requests require an explicit unknown/usable input for
  the current binding, including equal-valued confirmation/loss. A sentinel or
  coherently delivered validity Property suffices; no generic quality system
  or second Property authority is introduced.
- JA-002: public Events have independent zero/one/multiple consumers. Their
  Effects have no implicit result path to the origin's private Update. Local
  dispatch acceptance, command failure, device acknowledgement and confirmed
  equipment observation are distinct. Failure-sensitive feedback requires a
  separately declared public input, explicit authorized routing and a later
  correlation/lifecycle/fan-out decision.
- Synchronize the M9 value-authority and Component-system explanations with
  the amended ADR. Existing source-audit/progress records remain historical.

## Explicitly not implemented

No source, tests, schema, dependency, package version, UI, protocol, telemetry
quality subsystem, outcome channel, Model/Update runtime or portable execution
change. No merge, review-thread resolution or acceptance claim. JavaScript,
QuickJS, a particular Update signature and executable package representation
remain open. PR #222 is unchanged; #223 remains dependent on #221.

## Compatibility and migration

Preserve defaults/authored fallbacks and host-derived layers, one shared
effective Property snapshot, immutable authored Attributes, canonical Scene v8
semantics, host Effects and portable capability/resource closure. The current
trusted Pump defaults to running and is not rewritten by these docs. Current
adapter disconnects may retain last values; an explicit future input contract
must provide the invalidation it promises. No migration is performed.

## Verification

All published reviews and inline comments on both PRs were read. Origin/main
and both branch heads were fetched before independently inspecting production
exports. The corrections do not change those exports.

| Command / evidence | Exact outcome |
| --- | --- |
| `npx --yes tsx /tmp/scada-ja-probe.mts` | PASS, exit 0 — production PreviewRuntime, compiled attachment and Property store retained the identical frozen running snapshot across absence, same-valued confirmation, deletion and absent rebind; zero Property notifications. Invalid enum was rejected before Property commit. Distinct Event sequences 1/2 produced identical invocations, void dispatch and two host dispatch-rejected issues; no public outcome input or Property change. |
| `npx --yes tsx scripts/check-typed-action-event-contract.ts` | PASS, exit 0 — typed declarations/payloads, request validation, settled snapshots and device dispatcher boundary. |
| `npx --yes tsx scripts/check-preview-component-state.ts` | PASS, exit 0 — separate immutable Attribute/Property snapshots and compiled/legacy isolation. |
| `npx --yes tsx scripts/check-runtime-adapter-lifecycle.ts` | PASS, exit 0 — lifecycle, stale inbound fencing, failure diagnostics and no outbound replay. |
| `npx --yes tsx scripts/check-portable-execution-boundary.ts` | PASS, exit 0 — public source rejected/migrated, draft inert, no unrestricted authoring execution. |
| `python3 /tmp/scada-ja-doc-check.py /tmp/scada-ja-221 b54260612018806a5bef9487672e822bf2f67fd7` | PASS, exit 0 — exactly 4 correction files, all under architecture/governance; 22 local links/anchors; balanced fences; no replacement characters. |
| `python3 /tmp/scada-ja-doc-check.py /tmp/scada-ja-221 f8a060dc4255b6695ddecffa60493ade5d761c74 full-pr` | PASS, exit 0 — all 16 PR files are Markdown; 104 local links/anchors resolve; fences/encoding pass. |
| `git diff b54260612018806a5bef9487672e822bf2f67fd7 --check` | PASS, exit 0 — no whitespace errors. |
| `git diff origin/main -- src scripts package.json package-lock.json .github` | PASS, exit 0 — empty; production source, tests, dependencies and workflows unchanged. |

The temporary probe imports production exports; it is not a committed runtime
fixture or proof of future authored execution. To reproduce JA-001, use a Scene
v8 Pump with running fallback and `$self.state = $device.state`, attach with no
source, subscribe to component Properties, publish running, delete the source,
then rebind to an absent source and compare identity/publications. For JA-002,
add `on $self.startRequested { $device.start() }`, publish twice, and capture
invocations and disconnected ManagedRuntimeAdapter issues. Production paths:

- `src/runtime/effective-component-props.ts` and `component-property-store.ts`:
  fallback resolution, derived invalidation and value-only snapshot equality.
- `src/runtime/preview-scada-semantics.ts`: only Event name enters canonical routing.
- `src/runtime/device-action-dispatcher.ts`: static interaction/device/action/
  arguments invocation and void dispatch.
- `src/runtime/managed-runtime-adapter.ts`: rejection/error diagnostics are host issues.

The exact correction diff was read, including this evidence record. Remote
heads, branch ancestry and review-thread state are rechecked at delivery and
reported with the final head in the PR comment. No build/lint, browser, deployment, migration, security
or performance acceptance is claimed by this documentation correction.

## Risks and follow-up

Independent architectural review must confirm that both corrected proposals
now express consistent public/private obligations. Findings and review threads
remain open for that assessment. These docs do not establish runnable authored
components or complete execution safety.

CAR-1 must decide and evidence unknown/usable input representation and loss/
rebind/freshness delivery; one Model/hidden-state commit boundary; deterministic
presentation composition and ordering; bounded isolation/capabilities; lifecycle
generations and stale suppression; and versioned private executable admission,
including components with no public Actions/Events. If per-request feedback is
offered, it additionally needs a typed public input, authorized route,
origin-instance/occurrence/activation/binding correlation, cancellation and a
zero/multiple-consumer policy. It must distinguish local rollback from failure
after irreversible dispatch. These are obligations for a separately reviewed
decision, not newly granted capabilities.

## Next eligible work item

Independently review the #221 correction and the dependent #223 PumpSwitch/
Model/Update correction; accept #221 before #223. Then explicitly scope CAR-1
before CAR-2 runtime work. Existing CIO T1–T4 and M10A progression retain their
separate authorization/evidence requirements. None is started by this handoff.
