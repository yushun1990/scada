import { createPortal } from 'react-dom'
import {
  CopyIcon,
  GridIcon,
  RedoIcon,
  TrashIcon,
  UndoIcon,
} from '../../components/toolbar-icons'
import { NumberInput, ToolbarButton } from '../../ui'
import type { ComponentWorkbenchMode } from './ComponentVisualTreeEditor'

export type ComponentCanvasToolbarsProps = {
  editToolbarHost: HTMLElement | null
  viewToolbarHost: HTMLElement | null
  isEditable: boolean
  selectedCount: number
  canUndo: boolean
  canRedo: boolean
  isComposite: boolean
  mode: ComponentWorkbenchMode
  gridVisible: boolean
  gridSize: number
  onDuplicate: () => void
  onDelete: () => void
  onUndo: () => void
  onRedo: () => void
  onToggleGrid: () => void
  onChangeGridSize: (size: number) => void
}

export function ComponentCanvasToolbars({
  editToolbarHost,
  viewToolbarHost,
  isEditable,
  selectedCount,
  canUndo,
  canRedo,
  isComposite,
  mode,
  gridVisible,
  gridSize,
  onDuplicate,
  onDelete,
  onUndo,
  onRedo,
  onToggleGrid,
  onChangeGridSize,
}: ComponentCanvasToolbarsProps) {
  return (
    <>
      {editToolbarHost &&
        createPortal(
          <>
            <ToolbarButton
              iconOnly
              className="icon-button component-copy-command"
              title="复制选中图层"
              aria-label="复制选中图层"
              disabled={!isEditable || selectedCount === 0}
              onClick={onDuplicate}
            >
              <CopyIcon />
            </ToolbarButton>
            <ToolbarButton
              iconOnly
              className="icon-button component-delete-command"
              title="删除选中图层"
              aria-label="删除选中图层"
              disabled={!isEditable || selectedCount === 0}
              onClick={onDelete}
            >
              <TrashIcon />
            </ToolbarButton>
            <ToolbarButton
              iconOnly
              className="icon-button component-undo-command"
              title="撤销 (Ctrl+Z)"
              aria-label="撤销"
              disabled={!isEditable || !canUndo}
              onClick={onUndo}
            >
              <UndoIcon />
            </ToolbarButton>
            <ToolbarButton
              iconOnly
              className="icon-button component-redo-command"
              title="重做 (Ctrl+Shift+Z)"
              aria-label="重做"
              disabled={!isEditable || !canRedo}
              onClick={onRedo}
            >
              <RedoIcon />
            </ToolbarButton>
          </>,
          editToolbarHost,
        )}

      {viewToolbarHost &&
        createPortal(
          <div className="grid-control" title="网格显示与间距">
            <ToolbarButton
              iconOnly
              className={`icon-button toggle-button component-grid-toggle${gridVisible ? ' active' : ''}`}
              title={gridVisible ? '隐藏格线' : '显示格线'}
              aria-label="显示格线"
              aria-pressed={gridVisible}
              disabled={!isComposite || mode !== 'editor'}
              onClick={onToggleGrid}
            >
              <GridIcon />
            </ToolbarButton>
            {gridVisible && (
              <NumberInput
                className="grid-size-input"
                min="4"
                max="128"
                title="网格间距"
                aria-label="网格间距"
                value={gridSize}
                disabled={!isComposite || mode !== 'editor'}
                onChange={(event) => {
                  const nextGridSize = Number(event.target.value)
                  if (
                    Number.isFinite(nextGridSize) &&
                    nextGridSize >= 4 &&
                    nextGridSize <= 128
                  ) {
                    onChangeGridSize(nextGridSize)
                  }
                }}
              />
            )}
          </div>,
          viewToolbarHost,
        )}
    </>
  )
}
