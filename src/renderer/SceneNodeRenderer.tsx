import { forwardRef } from 'react'
import type Konva from 'konva'
import { Group, Rect } from 'react-konva'
import { PumpNode } from '../components/PumpNode'
import {
  isGroupNode,
  type NodeTransform,
  type SceneDocument,
  type SceneNode,
} from '../scene/model'

export type SceneNodeRendererProps = {
  scene: SceneDocument
  node: SceneNode
  transform: NodeTransform
  editorMode: boolean
  selectable: boolean
  parentVisible?: boolean
  parentLocked?: boolean
}

export const SceneNodeRenderer = forwardRef<
  Konva.Group,
  SceneNodeRendererProps
>(function SceneNodeRenderer(
  {
    scene,
    node,
    transform,
    editorMode,
    selectable,
    parentVisible = true,
    parentLocked = false,
  },
  ref,
) {
  const effectiveVisible = parentVisible && node.visible
  const effectiveLocked = parentLocked || node.locked
  const displayVisible = editorMode || effectiveVisible
  const displayOpacity = effectiveVisible ? 1 : 0.2

  if (isGroupNode(node)) {
    const children = scene.nodes.filter(
      (candidate) => candidate.parentId === node.id,
    )
    const scaleX = transform.width / node.props.designWidth
    const scaleY = transform.height / node.props.designHeight

    return (
      <Group
        ref={ref}
        id={selectable ? node.id : undefined}
        name={selectable ? 'scene-node' : undefined}
        x={transform.x}
        y={transform.y}
        width={node.props.designWidth}
        height={node.props.designHeight}
        rotation={transform.rotation}
        scaleX={scaleX}
        scaleY={scaleY}
        draggable={selectable && editorMode && !effectiveLocked}
        visible={displayVisible}
        opacity={displayOpacity}
        listening={selectable}
      >
        <Rect
          width={node.props.designWidth}
          height={node.props.designHeight}
          fill="rgba(56, 189, 248, 0.01)"
          listening={selectable}
        />

        {children.map((child) => (
          <SceneNodeRenderer
            key={child.id}
            scene={scene}
            node={child}
            transform={child.transform}
            editorMode={editorMode}
            selectable={false}
            parentVisible={effectiveVisible}
            parentLocked={effectiveLocked}
          />
        ))}
      </Group>
    )
  }

  return (
    <PumpNode
      ref={ref}
      nodeId={selectable ? node.id : undefined}
      state={node.props.state}
      {...transform}
      draggable={selectable && editorMode && !effectiveLocked}
      visible={displayVisible}
      opacity={displayOpacity}
      listening={selectable}
    />
  )
})
