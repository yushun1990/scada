# Editor Foundation Architecture

## 1. Why this layer comes before the component library

Snapping, multi-selection, grouping, alignment, and connections are not isolated UI conveniences. They determine how transforms, hierarchy, endpoints, and component capabilities are represented in `SceneDocument`.

The editor therefore separates five concerns:

```text
Scene model
Geometry engine
Editor command layer
Component registry
Runtime affordance layer
```

Konva remains the renderer and interaction adapter. It is not the owner of scene state.

## 2. Scene entities

The next scene version should distinguish nodes, connections, and behavior links.

```ts
interface SceneDocument {
  version: 2
  id: string
  name: string
  width: number
  height: number
  background: string
  editor: EditorSceneSettings
  nodes: SceneNode[]
  connections: SceneConnection[]
  behaviors: BehaviorLink[]
}
```

`connections` are visible pipes, wires, and lines. `behaviors` are runtime event/property/action relationships. They must not share one overloaded edge type.

## 3. Node hierarchy

```ts
interface SceneNode {
  id: string
  type: string
  name: string
  parentId: string | null
  transform: LocalTransform
  visible: boolean
  locked: boolean
  propertyValues: Record<string, unknown>
}
```

A transform is local to `parentId`. Root nodes are local to the scene.

```ts
interface LocalTransform {
  x: number
  y: number
  width: number
  height: number
  rotation: number
}
```

`core.group` is a normal scene node whose children point to it through `parentId`. Grouping and ungrouping use world/local transform conversion so visual placement does not jump.

## 4. Selection model

```ts
interface EditorSelection {
  nodeIds: string[]
  connectionIds: string[]
  primaryId: string | null
}
```

Selection is editor state and is not persisted in the scene file.

Rules:

- A plain click replaces selection.
- Shift/Ctrl adds or removes an item.
- Marquee selection selects intersecting unlocked entities.
- `primaryId` supplies the reference object for some alignment commands.
- Grouping and alignment operate through editor commands, not direct Konva mutation.

## 5. Geometry engine

The geometry engine provides pure functions:

```ts
getWorldTransform(scene, nodeId)
getWorldBounds(scene, nodeId)
worldToLocal(scene, parentId, worldTransform)
localToWorld(scene, nodeId)
computeSelectionBounds(scene, nodeIds)
```

It must not import React or Konva.

## 6. Snapping

```ts
interface SnapSettings {
  enabled: boolean
  gridEnabled: boolean
  gridSize: number
  objectEnabled: boolean
  threshold: number
}
```

A snap candidate contains the proposed world transform and excludes entities in the active selection.

Object snap targets:

- left, horizontal center, right;
- top, vertical center, bottom;
- optional port positions when connection mode is active.

The result returns both the adjusted transform and temporary guide descriptors.

```ts
interface SnapResult {
  transform: WorldTransform
  guides: AlignmentGuide[]
}
```

Guides are transient editor overlays and never persist in `SceneDocument`.

## 7. Alignment and distribution

Alignment commands operate on world bounds, then convert results back into each node's local parent space.

Commands:

```text
align-left
align-center-x
align-right
align-top
align-center-y
align-bottom
distribute-horizontal
distribute-vertical
```

Distribution requires at least three items. Locked nodes may be alignment references but are not mutated unless explicitly included by future policy.

## 8. Groups

Grouping selected nodes performs one atomic command:

1. Compute selection world bounds.
2. Create a `core.group` at those world bounds.
3. Convert each selected node's world transform into group-local coordinates.
4. Set each selected node's `parentId` to the new group.
5. Replace selection with the new group.

Ungroup performs the inverse and preserves each child's current world transform.

Nested groups are allowed by the model even if the first UI only exposes one level.

## 9. Component ports and visual connections

Ports belong to the component definition, not individual scene instances unless overridden.

```ts
interface PortDefinition {
  id: string
  title: string
  position: { x: number; y: number }
  direction: 'input' | 'output' | 'bidirectional'
  kinds: string[]
}
```

