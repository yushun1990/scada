# SCADA Editor Lab Development Plan

## 1. Product direction

This repository is a browser-only, generic SCADA composition editor experiment.

It is not a pump editor, a workflow editor, or a device-management platform. The editor must first become a usable scene-authoring workbench before domain-specific components, runtime bindings, and behavior wiring are expanded.

The product model is:

```text
Infinite editor workspace
  contains one fixed-size SCADA scene artboard
    containing components, groups, visual connections, and annotations
```

The infinite workspace owns viewport pan and zoom. The scene artboard owns final width, height, background, export bounds, and runtime presentation.

## 2. Revised implementation order

```text
M0 Product contract and editor shell
  -> M1 Workspace, viewport, and scene settings
  -> M2 Core editing commands, clipboard, history, and layers
  -> M3 Generic visual connections
  -> M4 Component registry, assets, and authoring contract
  -> M5 Runtime values, bindings, and behavior wiring
  -> M6 Production authoring features and component expansion
```

This order replaces the previous connection-first sequence. Existing selection, grouping, snapping, and generic-anchor work remains valid, but the missing workbench foundation is now the immediate priority.

Detailed UI structure is defined in [`docs/product/editor-ui.md`](docs/product/editor-ui.md). Visual connection architecture remains in [`docs/architecture/visual-connections.md`](docs/architecture/visual-connections.md).

## 3. Current implementation map

The repository already contains partial work from several milestones:

```text
M1 partial
- fixed scene size
- scene background color in the document model
- grid display and grid size

M2 partial
- single and multi-selection
- marquee selection
- move, resize, rotate
- snapping and alignment guides
- align and distribute
- persistent grouping and ungrouping
- lock and visibility
- local save, import, and export

M3 partial
- SceneConnection entities
- generic neutral visual anchors
- straight and automatic orthogonal routes
- connection selection, delete, style, and endpoint reconnect
- transform-following endpoints
```

Missing foundational capabilities must be completed before M3 path editing continues.

# M0 Product contract and editor shell

## Goal

Replace the experiment-style control layout with a stable desktop editor information architecture.

## Scope

- Desktop-first application shell.
- Top menu and command toolbar.
- Left dock with `Components`, `Layers`, and `Assets` tabs.
- Center viewport containing the scene artboard.
- Right selection-aware inspector.
- Bottom status bar.
- Contextual toolbars for node, group, connection, and scene editing.
- Consistent keyboard shortcut registry.
- Command availability and disabled-state rules.

## Design rules

- Frequently used commands belong in the toolbar or keyboard shortcuts, not in long side-panel button lists.
- The right inspector changes according to the current selection.
- With no selection, the right inspector edits the scene.
- Editor UI state is not stored in `SceneDocument` unless it affects the exported scene.

## Acceptance

- The shell can host scene settings, layers, component library, viewport controls, and contextual inspectors without adding ad hoc panels.
- The same command is represented by one command identifier even when invoked from a menu, toolbar, shortcut, or context menu.

# M1 Workspace, viewport, and scene settings

## M1.1 Viewport navigation

### Scope

- Viewport transform separated from scene coordinates.
- Zoom from 10% to 800%.
- Cursor-centered wheel zoom.
- `Space + drag` and middle-mouse pan.
- Optional wheel or trackpad pan.
- Zoom in, zoom out, reset to 100%.
- Fit scene to viewport.
- Fit current selection to viewport.
- Viewport coordinate conversion helpers.
- Zoom value shown in the status bar.
- Grid and guides scale correctly with the viewport.

### Design rule

Node transforms remain in scene coordinates. Zooming and panning never rewrite component geometry or connection waypoints.

### Acceptance

- Zooming around the cursor keeps the scene point under the cursor stable.
- A component has the same scene coordinates before and after viewport navigation.
- Selection, dragging, snapping, anchors, connections, and marquee work at every supported zoom level.

## M1.2 Scene artboard and background

