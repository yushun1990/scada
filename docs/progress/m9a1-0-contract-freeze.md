# M9A1.0 Contract Freeze

Status: **implemented as the first M9 execution slice on 2026-09-02; schema/parser implementation follows**.

M8 is accepted. M9 starts by freezing the authority model before changing persisted/component/runtime structures.

This slice records two coupled decisions:

1. Component public authority is explicitly split into authored **Attributes** and runtime-capable **Properties**.
2. SCADA DSL v1 is frozen around `$self` / `$device` and the one-component / one-device binding model before parser/editor migration.

Architecture authorities:

- `docs/architecture/component-attributes-properties.md`
- `docs/architecture/scada-dsl-v1.md`

---

## 1. Why this slice precedes schema/code migration

The existing repository still contains exploratory M6.5 DSL syntax and one conflated component Property namespace.

Changing parser punctuation first would be unsafe because the semantic meaning of `component.*` currently spans the same namespace that M9 is about to split.

The accepted order is therefore:

```text
freeze semantic/public contract
        ↓
version schema and migration authority
        ↓
migrate parser/analyzer/lowering
        ↓
build editor UI
        ↓
prove runtime authority split
```

This prevents M9 from becoming scattered renames across parser, Inspector, Scene schema and runtime.

---

## 2. DSL v1 decisions accepted in this slice

### Reserved roots

```text
$self    current component
$device  the component's one bound device
```

`$self` exposes Scene-DSL runtime capabilities (Properties / Actions / Events), not writable Attributes.

`$device` replaces the old readable `device.*` root and removes arbitrary external source symbols from v1.

### Device cardinality

A SCADA component instance binds one device.

DSL source remains relative to that binding, so device rebinding does not require text rewriting.

### Statement termination

Trailing `;` is optional. Newline is the normal statement separator; `;` remains an optional explicit separator.

### `if`

`if` is statement-only and always braced.

```text
if $device.fault {
    $self.state = "fault"
} else {
    $self.state = "normal"
}
```

The M6.5 `if ... then ... else ...` expression form is removed from v1.

### `case`

`case` has no `when` keyword.

```text
case $device.state {
    0: $self.state = "stopped"
    1: $self.state = "running"
    _: $self.state = "unknown"
}
```

One-statement arms are unbraced. Multi-statement arms use `{}`.

Fallback uses Rust-style `_:`. It may appear at most once and must be final.

---

## 3. M9 authority consequence

Scene DSL assignment targets Component Properties only:

```text
$self.<Property> = expression
```

A public Attribute is authored configuration and cannot become a runtime Value Binding target.

The parser/analyzer migration must eventually make that distinction structural instead of relying on a `bindable` flag in one shared namespace.

Component-private visual-rule expressions remain a separate context and may read both resolved Attributes and effective Properties through explicit authority namespaces.

---

## 4. Compatibility boundary

The historical M6.5 DSL record remains evidence of the exploratory parser and is not rewritten as if it had always represented v1.

Where syntax differs, `docs/architecture/scada-dsl-v1.md` is now the target authority.

The existing structured Scene semantic model remains persistence authority. Parser migration must not turn DSL text into canonical runtime persistence.

---

## 5. Next implementation slice

Next: **M9A1.1 Core Definition / authored-state schema authority**.

Target sequence:

```text
ComponentDefinition
    properties-only
        ↓
ComponentDefinition v2 authority
    attributes + properties
        ↓
explicit legacy classifier/migrator
        ↓
Scene authored Attribute values separated from Property fallback values
```

The next code slice should establish the new type/schema authority and deterministic legacy classification before changing Inspector UI.

Parser migration to `$self` / `$device` + `case` follows the schema authority and must use the same first-class Attribute / Property classification rather than inventing a parallel DSL-only distinction.
