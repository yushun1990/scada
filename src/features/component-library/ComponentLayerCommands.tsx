import {
  BringToFrontIcon, SendToBackIcon, GroupIcon, UngroupIcon,
} from '../../components/toolbar-icons'
import type { ComponentVisualDefinition } from '../../component-system/visual'
import { IconButton, ToolbarButton } from '../../ui'
import {
  canReorderComponentLayers, reorderComponentLayers, type ComponentLayerOrderCommand,
} from './component-layer-order'
import {
  canGroupComponentLayers, canUngroupComponentLayer,
  groupComponentLayers, ungroupComponentLayer,
} from './component-layer-hierarchy'

type ComponentLayerCommandsProps = {
  visual: ComponentVisualDefinition
  selectedLayerIds: readonly string[]
  disabled: boolean
  onChange: (visual: ComponentVisualDefinition) => void
  onSelectionReplace: (layerIds: readonly string[]) => void
  onApplied: (message: string) => void
}

export function ComponentGroupCommand({
  visual, selectedLayerIds, disabled, onChange, onSelectionReplace, onApplied,
}: ComponentLayerCommandsProps) {
  const canGroup = !disabled && canGroupComponentLayers(visual, selectedLayerIds)
  const canUngroup = !disabled && canUngroupComponentLayer(visual, selectedLayerIds)

  function changeGrouping() {
    if (canUngroup) {
      const result = ungroupComponentLayer(visual, selectedLayerIds[0]!)
      if (result.status === 'unsupported-transform') {
        onApplied('当前组合包含无法无损展开的非均匀缩放与旋转')
        return
      }
      if (result.status !== 'ungrouped') return
      onChange(result.visual)
      onSelectionReplace(result.childIds)
      onApplied('已拆分组合')
    } else if (canGroup) {
      const result = groupComponentLayers(visual, selectedLayerIds)
      if (result.status !== 'grouped') return
      onChange(result.visual)
      onSelectionReplace([result.groupId])
      onApplied('已组合选中图层')
    }
  }

  const groupTitle = canUngroup ? '拆分组合' : '组合选中图层'
  return (
    <ToolbarButton
      iconOnly className="icon-button component-group-command"
      title={groupTitle} aria-label={groupTitle}
      disabled={!canGroup && !canUngroup} onClick={changeGrouping}
    >{canUngroup ? <UngroupIcon /> : <GroupIcon />}</ToolbarButton>
  )
}

export function ComponentLayerOrderActions({
  visual, selectedLayerIds, disabled, onChange, onSelectionReplace, onApplied,
  layerId, layerName,
}: ComponentLayerCommandsProps & { layerId: string; layerName: string }) {
  const ids = selectedLayerIds.includes(layerId) ? selectedLayerIds : [layerId]
  const enabled = (command: ComponentLayerOrderCommand) =>
    !disabled && canReorderComponentLayers(visual, ids, command)
  function applyOrder(command: ComponentLayerOrderCommand, title: string) {
    if (!enabled(command)) return
    const result = reorderComponentLayers(visual, ids, command)
    if (!result.changed) return
    onChange(result.visual)
    onSelectionReplace(ids)
    onApplied(`已${title}${ids.length > 1 ? ` · ${ids.length} 个图层` : ''}`)
  }
  return (
    <div className="component-layer-row-actions" role="group" aria-label={`${layerName} 排序`}>
      <IconButton
        size="small" variant="ghost" title="置顶"
        aria-label={`置顶 · ${layerName}`} disabled={!enabled('bring-to-front')}
        onClick={() => applyOrder('bring-to-front', '置顶')}
      ><BringToFrontIcon /></IconButton>
      <IconButton
        size="small" variant="ghost" title="置底"
        aria-label={`置底 · ${layerName}`} disabled={!enabled('send-to-back')}
        onClick={() => applyOrder('send-to-back', '置底')}
      ><SendToBackIcon /></IconButton>
    </div>
  )
}
