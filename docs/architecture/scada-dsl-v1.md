# SCADA DSL v1 Surface Contract

Status: **accepted M9A1 contract baseline; parser/compiler migration follows this contract**.

This document supersedes the exploratory surface syntax recorded in `docs/progress/m6.5.4-scada-dsl-surface.md` where the two disagree.

The M6.5 parser proved that a small text-first SCADA language can lower into structured Value / Behavior / Interaction semantics. M9 now freezes the public authoring surface around the Attribute / Property authority split and the one-component / one-device binding model.

The DSL remains an **authoring surface**, not persistence authority and not a general-purpose scripting runtime.

```text
SCADA DSL text
    ↓ parse / resolve / type-check / lower
structured Scene semantics
    ↓ persist / compile
runtime
```

---

## 1. Built-in context roots

SCADA DSL v1 has two reserved runtime/editor context roots:

```text
$self
$device
```

### `$self`

`$self` means the current component instance.

In the SCADA Scene DSL it exposes the current component's runtime-facing public capabilities:

- Properties
- Actions
- Events

Example:

```text
$self.level = $device.level
$self.reset()
```

`$self` does **not** expose public Attributes as runtime binding targets. An authored Attribute such as `runningColor` cannot become writable merely because the component implementation reads it.

Therefore, if `runningColor` is an Attribute, this is invalid Scene DSL:

```text
$self.runningColor = $device.color
```

The compiler/type checker must reject it as a non-Property target.

### `$device`

`$device` means the one device bound to the current component instance.

SCADA DSL v1 deliberately adopts a **one component → one bound device** authoring model. Device identity belongs to Scene structure, not DSL source text.

```text
component instance
    ↓ boundDeviceId
one device
    ↓
$device
```

Changing/rebinding the component's device must not require textual replacement inside the DSL.

V1 therefore does not expose arbitrary user-named device roots such as:

```text
device1.pressure
outlet.pressure
pumpA.running
```

If future requirements prove multi-device scene logic is necessary, that must be introduced as an explicit later language/scene-contract extension rather than kept accidentally through the exploratory arbitrary-symbol model.

---

## 2. Reference examples

Property read:

```text
$device.pressure
$self.running
```

Property assignment:

```text
$self.pressure = $device.pressure
$self.running = $device.running
```

Action call:

```text
$self.reset()
$device.start()
```

Component Event interaction block retains the existing `on` concept, now using the reserved context roots:

```text
on $self.startRequested {
    $device.start()
}
```

The structured Scene model remains authoritative for the resolved component/device identity behind these readable references.

---

## 3. Statement termination

A statement does **not** require `;` at the end of a line.

Newline is the normal separator:

```text
$self.running = $device.running
$self.pressure = $device.pressure
```

A semicolon is permitted as an optional explicit separator:

```text
$self.running = $device.running;
$self.pressure = $device.pressure;
```

Multiple simple statements may therefore be separated by `;` on one physical line, although formatter/editor presentation should prefer readable line-oriented source.

The grammar must not make a trailing semicolon mandatory.

---

## 4. `if` syntax

`if` always uses a braced statement body.

```text
if $device.fault {
    $self.state = "fault"
}
```

`else if` and `else` also use the same braced statement form:

```text
if $device.fault {
    $self.state = "fault"
} else if $device.running {
    $self.state = "running"
} else {
    $self.state = "stopped"
}
```

The exploratory M6.5 expression form:

```text
$self.state = if $device.fault then "fault" else "normal"
```

is **not part of DSL v1**.

Consequences:

- `then` is removed from the v1 keyword surface;
- there is one `if` concept instead of separate expression-if and statement-if semantics;
- braces are required for every `if` / `else if` / `else` body.

---

## 5. `case` syntax

DSL v1 adds a compact `case` statement for value dispatch.

There is no `when` keyword.

A one-statement arm may be written directly after `:`:

```text
case $device.state {
    0: $self.state = "stopped"
    1: $self.state = "running"
    2: $self.state = "fault"
    _: $self.state = "unknown"
}
```

A multi-statement arm uses `{}`:

```text
case $device.mode {
    "auto": {
        $self.auto = true
        $self.manual = false
    }

    "manual": {
        $self.auto = false
        $self.manual = true
    }

    _: {
        $self.auto = false
        $self.manual = false
    }
}
```

The default/fallback arm is Rust-style wildcard `_`:

```text
_:
```

Normative v1 rules:

