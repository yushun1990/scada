import {
  AlignBottomIcon, AlignCenterXIcon, AlignCenterYIcon, AlignLeftIcon,
  AlignRightIcon, AlignTopIcon, DistributeHorizontalIcon, DistributeVerticalIcon,
} from '../../components/toolbar-icons'
import type { ComponentVisualDefinition } from '../../component-system/visual'
import {
  alignBottom, alignCenterX, alignCenterY, alignLeft, alignRight, alignTop,
  distributeHorizontal, distributeVertical, type GeometryDeltas, type GeometryItem,
} from '../../geometry/commands'
import { MenuRoot, MenuTrigger, MenuPopup, MenuItem, ToolbarButton, ToolbarGroup } from '../../ui'
import { applyComponentLayerGeometryDeltas, createComponentLayerGeometryItems } from './component-layer-geometry'

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
  visual, selectedLayerIds, disabled, onChange, onApplied,
}: ComponentGeometryToolbarGroupProps) {
  const items = createComponentLayerGeometryItems(visual, selectedLayerIds)
  const geometryLocked = disabled || visual.layers.some((layer) =>
    selectedLayerIds.includes(layer.id) && layer.parentId !== null,
  )
  const commands = [
    ...ALIGN_COMMANDS.map((item) => ({ ...item, enabled: !geometryLocked && items.length >= 2 })),
    { title: '水平等距分布', command: distributeHorizontal, icon: DistributeHorizontalIcon, enabled: !geometryLocked && items.length >= 3 },
    { title: '垂直等距分布', command: distributeVertical, icon: DistributeVerticalIcon, enabled: !geometryLocked && items.length >= 3 },
  ]

  function applyCommand(item: typeof commands[number]) {
    if (!item.enabled) return
    const deltas = item.command(items)
    if (Object.keys(deltas).length === 0) return
    onChange(applyComponentLayerGeometryDeltas(visual, deltas))
    onApplied(`已完成${item.title}`)
  }

  return (
    <ToolbarGroup className="canvas-tool-group component-geometry-tool-group" aria-label="对齐与分布">
      <div className="component-geometry-buttons">
        {commands.map((item) => (
          <ToolbarButton
            key={item.title} iconOnly className="icon-button"
            title={item.title} aria-label={item.title}
            disabled={!item.enabled} onClick={() => applyCommand(item)}
          >
            <item.icon />
          </ToolbarButton>
        ))}
      </div>
      <div className="component-arrange-menu">
        <MenuRoot>
          <MenuTrigger>对齐与分布</MenuTrigger>
          <MenuPopup align="center">
            {commands.map((item) => (
              <MenuItem key={item.title} disabled={!item.enabled} onClick={() => applyCommand(item)}>
                {item.title}
              </MenuItem>
            ))}
          </MenuPopup>
        </MenuRoot>
      </div>
    </ToolbarGroup>
  )
}
