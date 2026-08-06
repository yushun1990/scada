# Generic Visual Connections

## 1. Scope

The editor is a generic SCADA composition editor, not a pump-specific diagram tool. Visual connections are drawing primitives that can represent pipes, wires, signal lines, process paths, or arbitrary annotations.

A visual connection must therefore not assume:

- one inlet and one outlet per component;
- mandatory source/target semantics;
- one medium such as water;
- only straight or automatically generated orthogonal paths;
- a fixed relationship between visual geometry and runtime behavior.

Visual connections remain separate from Property, Action, Event, and behavior links.

## 2. Visual anchors are not semantic ports

The editor distinguishes two concepts.

```text
VisualAnchor
A drawing attachment point used by the geometry editor.

SemanticPort
Optional component metadata describing direction, medium, signal type, or runtime meaning.
```

Every component may expose any number of visual anchors. A generic image component should provide a dense default anchor set around its perimeter so users can draw clean diagrams without first defining domain semantics.

The first implementation should provide at least:

- four corner anchors;
- four edge-center anchors;
- additional quarter-edge anchors;
- optional center anchor;
- component-defined custom anchors.

This gives 12 to 17 useful attachment points for a normal rectangular image. A later enhancement may support continuous perimeter attachment, where an endpoint stores a side and normalized offset instead of a named discrete anchor.

```ts
interface VisualAnchorDefinition {
  id: string
  title?: string
  position: { x: number; y: number }
  outward?: { x: number; y: number }
  snapRadius?: number
  role?: 'neutral' | 'source' | 'target' | 'both'
  kinds?: string[]
}
```

`position` uses normalized component coordinates. `role` defaults to `neutral` or `both`; `kinds` is optional. Missing semantic metadata means the anchor is visually compatible with every other neutral anchor.

Semantic input/output validation is an optional component-level rule introduced through the component registry. It must never be required by the base drawing engine.

## 3. Connection endpoints

Visual connections should support attached and free endpoints.

```ts
type ConnectionEndpoint =
  | {
      kind: 'anchor'
      nodeId: string
      anchorId: string
    }
  | {
      kind: 'free'
      point: { x: number; y: number }
    }
```

Attached endpoints follow node movement, rotation, scaling, grouping, and ungrouping. Free endpoints allow standalone lines, annotations, and partially constructed diagrams.

The current `{ nodeId, portId }` representation can migrate to `{ kind: 'anchor', nodeId, anchorId: portId }`.

## 4. Path geometry

A connection is not only an endpoint pair. Its path is persisted as an explicit geometry model.

```ts
type ConnectionPath =
  | { kind: 'straight' }
  | {
      kind: 'orthogonal'
      mode: 'auto' | 'manual'
      waypoints: ConnectionWaypoint[]
    }
  | {
      kind: 'polyline'
      waypoints: ConnectionWaypoint[]
    }
  | {
      kind: 'bezier'
      segments: CubicBezierSegment[]
    }

interface ConnectionWaypoint {
  id: string
  point: { x: number; y: number }
}

interface CubicBezierSegment {
  id: string
  end: { x: number; y: number }
  control1: { x: number; y: number }
  control2: { x: number; y: number }
}
```

Waypoints use scene coordinates. They may be inserted, moved, and deleted independently of endpoints.

Orthogonal paths constrain every segment to horizontal or vertical. Polyline paths allow arbitrary straight segments. Bezier paths expose control handles.

## 5. Path editing commands

All persistent path edits belong to the editor command layer.

Required commands:

```text
connect-create
connect-reconnect-endpoint
connect-detach-endpoint
connect-attach-endpoint
connect-insert-waypoint
connect-move-waypoint
connect-delete-waypoint
connect-move-segment
connect-set-path-kind
connect-move-bezier-control
connect-reverse-direction
connect-update-style
connect-update-flow-effect
```

Expected interactions:

- double-click a segment to insert a waypoint;
- drag a waypoint to reshape the path;
- select a waypoint and press Delete to remove it;
- drag an orthogonal segment while preserving horizontal/vertical constraints;
- convert straight, orthogonal, polyline, and Bezier paths from the inspector;
- reconnect either endpoint to any compatible visual anchor;
- detach an endpoint to a free scene point.

## 6. Connection appearance

```ts
interface ConnectionStyle {
  stroke: string
  strokeWidth: number
  opacity: number
  dash: 'solid' | 'dashed' | 'dotted' | number[]
  lineCap: 'butt' | 'round' | 'square'
  lineJoin: 'miter' | 'round' | 'bevel'
  startMarker: 'none' | 'arrow' | 'circle'
  endMarker: 'none' | 'arrow' | 'circle'
}
```

The first generic editor release should support line color, width, opacity, dash pattern, cap, join, and independent start/end markers.

## 7. Flow effects

Flow animation is a visual connection capability and belongs to the M2 connection subsystem. It is not a runtime behavior link.

```ts
interface ConnectionFlowEffect {
  enabled: boolean
  direction: 'forward' | 'reverse'
  speed: number
  mode: 'dash' | 'dots' | 'particles'
  color?: string
  spacing?: number
  size?: number
}
```

Because connections are rendered on Konva Canvas, CSS animation does not animate the actual line geometry. CSS may style surrounding HTML controls, but line animation should use one shared animation scheduler over the connection layer.

Initial implementations:

- `dash`: animate `dashOffset` along the path;
- `dots`: animate a repeated dotted pattern;
- `particles`: move a limited number of markers along measured path length.

All animated connections should share one `requestAnimationFrame` or `Konva.Animation` loop. The scene stores effect configuration, not animation frame state.

## 8. Milestone placement

These capabilities must be completed before the component capability milestone.

```text
M2.3A Generic anchors and endpoint model
  - dense default image anchors
  - optional semantic metadata
  - attached and free endpoints
  - create, select, delete, reconnect

M2.3B Editable path geometry
  - straight, orthogonal, polyline, Bezier
  - arbitrary waypoint insertion, movement, deletion
  - orthogonal segment dragging
  - Bezier control handles

M2.3C Connection appearance and flow effects
  - markers, caps, joins, custom dash patterns
  - forward/reverse flow
  - dash, dots, and particle effects
  - shared animation scheduler and performance validation

M3 Component definitions and Property/Action/Event
```

M3 may add semantic port definitions to a component, but it consumes the generic anchor and connection system rather than defining it.

## 9. Migration from the current prototype

Reusable parts:

- endpoints resolved from node world transforms;
- connection selection and reconnect handles;
- preview-only dragging before command commit;
- pure connection command boundary;
- straight and orthogonal routing helpers;
- single dynamic Konva layer and animation-frame batching.

Parts that must be generalized:

- rename port concepts in the visual layer to anchors;
- remove the `isPumpNode` restriction from anchor lookup;
- replace the hard-coded pump port registry;
- make direction and kinds optional instead of mandatory;
- remove the assumption that every valid connection is output-to-input;
- add free endpoints and persistent path geometry;
- add arbitrary waypoint and curve editing.