Port positions use normalized component coordinates from `0` to `1`.

```ts
interface SceneConnection {
  id: string
  type: string
  source: ConnectionEndpoint
  target: ConnectionEndpoint
  routing: 'straight' | 'orthogonal'
  waypoints: Point[]
  style: ConnectionStyle
}

interface ConnectionEndpoint {
  nodeId: string
  portId: string
}
```

A connection endpoint is resolved from node world transform plus its port definition. Moving or grouping a node therefore moves the endpoint automatically.

## 10. Component capability model

The project borrows WoT's separation into Property, Action, and Event, but these are local front-end component affordances.

```ts
interface ComponentDefinition {
  type: string
  title: string
  category: string
  designSize: Size
  properties: Record<string, PropertyDefinition>
  actions: Record<string, ActionDefinition>
  events: Record<string, EventDefinition>
  ports: PortDefinition[]
  render: ComponentRenderer
}
```

### 10.1 Property

```ts
interface PropertyDefinition {
  title: string
  type: 'string' | 'number' | 'boolean' | 'color' | 'enum'
  defaultValue: unknown
  readable: boolean
  writable: boolean
  bindable: boolean
  persisted: boolean
  editor: PropertyEditorDefinition
}
```

Property schema lives in the component definition. A node only stores values that differ from defaults or that must persist.

Properties are divided conceptually into:

- base editor properties: name, geometry, visibility, lock, order;
- component properties: state, label, level, color, running;
- runtime properties: temporary evaluated values that do not mutate scene configuration.

### 10.2 Action

```ts
interface ActionDefinition {
  title: string
  input?: ValueSchema
  output?: ValueSchema
}
```

An action is invoked explicitly. It is not represented as a writable property.

### 10.3 Event

```ts
interface EventDefinition {
  title: string
  data?: ValueSchema
}
```

An event is an occurrence. It does not retain a current value unless a separate property models that state.

Pointer events such as `pointerdown` are editor/render events. Semantic events such as `alarmRaised` and `stateChanged` are component events. The two APIs must remain separate.

## 11. Right-side inspector

The inspector uses four tabs:

```text
基础 | 属性 | 动作 | 事件
```

### 基础

- name;
- x/y;
- width/height;
- rotation;
- visible;
- locked;
- parent/group;
- layer order.

For multi-selection, common editable values and alignment/distribution commands are shown.

### 属性

Generated from `PropertyDefinition.editor`. Changes write to persisted component values unless the definition is runtime-only.

### 动作

Lists component actions. M3 allows manual mock invocation and input editing. M4 allows behavior links to invoke actions.

### 事件

Lists event definitions, recent emitted mock events, and the entry point for creating behavior links.

## 12. Behavior links

Behavior links are introduced after visual connections.

```ts
interface BehaviorLink {
  id: string
  source: {
    nodeId: string
    event: string
  }
  target:
    | { nodeId: string; action: string }
    | { nodeId: string; property: string }
  condition?: SimpleCondition
}
```

They are not drawn as pipes by default and are not stored in `SceneConnection`.

## 13. Command boundary

Every persisted edit is executed as an editor command:

```ts
interface EditorCommand {
  execute(scene: SceneDocument): SceneDocument
  undo(scene: SceneDocument): SceneDocument
}
```

The initial implementation may use immutable command functions before adding a full class hierarchy. The important boundary is that drag, align, group, connect, and property edits all become scene transactions. This creates a clean path to undo/redo.

## 14. Immediate implementation slice

The next coding slice is M2.1:

1. Replace single selection with multi-selection state.
2. Add world-bounds geometry helpers.
3. Add grid and object snapping with guide overlays.
4. Add alignment and distribution commands.
5. Add marquee selection.

Grouping follows only after these geometry helpers are stable. Connections follow after hierarchy is stable. Component Property/Action/Event integration follows after both are represented in the scene model.
