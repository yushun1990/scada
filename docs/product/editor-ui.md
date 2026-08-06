# Generic SCADA Editor UI Architecture

## 1. Product posture

The editor is a desktop-first scene-authoring tool. It should feel closer to a lightweight industrial design editor than to a settings dashboard.

The UI must support three different mental models without mixing them:

```text
Workspace navigation
- pan, zoom, fit, rulers, grid

Scene authoring
- components, groups, layers, connections, clipboard, history

Runtime configuration
- properties, bindings, actions, events, behavior links
```

Runtime configuration is introduced later. The initial shell must already reserve clear places for it.

## 2. Main layout

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Main menu + command toolbar                                              │
├───────────────┬──────────────────────────────────────┬───────────────────┤
│ Left dock     │ Document / scene tab bar             │ Right inspector   │
│               ├──────────────────────────────────────┤                   │
│ Components    │                                      │ Selection-aware   │
│ Layers        │ Infinite workspace                   │ properties        │
│ Assets        │   ┌──────────────────────────────┐   │                   │
│               │   │ Fixed-size scene artboard    │   │                   │
│               │   │                              │   │                   │
│               │   └──────────────────────────────┘   │                   │
│               │                                      │                   │
├───────────────┴──────────────────────────────────────┴───────────────────┤
│ Status bar: tool, selection, coordinates, zoom, grid, snap, dirty state │
└──────────────────────────────────────────────────────────────────────────┘
```

Recommended initial dimensions:

```text
Top menu and toolbar      48-56 px
Left dock                 260-300 px
Right inspector           300-340 px
Status bar                26-30 px
Center viewport           remaining area
```

Both side docks should be collapsible. The center viewport must keep working when either dock is hidden.

## 3. Top menu and command toolbar

### 3.1 Main menus

```text
文件   编辑   视图   排列   连接   运行   帮助
File   Edit   View   Arrange Connection Runtime Help
```

### File

- New scene.
- Open or import scene.
- Save to browser.
- Export JSON.
- Scene settings.

### Edit

- Undo and redo.
- Cut, copy, paste, paste in place.
- Duplicate.
- Delete.
- Select all.

### View

- Zoom in and out.
- Reset to 100%.
- Fit scene.
- Fit selection.
- Show grid.
- Show rulers.
- Show guides.
- Show anchors.
- Collapse left or right dock.

### Arrange

- Align and distribute.
- Group and ungroup.
- Layer order.
- Lock and visibility.

### Connection

- Enter connection tool.
- Path kind.
- Endpoint detach and reconnect.
- Flow direction.

### Runtime

Reserved for later milestones:

- Preview.
- Mock values.
- Bindings.
- Behavior links.

### 3.2 Primary toolbar

The always-visible toolbar should remain compact:

```text
[Select] [Pan] [Connect]
[Undo] [Redo]
[Cut] [Copy] [Paste] [Duplicate] [Delete]
[Group] [Ungroup]
[Align menu]
[Preview]
```

Commands that are not valid for the current selection are disabled. The toolbar must call the same command registry used by menus and keyboard shortcuts.

### 3.3 Context toolbar

A second compact row may appear above the viewport based on selection.

#### Node selected

- x, y, width, height, rotation.
- lock aspect ratio.
- align and distribute.
- group and layer order.

#### Connection selected

- path kind.
- stroke width.
- start and end marker.
- flow toggle and direction.

#### No selection

- scene resolution preset.
- background summary.
- fit scene.

The context toolbar should expose frequent values only. Full editing remains in the right inspector.

## 4. Left dock

The left dock uses three top-level tabs.

```text
组件 | 图层 | 资源
Components | Layers | Assets
```

## 4.1 Components tab

### Structure

- Search field.
- Recent components.
- Basic shapes.
- Text and media.
- Industrial equipment.
- Indicators and displays.
- User or project components later.

### First generic component set

```text
Rectangle
Ellipse
Text
Image
SVG
Group
Pump
Valve
Tank
Indicator
Numeric display
```

A component can be clicked to add at the viewport center or dragged onto the scene.

Official interactive industrial components should prefer SVG or structured Konva scene nodes. PNG and JPEG are generic image assets rather than the architectural basis of every component.

## 4.2 Layers tab

The layer tree is required before deeper editing features continue.

Each row shows:

```text
expand/collapse | type icon | name | visibility | lock
```

Required operations:

- Select an item.
- Multi-select tree rows.
- Rename.
- Expand and collapse groups.
- Toggle visibility and lock.
- Drag to reorder siblings.
- Drag into or out of a group.
- Context menu for group, ungroup, duplicate, delete, and layer order.

The tree order is the render order. It must not be a secondary, eventually consistent view.

## 4.3 Assets tab

The first version manages project image and SVG resources:

- Import image or SVG.
- Search by name.
- Show usage count.
- Drag an asset onto the scene to create an Image or SVG node.
- Replace an asset while preserving component geometry.
- Warn before removing an asset that is still in use.

## 5. Center workspace and scene artboard

## 5.1 Infinite workspace

The workspace is editor chrome and should use a neutral gray tone distinct from the scene background.

It supports:

- Pan.
- Zoom.
- Fit scene.
- Fit selection.
- Rulers and guides.
- Optional minimap later.

The workspace itself is not exported.

## 5.2 Fixed scene artboard

The artboard represents the final SCADA scene:

- Fixed width and height.
- Its own background color or image.
- Optional transparency.
- Optional clipping at scene bounds.
- Clear boundary and subtle shadow against the workspace.

Components use scene coordinates relative to the artboard, not viewport coordinates.

## 5.3 Viewport controls

Place compact viewport controls at the bottom-right of the center area:

```text
[-] [100%] [+] [Fit]
```

The percentage opens a small menu:

- 25%.
- 50%.
- 75%.
- 100%.
- 150%.
- 200%.
- Fit scene.
- Fit selection.

## 5.4 Tool behavior

### Select tool

- Click to select.
- Shift/Ctrl/Cmd to add or remove selection.
- Drag empty workspace to marquee-select within the scene.

### Pan tool

- Drag to pan.
- `Space + drag` temporarily activates pan from any tool.
- Middle mouse always pans.

### Connect tool

- Shows visual anchors according to editor preference.
- Creates or reconnects visual connections.
- Does not encode runtime behavior semantics.

## 6. Right inspector

The right inspector changes by selection type. It should not always show the same four component tabs.

## 6.1 No selection: Scene inspector

```text
场景 | 网格 | 背景
Scene | Grid | Background
```

### Scene

- Name.
- Width and height.
- Resolution presets.
- Clip overflow.
- Scene metadata later.

### Grid

- Show grid.
- Grid size.
- Subdivision count.
- Grid snapping.
- Object snapping remains always enabled unless future usability testing proves otherwise.

### Background

- Color.
- Transparent toggle.
- Image asset.
- Fit mode.
- Opacity.
- Position or tile settings when applicable.

## 6.2 Node or group selection

```text
基础 | 外观 | 组件 | 数据 | 交互
Base | Appearance | Component | Data | Interaction
```

Only available tabs are shown.

### Base

- Name.
- x and y.
- width and height.
- rotation.
- parent group.
- visibility and lock.
- layer order.

### Appearance

- opacity.
- fill, stroke, shadow when supported.
- image or SVG asset settings.

### Component

- Schema-generated component properties.

### Data

Reserved for property bindings and runtime values.

### Interaction

Reserved for actions, events, and behavior links.

## 6.3 Connection selection

```text
路径 | 样式 | 端点 | 流动
Path | Style | Endpoints | Flow
```

### Path

- Straight, orthogonal auto, orthogonal manual, polyline, or Bezier.
- Waypoint and curve editing commands.

### Style

- Color, width, opacity.
- Cap and join.
- Dash pattern.
- Start and end markers.

### Endpoints

- Source and target attachment.
- Detach to a free point.
- Reattach to an anchor.
- Reverse visual direction.

### Flow

- Enabled.
- Forward or reverse.
- Dash, dots, or particles.
- Speed, spacing, size, and effect color.

## 6.4 Multi-selection

Show only common editable fields and batch actions:

- Common visibility and lock.
- Alignment and distribution.
- Group.
- Layer order.
- Numeric delta movement.

Do not show misleading single-node property values when selected items disagree.

## 7. Bottom status bar

The status bar shows compact editor state:

```text
Current tool
Selection count or selected item name
Pointer scene coordinates
Scene size
Zoom percentage
Grid state
Snap state
Dirty or saved state
```

Example:

```text
选择 | 3 个对象 | X 428  Y 216 | 1920 × 1080 | 75% | 网格 20 | 已修改
```

## 8. Keyboard and pointer conventions

```text
V                         select tool
H or Space                pan tool / temporary pan
C                         connection tool
Ctrl/Cmd + Z              undo
Ctrl/Cmd + Shift + Z      redo
Ctrl/Cmd + C              copy
Ctrl/Cmd + X              cut
Ctrl/Cmd + V              paste
Ctrl/Cmd + Shift + V      paste in place
Ctrl/Cmd + D              duplicate
Delete / Backspace        delete
Ctrl/Cmd + G              group
Ctrl/Cmd + Shift + G      ungroup
Ctrl/Cmd + 0              fit scene
Ctrl/Cmd + 1              zoom to 100%
Ctrl/Cmd + 2              fit selection
Arrow keys                nudge
Shift + Arrow keys        coarse nudge
Esc                       cancel active interaction
```

Browser-reserved shortcuts must be handled carefully and documented when overridden.

## 9. State ownership

The UI must keep three state categories separate.

### Persisted scene state

- Scene dimensions and background.
- Nodes and groups.
- Visual connections and their paths and styles.
- Component property configuration.
- Bindings and behavior links later.

### Persisted editor preferences

Stored separately from the scene:

- Last zoom preference if desired.
- Panel widths and collapsed state.
- Grid visibility default.
- Recent components.
- Theme.

### Ephemeral interaction state

Never serialized into the scene:

- Current selection.
- Hovered anchor.
- Drag preview.
- Active marquee.
- Open menu.
- Current animation frame.
- Temporary viewport gesture.

## 10. UI delivery slices

### UI-1 Workbench shell

- Top toolbar.
- Left tabs.
- Right scene inspector.
- Status bar.
- Center workspace and artboard.

### UI-2 Viewport and scene settings

- Zoom and pan.
- Fit commands.
- Scene dimensions.
- Background color, transparency, and image.

### UI-3 Editing productivity

- Undo and redo.
- Clipboard.
- Shortcuts.
- Layer tree and z-order.
- Context menus.

### UI-4 Connection editing

- Generic anchors and free endpoints.
- Path inspector.
- Waypoint and curve handles.
- Flow style controls.

### UI-5 Component and runtime integration

- Component and asset libraries.
- Generated component inspector.
- Data bindings.
- Actions, events, and behavior links.

## 11. Immediate UI change policy

The current experiment panel should not be expanded with additional permanent sections.

Before adding more editing controls:

1. Introduce the workbench shell.
2. Move document operations to the top menu or toolbar.
3. Move scene settings to the no-selection inspector.
4. Move alignment and grouping to contextual commands.
5. Add viewport controls and the layer tree.
6. Then resume deeper connection editing.
