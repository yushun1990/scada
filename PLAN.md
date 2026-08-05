# SCADA Editor Lab Development Plan

## Current direction

The project is a browser-only SCADA interaction experiment. Before expanding the component library, the editor must first gain a stable geometry, hierarchy, connection, and component-capability model.

The implementation order is intentionally:

```text
M2.1 Selection, snapping, alignment
  -> M2.2 Hierarchy and grouping
  -> M2.3 Ports and visual connections
  -> M3 Component definitions and Property/Action/Event
  -> M4 Mock runtime and behavior wiring
  -> M5 Component Lab and component expansion
```

## M2.1 Selection, snapping, alignment

### Scope

- Selection model changes from one `selectedNodeId` to ordered `selectedNodeIds`.
- Click selection, Shift/Ctrl additive selection, and marquee selection.
- Grid snapping with configurable step and threshold.
- Object snapping against left, center, right, top, middle, and bottom axes.
- Temporary alignment guides while dragging.
- Align left/center/right/top/middle/bottom.
- Distribute horizontally and vertically.
- Move selection as one transaction.

### Design rule

Snapping and alignment are pure geometry operations over scene data. Konva nodes are render targets, not the source of geometry truth.

### Acceptance

- Dragging a node near grid or another node produces stable snap behavior and visible guides.
- A multi-selection can be aligned or evenly distributed without changing component proportions.
- Runtime property updates never enter the editor selection or geometry command path.

## M2.2 Hierarchy and grouping

### Scope

- Add persistent parent/child hierarchy.
- Introduce `core.group` scene nodes.
- Child transforms are stored relative to the parent group.
- Group and ungroup preserve every child's world position and rotation.
- Group move, rotate, proportional resize, lock, visibility, and z-order.
- Layer tree displays hierarchy.

### Design rule

Grouping is not only temporary multi-selection. It is a persisted scene relationship and must survive export/import.

### Acceptance

- Grouping selected nodes does not visually move them.
- Moving or rotating a group updates all children consistently.
- Ungrouping preserves the current world appearance.

## M2.3 Ports and visual connections

### Scope

- Component definitions expose normalized connection ports.
- Add `SceneConnection` as a first-class scene entity separate from components.
- Connection endpoints reference `{ nodeId, portId }`, never absolute endpoint coordinates.
- Straight and orthogonal routes.
- Optional manual waypoints.
- Connection selection, style editing, delete, and reconnect.
- Connections update automatically when nodes or groups move.

### Design rule

Visual connections are not event/action behavior links. A pipe or wire is scene geometry; behavior wiring is introduced later in M4.

### Acceptance

- A connection remains attached after moving, rotating, grouping, or ungrouping a component.
- Invalid or missing endpoint references are detected during scene import.

## M3 Component definitions and affordances

### Goal

Introduce a component contract inspired by WoT's Property, Action, and Event separation, without importing TD, protocol binding, or network semantics.

### Component definition

```ts
interface ComponentDefinition {
  type: string
  title: string
  category: string
  designSize: { width: number; height: number }
  properties: Record<string, PropertyDefinition>
  actions: Record<string, ActionDefinition>
  events: Record<string, EventDefinition>
  ports: PortDefinition[]
  render: ComponentRenderer
}
```

### Right property panel

The right side is divided into:

1. `基础`: name, position, size, rotation, visibility, lock, layer order.
2. `属性`: schema-generated component property editors.
3. `动作`: action definitions and manual test invocation.
4. `事件`: event definitions, latest mock payload, and behavior-link entry points.

### Property

A property is a readable component value and may be writable, bindable, persisted, or runtime-only.

Examples:

- `state`
- `opacity`
- `running`
- `level`
- `label`

The definition owns schema and editor metadata. The scene node stores only property values and overrides.

### Action

An action is an explicitly invoked component operation.

Examples:

- `start`
- `stop`
- `reset`
- `open`
- `close`
- `acknowledgeAlarm`

M3 only supports manual mock invocation. Cross-component behavior is introduced in M4.

### Event

An event is a component-emitted occurrence, not a continuously readable value.

Examples:

- `clicked`
- `alarmRaised`
- `stateChanged`
- `animationCompleted`

Editor pointer events and component semantic events remain separate APIs.

### Acceptance

- Adding a component definition automatically generates its property panel.
- `SceneRenderer` does not require a switch statement for every new component.
- Properties, actions, events, and ports are discoverable from the registry.

## M4 Mock runtime and behavior wiring

- Mock variable store.
- Property bindings.
- Event-to-action links.
- Event-to-property assignments.
- Condition comparison with a deliberately small operator set.
- Runtime state separated from persisted scene configuration.
- Behavior graph is stored independently from visual connections.

## M5 Component Lab and expansion

- Dedicated Component Lab.
- Property controls generated from definitions.
- Action invocation and emitted-event log.
- Port visualization.
- State snapshots.
- Pump, tank, pipe, indicator, numeric display, and valve components.

## Explicit non-goals for the current phase

- Arbitrary JavaScript expressions.
- Full Figma-like vector editing.
- General-purpose workflow engine.
- Network-facing WoT Thing Description support.
- MQTT, WebSocket, or backend persistence.
- Collaborative editing.
