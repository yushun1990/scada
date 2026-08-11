# SCADA Studio UI Primitives

Status: normative implementation layer below feature UI and above the visual tokens defined by `docs/design/ui-foundation.md`.

## Decision

SCADA Studio uses Base UI as the headless interaction/accessibility foundation for reusable controls, while SCADA Studio owns all visual styling through its existing design tokens.

```text
Base UI behavior / accessibility
            ↓
Studio UI primitives (`src/ui`)
            ↓
Studio design tokens (`src/styles/tokens.css`)
            ↓
Workspace / SCADA Editor / Component Editor
```

Base UI is deliberately used as a headless primitive layer, not as a second visual theme. Feature code consumes Studio wrappers instead of importing Base UI directly when a Studio primitive already exists.

## Why this layer exists

Design tokens alone do not guarantee correct control geometry or behavior. Repeated native buttons previously reimplemented alignment, line-height, disabled/focus behavior, toolbar spacing and active state in multiple feature stylesheets. That allowed low-level defects such as vertically misaligned labels and inconsistent action spacing to recur.

The primitive layer centralizes those guarantees once.

## Primitive set

The Studio owns the following shared controls under `src/ui`:

- `Button`
- `IconButton`
- `Pressable` for structural click targets whose layout belongs to the feature
- `Input`
- `NumberInput`
- `Textarea`
- `SegmentedControl`
- `Tabs`
- `Select`
- `Checkbox`
- `Tooltip`
- `Separator`
- `Toolbar` / `ToolbarGroup` / `ToolbarButton` / `ToolbarSeparator`

`Pressable` is intentionally distinct from `Button`. Tree rows, collapsible section headers and summary rows are button semantics but must retain their feature-specific geometry rather than inheriting ordinary action-button padding and sizing.

## Mandatory business-UI boundary

After M6.2.12, business UI under `src/**/*.tsx` must not directly create native form/action controls. The only place allowed to own native button/input/select/textarea implementation details is `src/ui`.

The repository enforces this with `scripts/check-ui-primitives.mjs`, which is part of `npm run lint`.

The following are rejected outside `src/ui`:

```text
<button>
<select>
<input>
<textarea>
```

This turns primitive migration from a future-maintainer convention into a CI invariant. If a new interaction shape is not represented by the existing primitive set, add a Studio primitive first instead of bypassing the layer in feature code.

## Button hierarchy

The common variants are:

```text
primary    deliberate document/creation action; accent fill + white text
accent     important secondary navigation/action; accent-soft fill + accent text
secondary  neutral bordered action
ghost      low-emphasis tool/list action
danger     destructive action
```

All Studio buttons use centered flex geometry, a stable tokenized height and `line-height: 1`. Feature code must not repair text centering with per-button padding offsets.

Header example:

```text
草稿   [保存]   |   [← 工作台]
        primary       accent
```

`工作台` is a real member of the document toolbar. It must not be implemented with fixed positioning, magic right margins or an invisible reserved lane.

## Tabs and segmented controls

- Design / Preview is a segmented control.
- Inspector `属性 / 方法 / 事件` is a tab control.
- Workspace/dock navigation that behaves as a persistent choice should use Tabs or another Studio selection primitive.
- Active styling comes from Base UI state attributes and Studio tokens rather than feature-specific native-button state handling.

## Toolbar

SCADA Canvas Toolbar uses the Studio Toolbar layer backed by Base UI. Toolbar groups and toolbar buttons must not fall back to independent native buttons.

Icon-only toolbar actions keep an accessible name through `aria-label`; `title` or Tooltip may supplement it but never replace the accessible name.

## Form controls

Inspector and Component Workbench authoring use Studio `Input`, `NumberInput`, `Textarea`, `Select` and `Checkbox`.

The form primitives own common geometry, focus/disabled treatment, font sizing and token consumption. Domain-specific layout remains with feature CSS through containers such as `property-field`, `property-grid` and contract rows.

## Dependency boundary

`@base-ui/react` is the allowed headless UI dependency for this layer.

Feature modules do not import `@base-ui/react/*` directly when a wrapper exists in `src/ui`. If the Studio needs a new primitive, add or extend it under `src/ui` first and style it with shared tokens.

## Styling boundary

Authoritative visual inputs remain:

```text
src/styles/tokens.css
src/styles/ui-foundation.css
src/ui/ui-primitives.css
```

Base UI does not bring a product theme or bundled visual CSS. Studio tokens remain the single source for color, size, spacing and radius.

## Migration and regression rule

M6.2.12 completes the broad migration rather than leaving a progressive backlog. Future work may refine or replace primitives, but it must preserve the business-UI boundary enforced by CI.

When a feature needs a control not covered today:

1. define the interaction semantics,
2. add or extend a primitive in `src/ui`,
3. consume Studio tokens for its visual behavior,
4. use the primitive from the feature,
5. keep the primitive audit green.

This prevents future feature delivery from silently recreating a parallel layer of native controls and one-off CSS fixes.
