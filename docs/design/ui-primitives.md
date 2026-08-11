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

Base UI is deliberately used as a headless primitive layer, not as a second visual theme. Feature code should consume Studio wrappers instead of importing Base UI directly when a Studio primitive already exists.

## Why this layer exists

Design tokens alone do not guarantee correct control geometry or behavior. Repeated native buttons previously reimplemented alignment, line-height, disabled/focus behavior, toolbar spacing and active state in multiple feature stylesheets. That allowed low-level defects such as vertically misaligned labels and inconsistent action spacing to recur.

The primitive layer centralizes those guarantees once.

## Initial primitives

M6.2.11 establishes:

- `Button`
- `IconButton`
- `SegmentedControl`
- `Tabs`
- `Select`
- `Checkbox`
- `Tooltip`
- `Separator`
- Base-UI-backed Toolbar exports for later canvas-toolbar migration

The initial migration is intentionally incremental. It first moves high-visibility document actions, Component Editor mode/tabs and Workspace actions. Existing feature controls remain valid until touched by a focused migration.

## Button hierarchy

The common variants are:

```text
primary    deliberate document/creation action; accent fill + white text
accent     important secondary navigation/action; accent-soft fill + accent text
secondary  neutral bordered action
ghost      low-emphasis tool/list action
danger     destructive action
```

All Studio buttons must use `inline-flex`, centered content, a stable tokenized height and `line-height: 1`. Feature code should not repair text centering with per-button padding offsets.

Header example:

```text
草稿   [保存]   |   [← 工作台]
        primary       accent
```

`工作台` is a real member of the document toolbar. It must not be implemented with fixed positioning, magic right margins or an invisible reserved lane.

## Tabs and segmented controls

- Design / Preview is a segmented control.
- Inspector `属性 / 方法 / 事件` is a tab control.
- Active styling comes from Base UI state attributes and Studio tokens rather than feature-specific `active` button classes.

## Select / Checkbox / Tooltip

These primitives are available for progressive migration of Inspector and toolbar controls. New feature UI should prefer them when the corresponding Studio primitive satisfies the requirement.

Tooltips are supplementary labels only; icon-only actions must still have an accessible name.

## Dependency boundary

`@base-ui/react` is the allowed headless UI dependency for this layer.

New feature modules should not import `@base-ui/react/*` directly when a wrapper exists in `src/ui`. If the Studio needs a new primitive, add or extend it under `src/ui` first and style it with shared tokens.

## Styling boundary

Authoritative visual inputs remain:

```text
src/styles/tokens.css
src/styles/ui-foundation.css
src/ui/ui-primitives.css
```

Base UI does not bring a product theme or bundled visual CSS. Studio tokens remain the single source for color, size, spacing and radius.

## Migration rule

Do not perform a full-site component rewrite merely to increase wrapper coverage. Migrate controls when:

- the area is currently being changed,
- inconsistent behavior/geometry is visible,
- accessibility behavior benefits from the primitive,
- or a repeated control family can be replaced in a focused low-risk slice.

This keeps the UI foundation stable while avoiding a broad regression-prone rewrite before M6.3 functional work.
