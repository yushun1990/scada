import { forwardRef } from 'react'
import type Konva from 'konva'
import { PumpNode } from '../components/PumpNode'
import type { NodeTransform, SceneNode } from '../scene/model'

export type SceneNodeRendererProps = {
  node: SceneNode
  editable: boolean
  onSelect: () => void
  onTransformChange: (transform: NodeTransform) => void
}

export const SceneNodeRenderer = forwardRef<
  Konva.Group,
  SceneNodeRendererProps
>(function SceneNodeRenderer(
  { node, editable, onSelect, onTransformChange },
  ref,
) {
  switch (node.type) {
    case 'pump.submersible':
      return (
        <PumpNode
          ref={ref}
          state={node.props.state}
          {...node.transform}
          draggable={editable}
          onSelect={onSelect}
          onDragEnd={(x, y) => {
            onTransformChange({
              ...node.transform,
              x,
              y,
            })
          }}
          onTransformEnd={onTransformChange}
        />
      )
  }
})
