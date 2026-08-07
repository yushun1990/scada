import { forwardRef, useCallback, useEffect, useRef } from 'react'
import type Konva from 'konva'
import { Group, Rect } from 'react-konva'
import { PumpNode } from '../components/PumpNode'
import { getNodeBounds } from '../scene/geometry'
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

type Point = {
  x: number
  y: number
}

export const SceneNodeRenderer = forwardRef<
  Konva.Group,
  SceneNodeRendererProps
>(function SceneNodeRendererImpl(
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
  const rootRef = useRef<Konva.Group | null>(null)
  const effectiveVisible = parentVisible && node.visible
  const effectiveLocked = parentLocked || node.locked
  const displayVisible = editorMode || effectiveVisible
  const displayOpacity = effectiveVisible ? 1 : 0.2

  const bindRootRef = useCallback(
    (instance: Konva.Group | null) => {
      rootRef.current = instance

      if (typeof ref === 'function') {
        ref(instance)
      } else if (ref) {
        ref.current = instance
      }
    },
    [ref],
  )

  const constrainDragPosition = useCallback(
    (absolutePosition: Point) => {
      const instance = rootRef.current
      const parent = instance?.getParent()

      if (!selectable || !instance || !parent) {
        return absolutePosition
      }

      const parentTransform = parent.getAbsoluteTransform().copy()
      const localPosition = parentTransform
        .copy()
        .invert()
        .point(absolutePosition)
      const proposedTransform = {
        ...transform,
        x: localPosition.x,
        y: localPosition.y,
      }
      const bounds = getNodeBounds(scene, node, {
        [node.id]: proposedTransform,
      })

      // A node that is already larger than the artboard cannot be made valid by
      // translating it. Keep its current origin rather than introducing jitter.
      if (bounds.width > scene.width || bounds.height > scene.height) {
        return parentTransform.point({ x: transform.x, y: transform.y })
      }

      let offsetX = 0
      let offsetY = 0

      if (bounds.left < 0) {
        offsetX = -bounds.left
      } else if (bounds.right > scene.width) {
        offsetX = scene.width - bounds.right
      }

      if (bounds.top < 0) {
        offsetY = -bounds.top
      } else if (bounds.bottom > scene.height) {
        offsetY = scene.height - bounds.bottom
      }

      return parentTransform.point({
        x: localPosition.x + offsetX,
        y: localPosition.y + offsetY,
      })
    },
    [node, scene, selectable, transform],
  )

  useEffect(() => {
    const instance = rootRef.current

    if (!selectable || !instance) {
      return
    }

    const originalPositionMethod = instance.position
    const originalPosition = originalPositionMethod.bind(instance) as (
      next?: Point,
    ) => Point | Konva.Group

    // Konva owns the primary node position while native dragging is active.
    // SceneRenderer still refreshes dependent visuals during drag, but any
    // preview .position() write to this node is ignored until dragEnd. This
    // removes the competing position source that caused pointer drift/flicker.
    instance.position = ((next?: Point) => {
      if (next && instance.isDragging()) {
        return instance
      }

      return originalPosition(next)
    }) as typeof instance.position

    return () => {
      instance.position = originalPositionMethod
    }
  }, [selectable])

  if (isGroupNode(node)) {
    const children = scene.nodes.filter(
      (candidate) => candidate.parentId === node.id,
    )
    const scaleX = transform.width / node.props.designWidth
    const scaleY = transform.height / node.props.designHeight

    return (
      <Group
        ref={bindRootRef}
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
        dragBoundFunc={selectable ? constrainDragPosition : undefined}
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
      ref={bindRootRef}
      nodeId={selectable ? node.id : undefined}
      state={node.props.state}
      {...transform}
      draggable={selectable && editorMode && !effectiveLocked}
      dragBoundFunc={selectable ? constrainDragPosition : undefined}
      visible={displayVisible}
      opacity={displayOpacity}
      listening={selectable}
    />
  )
})
