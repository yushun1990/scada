import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
} from 'react'
import type Konva from 'konva'
import { Group, Rect } from 'react-konva'
import { builtInComponentRegistry } from '../component-system/builtins'
import { previewRuntime, resolveEffectiveComponentProps } from '../runtime'
import type { RuntimeValueSnapshot } from '../runtime'
import { getNodeBounds } from '../scene/geometry'
import {
  clearLiveNodeTransform,
  setLiveNodeTransform,
} from '../scene/live-preview'
import {
  isGroupNode,
  type NodeTransform,
  type SceneDocument,
  type SceneNode,
} from '../scene/model'

type Point = {
  x: number
  y: number
}

const EMPTY_RUNTIME_VALUES: RuntimeValueSnapshot = Object.freeze({})
const subscribeToNothing = () => () => undefined
const getEmptyRuntimeValues = () => EMPTY_RUNTIME_VALUES

export type SceneNodeRendererProps = {
  scene: SceneDocument
  node: SceneNode
  transform: NodeTransform
  editorMode: boolean
  selectable: boolean
  resolveDragPosition?: (nodeId: string, position: Point) => Point
  parentVisible?: boolean
  parentLocked?: boolean
  runtimeValues?: RuntimeValueSnapshot
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
    resolveDragPosition,
    parentVisible = true,
    parentLocked = false,
    runtimeValues,
  },
  ref,
) {
  const rootRef = useRef<Konva.Group | null>(null)
  const effectiveVisible = parentVisible && node.visible
  const effectiveLocked = parentLocked || node.locked
  const displayVisible = editorMode || effectiveVisible
  const displayOpacity = effectiveVisible ? 1 : 0.2
  const previewRuntimeActive =
    runtimeValues === undefined && selectable && !editorMode

  useEffect(() => {
    if (!previewRuntimeActive) {
      return
    }

    return previewRuntime.acquire(scene)
  }, [previewRuntimeActive, scene])

  const previewRuntimeValues = useSyncExternalStore(
    previewRuntimeActive ? previewRuntime.values.subscribe : subscribeToNothing,
    previewRuntimeActive ? previewRuntime.values.getSnapshot : getEmptyRuntimeValues,
    getEmptyRuntimeValues,
  )
  const effectiveRuntimeValues = runtimeValues ?? previewRuntimeValues

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

      const boundedPosition = {
        x: localPosition.x + offsetX,
        y: localPosition.y + offsetY,
      }
      const resolvedPosition = resolveDragPosition
        ? resolveDragPosition(node.id, boundedPosition)
        : boundedPosition

      return parentTransform.point(resolvedPosition)
    },
    [node, resolveDragPosition, scene, selectable, transform],
  )

  useEffect(() => {
    const instance = rootRef.current

    if (!selectable || !instance) {
      return
    }

    const syncLiveTransform = () => {
      const width = isGroupNode(node)
        ? node.props.designWidth * Math.abs(instance.scaleX())
        : instance.width()
      const height = isGroupNode(node)
        ? node.props.designHeight * Math.abs(instance.scaleY())
        : instance.height()

      setLiveNodeTransform(node.id, {
        x: instance.x(),
        y: instance.y(),
        width,
        height,
        rotation: instance.rotation(),
      })
    }
    const finishLiveTransform = () => {
      clearLiveNodeTransform(node.id)

      if (!resolveDragPosition) {
        return
      }

      // Live dragging deliberately bypasses snapping. Once Konva emits
      // dragend, resolve the final local position again so grid/object snapping
      // happens exactly once before the stage commits the transform.
      const resolvedPosition = resolveDragPosition(node.id, {
        x: instance.x(),
        y: instance.y(),
      })
      instance.setAttrs({
        x: resolvedPosition.x,
        y: resolvedPosition.y,
      })
    }
    const clearLiveTransform = () => {
      clearLiveNodeTransform(node.id)
    }

    instance.on('dragstart.live-anchor', syncLiveTransform)
    instance.on('dragmove.live-anchor', syncLiveTransform)
    instance.on('dragend.live-anchor', finishLiveTransform)

    return () => {
      instance.off('.live-anchor')
      clearLiveTransform()
    }
  }, [node, resolveDragPosition, selectable])

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
    // Dependent visuals may request the same preview position, but writing it
    // back through position() competes with Konva's drag bookkeeping and causes
    // the node to lag behind the pointer or flicker. Snapping is resolved in
    // dragBoundFunc before Konva applies the position instead.
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
            runtimeValues={effectiveRuntimeValues}
          />
        ))}
      </Group>
    )
  }

  const registration = builtInComponentRegistry.get(node.type)
  const ComponentRenderer = registration?.renderer
  const effectiveProps = registration
    ? resolveEffectiveComponentProps(
        registration.definition,
        node.props,
        node.bindings,
        effectiveRuntimeValues,
      )
    : node.props
  const commonRendererProps = {
    nodeId: selectable ? node.id : undefined,
    props: effectiveProps,
    ...transform,
    draggable: selectable && editorMode && !effectiveLocked,
    dragBoundFunc: selectable ? constrainDragPosition : undefined,
    visible: displayVisible,
    opacity: displayOpacity,
    listening: selectable,
  }

  if (ComponentRenderer) {
    return <ComponentRenderer ref={bindRootRef} {...commonRendererProps} />
  }

  // Keep an unavailable component selectable so a missing registration never
  // makes scene content impossible to inspect or delete.
  return (
    <Group
      ref={bindRootRef}
      id={selectable ? node.id : undefined}
      name={selectable ? 'scene-node' : undefined}
      x={transform.x}
      y={transform.y}
      width={transform.width}
      height={transform.height}
      rotation={transform.rotation}
      draggable={commonRendererProps.draggable}
      dragBoundFunc={commonRendererProps.dragBoundFunc}
      visible={displayVisible}
      opacity={displayOpacity}
      listening={selectable}
    >
      <Rect
        width={transform.width}
        height={transform.height}
        fill="rgba(239, 68, 68, 0.08)"
        stroke="#dc2626"
        dash={[6, 4]}
        listening={selectable}
      />
    </Group>
  )
})
