# SCADA Editor Lab Development Plan

## Current direction

The project is a browser-only, generic SCADA composition editor experiment. It is not a pump editor and must not encode pump-specific geometry, inlet/outlet counts, media types, or runtime semantics into the base drawing engine.

Before expanding the component library, the editor must first gain a stable geometry, hierarchy, visual-connection, and component-capability model.

The implementation order is intentionally:

```text
M2.1 Selection, snapping, alignment
  -> M2.2 Hierarchy and grouping
  -> M2.3A Generic anchors and endpoints
  -> M2.3B Editable paths and curves
  -> M2.3C Connection styles and flow effects
  -> M3 Component definitions and Property/Action/Event
  -> M4 Mock runtime and behavior wiring
  -> M5 Component Lab and component expansion
```

The complete visual-connection model is described in [`docs/architecture/visual-connections.md`](docs/architecture/visual-connections.md).

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

## M2.3 Generic visual connections

Visual connections are drawing geometry used for pipes, wires, signal lines, process paths, and annotations. They are not behavior links and do not require Property, Action, Event, input/output direction, or a media type.

The current pump-specific port implementation is considered a prototype. Its transform-following, reconnect-preview, and command-boundary work is reusable, but the hard-coded pump registry and mandatory input/output compatibility are not the target architecture.

### M2.3A Generic anchors and endpoints

#### Scope

- Replace visual `PortDefinition` terminology with `VisualAnchorDefinition` in the geometry layer.
- Allow every component to expose any number of anchors.
- Provide a dense default anchor set for generic image components:
  - corners;
  - edge centers;
  - quarter-edge positions;
  - optional center point.
- Support component-defined custom anchors.
- Make anchor role and kinds optional metadata rather than mandatory constraints.
- Support both attached endpoints and free scene endpoints.
- Keep connection create, select, delete, reconnect, and endpoint-following behavior.
- Remove `isPumpNode` restrictions from anchor resolution.
- Migrate existing `{ nodeId, portId }` endpoints to generic anchor endpoints.

#### Design rule

A visual anchor is a drawing attachment point. A semantic port is optional component metadata introduced through the component registry. The base editor must permit neutral anchor-to-anchor drawing.

#### Acceptance

- A generic image has enough perimeter anchors to route lines cleanly from different sides.
- A connection may attach to any neutral anchor without input/output validation.
- A connection may end at a free scene point.
- Attached endpoints survive move, rotate, resize, group, and ungroup.

### M2.3B Editable paths and curves

#### Scope

- Persist an explicit connection path model.
- Support:
  - straight paths;
  - automatic and manual orthogonal paths;
  - arbitrary polylines;
  - cubic Bezier curves.
- Allow any number of persistent waypoints.
- Insert a waypoint by interacting with a segment.
- Move and delete individual waypoints.
- Drag an orthogonal segment while preserving horizontal/vertical constraints.
- Expose Bezier control handles.
- Convert path kinds through the inspector.
- Detach and reattach endpoints.
- Add path editing through immutable editor commands so undo/redo can be introduced cleanly.

#### Design rule

A connection is not merely an endpoint pair. Endpoints, path geometry, and style are independent persisted concerns.

#### Acceptance

- Users can construct a polyline with any number of bends.
- Users can reshape an orthogonal route without losing right-angle constraints.
- Users can create and edit a smooth curve using control handles.
- Moving an attached component updates endpoints without silently discarding manual path geometry.

### M2.3C Connection styles and flow effects

#### Scope

- Stroke color, width, opacity, line cap, and line join.
- Solid, dashed, dotted, and custom dash patterns.
- Independent start and end markers, including arrows and circles.
- Configurable visual flow direction.
- Flow effects:
  - animated dash offset;
  - moving dots;
  - limited path particles.
- Effect speed, spacing, size, and optional effect color.
- One shared animation scheduler for all animated connections.
- Performance validation with many static and animated connections.

#### Design rule

Connections are rendered inside Konva Canvas. CSS may style editor controls, but it does not animate Canvas line geometry. Flow effects use one shared `requestAnimationFrame` or `Konva.Animation` loop, and frame state is never persisted in `SceneDocument`.

#### Acceptance

- A user can visually indicate forward or reverse flow without creating a runtime behavior link.
- Static connections do not participate in the animation loop.
- Multiple animated lines share one scheduler rather than one timer per connection.
- Animation remains editor/runtime presentation state driven by persisted effect configuration.

## M3 Component definitions and affordances

### Goal

Introduce a component contract inspired by WoT's Property, Action, and Event separation, without importing TD, protocol binding, or network semantics.

M3 consumes the generic anchor and connection subsystem. A component may optionally attach semantic direction, media, or signal metadata to selected anchors, but those semantics do not redefine the base drawing model.

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
  anchors: VisualAnchorDefinition[]
  semanticPorts?: SemanticPortDefinition[]
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
- Properties, actions, events, anchors, and optional semantic ports are discoverable from the registry.

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
- Anchor and optional semantic-port visualization.
- State snapshots.
- Pump, tank, pipe, indicator, numeric display, valve, generic image, and basic shape components.

## Explicit non-goals for the current phase

- Arbitrary JavaScript expressions.
- Full Figma-like vector editing unrelated to SCADA composition.
- General-purpose workflow engine.
- Network-facing WoT Thing Description support.
- MQTT, WebSocket, or backend persistence.
- Collaborative editing.
