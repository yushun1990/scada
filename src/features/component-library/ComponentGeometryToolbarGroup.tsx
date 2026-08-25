import {
  AlignBottomIcon,
  AlignCenterXIcon,
  AlignCenterYIcon,
  AlignLeftIcon,
  AlignRightIcon,
  AlignTopIcon,
  DistributeHorizontalIcon,
  DistributeVerticalIcon,
  GroupIcon,
  UngroupIcon,
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
import {
  canGroupComponentLayers,
  canUngroupComponentLayer,
  groupComponentLayers,
  ungroupComponentLayer,
} from './component-layer-hierarchy'

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
  onSelectionReplace: (layerIds: readonly string[]) => void
  onApplied: (message: string) => void
}

export function ComponentGeometryToolbarGroup({
  visual,
  selectedLayerIds,
  disabled,
  onChange,
  onSelectionReplace,
  onApplied,
}: ComponentGeometryToolbarGroupProps) {
  const items = createComponentLayerGeometryItems(visual, selectedLayerIds)
  const canAlign = !disabled && items.length >= 2
  const canDistribute = !disabled && items.length >= 3
  const canGroup = !disabled && canGroupComponentLayers(visual, selectedLayerIds)
  const canUngroup = !disabled && canUngroupComponentLayer(visual, selectedLayerIds)

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

  function groupSelection() {
    if (!canGroup) {
      return
    }

    const result = groupComponentLayers(visual, selectedLayerIds)

    if (result.status !== 'grouped') {
      onApplied('只能组合两个及以上同父级图层')
      return
    }

    onChange(result.visual)
    onSelectionReplace([result.groupId])
    onApplied('已组合选中图层')
  }

  function ungroupSelection() {
    if (!canUngroup) {
      return
    }

    const groupId = selectedLayerIds[0]

    if (!groupId) {
      return
    }

    const result = ungroupComponentLayer(visual, groupId)

    if (result.status === 'unsupported-transform') {
      onApplied('当前组合包含无法无损展开的非均匀缩放与旋转')
      return
    }

    if (result.status !== 'ungrouped') {
      return
    }

    onChange(result.visual)
    onSelectionReplace(result.childIds)
    onApplied('已拆分组合')
  }

  return (
    <>
      <ToolbarGroup className="canvas-tool-group component-hierarchy-tool-group">
        <ToolbarButton
          iconOnly
          className="icon-button"
          title="组合选中图层"
          aria-label="组合选中图层"
          disabled={!canGroup}
          onClick={groupSelection}
        >
          <GroupIcon />
        </ToolbarButton>
        <ToolbarButton
          iconOnly
          className="icon-button"
          title="拆分组合"
          aria-label="拆分组合"
          disabled={!canUngroup}
          onClick={ungroupSelection}
        >
          <UngroupIcon />
        </ToolbarButton>
      </ToolbarGroup>

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
    </>
  )
}
