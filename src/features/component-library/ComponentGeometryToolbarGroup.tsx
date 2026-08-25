import {
  AlignBottomIcon,
  AlignCenterXIcon,
  AlignCenterYIcon,
  AlignLeftIcon,
  AlignRightIcon,
  AlignTopIcon,
  DistributeHorizontalIcon,
  DistributeVerticalIcon,
} from '../../components/toolbar-icons'
import type { ComponentVisualDefinition } from '../../component-system/visual'
import {
  alignBottom,
  alignCenterX,
  alignCenterY,
  alignLeft,
  alignRight,
  alignTop,
  distributeHorizontal,
  distributeVertical,
  type GeometryDeltas,
  type GeometryItem,
} from '../../geometry/commands'
import { ToolbarButton, ToolbarGroup } from '../../ui'
import {
  applyComponentLayerGeometryDeltas,
  createComponentLayerGeometryItems,
} from './component-layer-geometry'

type GeometryCommand = (items: readonly GeometryItem[]) => GeometryDeltas

type GeometryCommandItem = {
  title: string
  command: GeometryCommand
  icon: typeof AlignLeftIcon
}

const ALIGN_COMMANDS: GeometryCommandItem[] = [
  { title: '左对齐', command: alignLeft, icon: AlignLeftIcon },
  { title: '水平居中', command: alignCenterX, icon: AlignCenterXIcon },
  { title: '右对齐', command: alignRight, icon: AlignRightIcon },
  { title: '顶对齐', command: alignTop, icon: AlignTopIcon },
  { title: '垂直居中', command: alignCenterY, icon: AlignCenterYIcon },
  { title: '底对齐', command: alignBottom, icon: AlignBottomIcon },
]

type ComponentGeometryToolbarGroupProps = {
  visual: ComponentVisualDefinition
  selectedLayerIds: readonly string[]
  disabled: boolean
  onChange: (visual: ComponentVisualDefinition) => void
  onApplied: (message: string) => void
}

export function ComponentGeometryToolbarGroup({
  visual,
  selectedLayerIds,
  disabled,
  onChange,
  onApplied,
}: ComponentGeometryToolbarGroupProps) {
  const items = createComponentLayerGeometryItems(visual, selectedLayerIds)
  const canAlign = !disabled && items.length >= 2
  const canDistribute = !disabled && items.length >= 3

  function applyCommand(command: GeometryCommand, message: string) {
    if (disabled) {
      return
    }

    const deltas = command(items)

    if (Object.keys(deltas).length === 0) {
      return
    }

    onChange(applyComponentLayerGeometryDeltas(visual, deltas))
    onApplied(message)
  }

  return (
    <ToolbarGroup className="canvas-tool-group component-geometry-tool-group">
      {ALIGN_COMMANDS.map((item) => {
        const Icon = item.icon

        return (
          <ToolbarButton
            key={item.title}
            iconOnly
            className="icon-button"
            title={item.title}
            aria-label={item.title}
            disabled={!canAlign}
            onClick={() => applyCommand(item.command, '已完成图层对齐')}
          >
            <Icon />
          </ToolbarButton>
        )
      })}
      <ToolbarButton
        iconOnly
        className="icon-button"
        title="水平等距分布"
        aria-label="水平等距分布"
        disabled={!canDistribute}
        onClick={() => applyCommand(distributeHorizontal, '已水平等距分布图层')}
      >
        <DistributeHorizontalIcon />
      </ToolbarButton>
      <ToolbarButton
        iconOnly
        className="icon-button"
        title="垂直等距分布"
        aria-label="垂直等距分布"
        disabled={!canDistribute}
        onClick={() => applyCommand(distributeVertical, '已垂直等距分布图层')}
      >
        <DistributeVerticalIcon />
      </ToolbarButton>
    </ToolbarGroup>
  )
}
