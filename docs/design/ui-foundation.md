# SCADA Studio UI Foundation

Status: normative UI foundation for Workspace, SCADA Editor and Component Editor.

This document defines the stable visual language of SCADA Studio. Feature work may introduce new controls and domain-specific states, but it must not invent a parallel palette, type scale, spacing scale or editor layout without first updating this foundation.

## 1. Product character

SCADA Studio is a professional industrial desktop design tool, not a card-heavy SaaS administration dashboard.

The visual language should feel closer to draw.io / Inkscape / desktop IDE tooling than to a marketing or analytics application:

- canvas and document content receive the visual emphasis
- chrome is quiet, neutral and dense
- borders and surface changes establish structure before shadows do
- blue is primarily interaction state, not decoration
- controls are compact but readable
- inspector information is grouped by separators and collapsible sections rather than stacked cards
- repeated UI semantics look and behave the same in SCADA Editor and Component Editor

## 2. Design tokens

Runtime tokens live in `src/styles/tokens.css`.

### 2.1 Color

Primary interaction accent:

```text
accent          #2563eb
accent hover    #1d4ed8
accent pressed  #1e40af
accent soft     #eff6ff
```

Neutral text:

```text
text            #0f172a
secondary       #475569
subtle          #64748b
muted           #94a3b8
```

Surfaces:

```text
surface         #ffffff
surface subtle  #f8fafc
surface muted   #eef2f6
panel           #f5f6f7
canvas          #d9dee5
app background  #e7ecf2
```

Borders:

```text
border          #d8e0e8
border strong   #cbd5e1
border subtle   #e7e9ec
```

Semantic colors are reserved for semantic meaning:

```text
success         #16a34a
warning         #d97706
danger          #dc2626
```

Do not introduce another general-purpose blue/teal/purple accent for ordinary selection or controls. A new semantic color requires a domain reason, not decoration.

## 3. Typography

The Studio uses the local/system UI stack. It does not depend on downloading or redistributing font files.

```text
Inter
ui-sans-serif
system-ui
-apple-system
BlinkMacSystemFont
Segoe UI
Microsoft YaHei
PingFang SC
sans-serif
```

The stable type scale is:

```text
24px  workspace/page heading
14px  editor/product title
12px  normal body and primary labels
11px  toolbar, inspector and compact tool text
10px  status, metadata and secondary hints
```

Normal readable text should not be reduced below 10px merely to increase density. Density should come from less padding, fewer card containers and better row layout.

Monospace content such as IDs, coordinates and technical values uses the `--ui-font-mono` token.

## 4. Spacing

Use the shared scale:

```text
4px
6px
8px
12px
16px
24px
```

Feature CSS should choose the nearest shared spacing token before introducing another local gap.

## 5. Geometry

Stable editor dimensions:

```text
Header                 56px
Canvas toolbar         40px
Canvas status          30px
Left dock             232px
Right inspector       336px
Normal control         28px
Small control          24px
Inspector group head   30px
```

Responsive variants may shrink dock widths, but the semantic layout remains left dock / canvas / right inspector.

Stable radii:

```text
4px   small controls, tags, compact rows
6px   inputs, buttons, tabs
8px   large containers / floating surfaces
999px pills only
```

Do not use large-radius cards as the default grouping mechanism inside an Inspector.

## 6. Editor chrome

Both editors use one spatial grammar:

```text
┌─────────────────────────────────────────────────────────┐
│ Identity              Design / Preview        Actions   │ 56
├─────────────┬─────────────────────────┬─────────────────┤
│ Left Dock   │                         │ Inspector       │
│ 232         │         Canvas          │ 336             │
│             │                         │                 │
├─────────────┴─────────────────────────┴─────────────────┤
│ Canvas / document status                            30  │
└─────────────────────────────────────────────────────────┘
```

Header responsibilities:

- left: product/editor identity and current document identity
- center: Design / Preview mode
- right: document actions, status and low-emphasis `工作台` navigation

Navigation must not be mixed into the left identity block.

## 7. Workspace navigation

The canonical routes established by M6.2.9 are:

```text
#/works
#/scada/:workId
#/components
#/components/:componentId
```

Editors open in the current tab by default. Browser history is part of the navigation model.

## 8. Inspector

Inspector interaction follows the compact tool-palette model:

- one right-side `属性 / 方法 / 事件` navigation grammar where applicable
- collapsible property groups
- group separators rather than padded cards
- label left / value right for ordinary properties
- paired numeric values may use compact two-column rows
- repeated public contract items use summary-first / detail-on-demand where high density matters
- helper text uses the status/meta type tier, not tiny 8px text

Future Component Workbench Style / Rules / Animation configuration should extend the same Inspector rather than create new page-level navigation.

## 9. Toolbar and controls

Toolbar controls are 28px high inside a 40px toolbar.

Primary document actions use the accent color. Supporting actions remain neutral until hover/active state.

Selection, active tabs, focus and binding state may use the accent. Brand decoration should remain restrained so interaction state stays visually meaningful.

## 10. Canvas and status

The canvas uses a neutral gray work surface distinct from white artboards/documents.

Persistent operational information belongs in the 30px bottom status lane. Temporary command feedback may use the same bottom lane / toast treatment. Development milestone text does not belong in production UI.

## 11. Shadows

Shadows are exceptional:

- flat panels and inspector groups use borders/surface changes
- ordinary buttons do not need drop shadows
- floating viewport controls / popovers may use one quiet floating shadow token
- large decorative shadows are out of character for the Studio

## 12. Implementation rules

Authoritative runtime files:

```text
src/styles/tokens.css
src/styles/ui-foundation.css
```

`ui-foundation.css` is intentionally loaded after legacy feature CSS. During migration, feature styles may still contain historical hard-coded values, but the final shared Chrome is governed by the foundation layer.

For new UI code:

1. use an existing token for color, spacing, radius, font size and shared geometry
2. do not introduce a new global visual constant inside a feature stylesheet when a token already expresses it
3. if a genuinely new cross-product primitive is needed, add the token here and document why
4. do not make SCADA Editor and Component Editor solve the same Chrome problem independently
5. do not reduce normal text below 10px to solve a spacing problem
6. do not use cards where a divider/group header communicates the same hierarchy

## 13. Migration boundary

M6.2.10 establishes the foundation and applies it as the final shared style layer. It does not require rewriting every legacy stylesheet in one PR. Existing hard-coded feature values should be migrated opportunistically when those areas are next touched, unless they visibly conflict with this normative foundation.

The objective is to freeze the product language now so M6.3 and later functional work can add capability without repeatedly reopening color, density, header or inspector design decisions.