1. `case` has the form `case <expression> { <arms> }`.
2. V1 explicit arm patterns are scalar literals supported by the DSL value model.
3. A single-statement arm does not require `{}`.
4. A multi-statement arm requires `{}`.
5. `_` is the fallback arm.
6. `_` may appear at most once.
7. `_` must be the final arm.
8. `when`, `default`, `otherwise` and `=>` are not v1 syntax.

The `_` wildcard is an intentional small Rust influence: concise and semantically clear without turning the DSL into Rust.

---

## 6. Attribute / Property authority in the DSL

The M9 public component contract is:

```text
Attributes + Properties + Actions + Events + Anchors
```

SCADA Scene DSL participates in the runtime semantic side of that contract.

```text
Attribute
    authored configuration
    Inspector / component authoring authority
    NOT a Value Binding target

Property
    runtime semantic value
    readable/writable through accepted DSL/runtime semantics
    Value Binding target
```

Therefore ordinary Scene DSL assignment is structurally:

```text
$self.<Property> = <expression>
        ↓
Value Binding / derived runtime value
```

It is never:

```text
$self.<Attribute> = runtime value
```

Component-private visual rules are a different execution/authoring context. They may read resolved Attributes and effective Properties through explicit separate namespaces. They must not flatten both authorities back into one ambiguous `props` namespace.

The exact private-rule surface is not frozen by this document.

---

## 7. Capability discovery

Completion/click-to-insert remains one capability-discovery model, but the v1 Scene DSL catalog is constrained by the reserved roots.

Expected roots:

```text
$self
$device
```

Examples:

```text
$self.sh
    ↓ completion
$self.showFault()
$self.showRunning()

$device.pr
    ↓ completion
$device.pressure
```

The M6.5 arbitrary `symbol` catalog was exploratory. V1 migration must not keep arbitrary external root symbols merely because the old completion model supported them.

Attributes may still be displayed in Inspector/Component Workbench capability UI, but they must not be advertised as writable Scene DSL Properties.

---

## 8. Persistence and stable identity

Readable DSL roots are not stable persisted identity.

```text
$self.running
$device.pressure
```

must resolve/lower to structured semantic references before persistence/runtime execution.

For `$device`, the stable identity comes from the component instance's device binding plus the selected device capability, not from persisting a fragile text symbol.

Existing accepted rule remains:

> DSL text is not the canonical persisted runtime behavior model.

---

## 9. Grammar baseline

The v1 surface baseline is intentionally small:

```text
program       := statement*

statement     := assignment
               | action-call
               | if-statement
               | case-statement
               | on-statement

assignment    := $self . property = expression

action-call  := reference ( arguments? )

if-statement  := if expression block
                 (else if expression block)*
                 (else block)?

case-statement := case expression {
                    case-arm*
                  }

case-arm      := scalar-literal : statement
               | scalar-literal : block
               | _ : statement
               | _ : block

on-statement  := on $self . event block

block         := { statement* }

reference     := $self . capability
               | $device . capability
```

Newline and `;` are statement separators where the grammar is not already delimited by braces/punctuation.

This is a surface grammar baseline, not a parser-generator specification. Operator precedence and the already accepted scalar/arithmetic/boolean expression model remain defined by implementation/tests unless changed by a later explicit architecture decision.

---

## 10. Migration from the exploratory M6.5 surface

The parser/compiler migration must be explicit.

| M6.5 exploratory form | DSL v1 |
| --- | --- |
| `component.state` | `$self.state` |
| `device.pressure` | `$device.pressure` |
| `outlet.pressure` arbitrary external symbol | not supported in v1 |
| `if x then a else b` expression | removed |
| `if x { ... } else { ... }` | retained |
| optional `;` / newline | retained |
| no `case` | add `case` with `_` fallback |

Because persisted Scene semantics are structured, existing persisted canonical scenes should migrate through semantic/schema migration authority rather than by rewriting persisted DSL strings as runtime truth.

Editor-only stored exploratory DSL source, if any, must either be migrated deliberately or rejected with a useful diagnostic; do not silently reinterpret old arbitrary roots.

---

## 11. M9 implementation boundary

This contract is frozen before M9A2 editor UI work.

Execution order:

```text
M9A1.0
    freeze Attribute / Property + DSL surface authority
        ↓
M9A1 schema / Scene migration work
        ↓
parser / analyzer / lowering migration to $self / $device + case
        ↓
M9A2 editor / completion UI consumes the frozen language
        ↓
M9B1 runtime proves Property-only mutation authority
```

Do not build production completion/editor UI around the old `component` / arbitrary source-symbol syntax.