### Scope

- Scene width and height editing.
- Common resolution presets and custom dimensions.
- Scene background color.
- Transparent background option.
- Optional scene background image.
- Background image fit modes: `cover`, `contain`, `stretch`, `center`, `tile`.
- Background image opacity.
- Scene overflow and clipping policy.
- Scene origin and artboard shadow inside the infinite workspace.
- Fit scene command after dimension changes.

### Design rule

The workspace background is editor chrome. The scene background is persisted output. They are separate visual layers.

### Acceptance

- Changing the scene background does not change editor panels or workspace color.
- Scene dimensions determine preview and export bounds.
- Components keep their scene coordinates when scene size changes.

## M1.3 View aids

### Scope

- Show or hide grid.
- Grid size and subdivisions.
- Rulers.
- Guide creation from rulers.
- Show or hide anchors, bounds, and connection handles.
- Optional minimap after viewport behavior is stable.

# M2 Core editing commands, clipboard, history, and layers

## M2.1 Command and history foundation

### Scope

- All persisted edits pass through immutable editor commands.
- Undo and redo stacks.
- Transaction boundaries for drag, resize, rotate, multi-move, and property editing.
- Command coalescing for repeated keyboard movement and text/property input.
- Dirty-state tracking.
- Keyboard shortcut registry.

### Required shortcuts

```text
Ctrl/Cmd + Z             undo
Ctrl/Cmd + Shift + Z     redo
Delete / Backspace       delete selection
Arrow keys               nudge selection
Shift + Arrow keys       coarse nudge
Ctrl/Cmd + A             select all in active scope
Esc                      cancel current interaction
```

### Acceptance

- One drag operation produces one undo entry rather than one entry per pointer event.
- Undo and redo restore nodes, groups, connections, and scene properties consistently.

## M2.2 Clipboard and duplication

### Scope

- Copy, cut, and paste nodes, groups, and selected connections.
- Preserve internal hierarchy.
- Preserve internal connections between copied nodes.
- Re-map all copied IDs.
- Paste offset from the original position.
- Paste in place.
- Duplicate command.
- Copy and paste through an internal editor clipboard first.
- Optional system clipboard JSON interoperability later.

### Required shortcuts

```text
Ctrl/Cmd + C             copy
Ctrl/Cmd + X             cut
Ctrl/Cmd + V             paste
Ctrl/Cmd + Shift + V     paste in place
Ctrl/Cmd + D             duplicate
```

### Acceptance

- Copying a group copies its complete subtree.
- Copying connected components preserves connections whose two endpoints are both inside the copied selection.
- External connections are not silently duplicated.

## M2.3 Selection, transforms, snapping, and alignment

### Scope

- Click, additive, and marquee selection.
- Multi-selection movement.
- Resize and rotate.
- Grid and object snapping.
- Alignment guides.
- Align and distribute.
- Reset transform.
- Numeric transform editing.

Most of this scope is already implemented and must be migrated into the command/history boundary.

## M2.4 Hierarchy, groups, and layers

### Scope

- Persistent parent-child hierarchy.
- Group and ungroup.
- Nested group support.
- Layer tree.
- Expand and collapse groups.
- Select from the tree.
- Rename from the tree.
- Lock and visibility from the tree.
- Drag to reorder siblings.
- Move into and out of groups.
- Bring forward, send backward, bring to front, send to back.
- Enter-group editing scope and breadcrumb.

### Acceptance

- Tree order matches render order.
- Grouping and reparenting preserve world appearance.
- Locked items remain selectable from the layer tree according to editor policy but cannot be transformed accidentally.

# M3 Generic visual connections

Visual connections represent pipes, wires, signal lines, process paths, and annotations. They remain separate from runtime behavior links.

## M3.1 Generic anchors and endpoints

### Scope

