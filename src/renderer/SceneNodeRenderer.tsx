import { forwardRef } from 'react'
import type Konva from 'konva'
import { PumpNode } from '../components/PumpNode'
import type { NodeTransform, SceneNode } from '../scene/model'

export type SceneNodeRendererProps = {
  node: SceneNode
  transform: NodeTransform
  editorMode: boolean
}

export const SceneNodeRenderer = forwardRef<
  Konva.Group,
  SceneNodeRendererProps
>(function SceneNodeRenderer(
  { node, transform, editorMode },
  ref,
) {
  switch (node.type) {
    case 'pump.submersible':
      return (
        <PumpNode
          ref={ref}
          nodeId={node.id}
          state={node.props.state}
          {...transform}
          draggable={editorMode && !node.locked}
          visible={editorMode || node.visible}
          opacity={node.visible ? 1 : 0.2}
        />
      )
  }
})