- Neutral visual anchors independent of pump semantics.
- Dense default anchors for image and rectangular components.
- Component-defined custom anchors.
- Optional semantic role and kind metadata.
- Attached anchor endpoints.
- Free scene endpoints.
- Detach and reattach endpoints.
- Create, select, delete, reconnect.
- Endpoint following after move, rotate, resize, group, and ungroup.

### Current status

Neutral anchors and attached endpoints are implemented. Free endpoints, detach, and reattach remain.

## M3.2 Editable paths and curves

### Scope

- Straight paths.
- Automatic and manual orthogonal paths.
- Arbitrary polylines.
- Cubic Bezier curves.
- Any number of persistent waypoints.
- Insert, move, and delete waypoints.
- Drag an orthogonal segment while preserving constraints.
- Bezier control handles.
- Convert path kinds through the inspector.

## M3.3 Connection style and flow effects

### Scope

- Color, width, opacity, cap, and join.
- Solid, dashed, dotted, and custom dash patterns.
- Independent start and end markers.
- Forward and reverse visual flow.
- Animated dash, dots, and limited path particles.
- Shared animation scheduler.
- Performance validation for many static and animated connections.

# M4 Component registry, assets, and authoring contract

## M4.1 Generic component contract

```ts
interface ComponentDefinition {
  type: string
  title: string
  category: string
  designSize: { width: number; height: number }
  properties: Record<string, PropertyDefinition>
  actions: Record<string, ActionDefinition>
  events: Record<string, EventDefinition>
  anchors: VisualAnchorDefinition[]
  semanticPorts?: SemanticPortDefinition[]
  render: ComponentRenderer
}
```

## M4.2 Component and asset library

### Scope

- Searchable component library.
- Categories and recent components.
- Drag component onto the scene.
- Generic `Image`, `SVG`, `Text`, `Rectangle`, `Ellipse`, `Line`, and `Group` components.
- Industrial components such as pump, valve, tank, indicator, and numeric display.
- Project asset library for images and SVG files.
- Asset replacement without losing node geometry and bindings.

### Design direction

Official interactive industrial components should prefer SVG or structured scene-graph rendering. PNG and JPEG remain valid generic image assets but mainly support whole-object visibility, opacity, transform, and anchors.

## M4.3 Generated inspector

- Base editor properties.
- Component properties generated from schema.
- Action test invocation.
- Event inspection.
- Anchor and optional semantic-port inspection.

# M5 Runtime values, bindings, and behavior wiring

## Scope

- Mock variable store.
- Property bindings.
- Runtime state separated from persisted scene configuration.
- Event-to-action links.
- Event-to-property assignments.
- Small condition operator set.
- Behavior graph stored independently from visual connections.
- Preview mode that disables editing interactions.

# M6 Production authoring features and component expansion

## Scope

- Multiple scenes or pages.
- Scene templates.
- Reusable symbols and component instances.
- Project-level assets.
- Export and import packages.
- Diagnostics for broken assets, anchors, bindings, and behavior links.
- Performance budgets and large-scene profiling.
- Component Lab.
- More industrial components and state variants.

# 4. Immediate execution sequence

The next implementation order is now:

```text
1. M1.1 Viewport pan, zoom, fit scene, and coordinate conversion
2. M1.2 Scene inspector: size, background color, transparency, background image
3. M2.1 Undo/redo command history and dirty state
4. M2.2 Copy, cut, paste, paste in place, and duplicate
5. M2.4 Layer tree, z-order, and group editing scope
6. Resume M3.1 free endpoints and endpoint detach/reattach
7. M3.2 arbitrary waypoints and curves
8. M3.3 markers and flow effects
```

This sequence makes the editor usable as a general scene-authoring tool before deepening connection geometry.

# 5. Explicit non-goals for the current phase

- Backend persistence.
- MQTT, WebSocket, or device protocol integration.
- Collaborative editing.
- Arbitrary JavaScript expressions.
- General-purpose workflow execution.
- Full vector illustration features unrelated to SCADA composition.
- Network-facing WoT Thing Description support.
