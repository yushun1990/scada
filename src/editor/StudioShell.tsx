import {
  useRef,
  type CSSProperties,
  type FocusEventHandler,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import {
  Button,
  MenuItem,
  MenuPopup,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
  StatusBar,
} from '../ui'
import { useStudioLayoutPreferences } from './use-studio-layout-preferences'
import './studio-shell.css'

export type StudioMenuCommand = {
  id: string
  label: string
  shortcut?: string
  disabled?: boolean
  destructive?: boolean
  separatorBefore?: boolean
  onSelect: () => void
}

export type StudioMenuDefinition = {
  id: string
  label: string
  commands: StudioMenuCommand[]
}

type StudioShellProps = {
  productTitle?: string
  documentTitle: string
  documentType: string
  dirty: boolean
  menus: StudioMenuDefinition[]
  mainToolbar: ReactNode
  modeControl?: ReactNode
  leftPanel: ReactNode
  center: ReactNode
  rightPanel: ReactNode
  status: ReactNode
  workspaceNavigationLabel: string
  onNavigateWorkspace: () => void
  onFocusCapture?: FocusEventHandler<HTMLDivElement>
  onBlurCapture?: FocusEventHandler<HTMLDivElement>
  className?: string
}

type PanelSide = 'left' | 'right'

type DragState = {
  pointerId: number
  startClientX: number
  startWidth: number
}

function clampPanelWidth(side: PanelSide, value: number) {
  return side === 'left'
    ? Math.min(360, Math.max(208, value))
    : Math.min(440, Math.max(280, value))
}

function StudioPanelResizeHandle({
  side,
  width,
  onWidthChange,
}: {
  side: PanelSide
  width: number
  onWidthChange: (width: number) => void
}) {
  const dragRef = useRef<DragState | null>(null)

  function beginDrag(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startWidth: width,
    }
  }

  function updateDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const delta = event.clientX - drag.startClientX
    const next = side === 'left'
      ? drag.startWidth + delta
      : drag.startWidth - delta
    onWidthChange(clampPanelWidth(side, next))
  }

  function finishDrag(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    let next: number | null = null
    const step = event.shiftKey ? 24 : 8

    if (event.key === 'ArrowLeft') {
      next = width + (side === 'left' ? -step : step)
    } else if (event.key === 'ArrowRight') {
      next = width + (side === 'left' ? step : -step)
    } else if (event.key === 'Home') {
      next = side === 'left' ? 208 : 280
    } else if (event.key === 'End') {
      next = side === 'left' ? 360 : 440
    }

    if (next === null) return
    event.preventDefault()
    onWidthChange(clampPanelWidth(side, next))
  }

  const min = side === 'left' ? 208 : 280
  const max = side === 'left' ? 360 : 440

  return (
    <div
      className={`studio-panel-resizer studio-panel-resizer-${side}`}
      role="separator"
      tabIndex={0}
      aria-label={side === 'left' ? '调整左侧面板宽度' : '调整右侧面板宽度'}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(width)}
      onPointerDown={beginDrag}
      onPointerMove={updateDrag}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onKeyDown={handleKeyDown}
    />
  )
}

export function StudioShell({
  productTitle = 'SCADA Studio',
  documentTitle,
  documentType,
  dirty,
  menus,
  mainToolbar,
  modeControl,
  leftPanel,
  center,
  rightPanel,
  status,
  workspaceNavigationLabel,
  onNavigateWorkspace,
  onFocusCapture,
  onBlurCapture,
  className = '',
}: StudioShellProps) {
  const { layout, setLayout, resetLayout } = useStudioLayoutPreferences()
  const shellStyle = {
    '--studio-left-width': layout.leftVisible ? `${layout.leftWidth}px` : '0px',
    '--studio-left-resizer': layout.leftVisible ? '6px' : '0px',
    '--studio-right-width': layout.rightVisible ? `${layout.rightWidth}px` : '0px',
    '--studio-right-resizer': layout.rightVisible ? '6px' : '0px',
  } as CSSProperties

  const viewCommands: StudioMenuCommand[] = [
    {
      id: 'toggle-left-panel',
      label: layout.leftVisible ? '隐藏左侧面板' : '显示左侧面板',
      onSelect: () => setLayout((current) => ({
        ...current,
        leftVisible: !current.leftVisible,
      })),
    },
    {
      id: 'toggle-right-panel',
      label: layout.rightVisible ? '隐藏属性面板' : '显示属性面板',
      onSelect: () => setLayout((current) => ({
        ...current,
        rightVisible: !current.rightVisible,
      })),
    },
    {
      id: 'reset-layout',
      label: '重置布局',
      separatorBefore: true,
      onSelect: resetLayout,
    },
  ]

  const mergedMenus = menus.map((menu) =>
    menu.id === 'view'
      ? { ...menu, commands: [...menu.commands, ...viewCommands] }
      : menu,
  )
  if (!mergedMenus.some((menu) => menu.id === 'view')) {
    mergedMenus.push({ id: 'view', label: '视图', commands: viewCommands })
  }

  return (
    <div
      className={`studio-shell ${className}`.trim()}
      style={shellStyle}
      onFocusCapture={onFocusCapture}
      onBlurCapture={onBlurCapture}
    >
      <div className="studio-menu-bar">
        <strong className="studio-product-title">{productTitle}</strong>
        <nav className="studio-menu-list" aria-label="Studio 菜单">
          {mergedMenus.map((menu) => (
            <MenuRoot key={menu.id}>
              <MenuTrigger className="studio-menu-trigger">{menu.label}</MenuTrigger>
              <MenuPopup className="studio-menu-popup">
                {menu.commands.map((command) => (
                  <div key={command.id}>
                    {command.separatorBefore && <MenuSeparator />}
                    <MenuItem
                      className="studio-menu-item"
                      disabled={command.disabled}
                      destructive={command.destructive}
                      onClick={command.onSelect}
                    >
                      <span>{command.label}</span>
                      {command.shortcut && (
                        <kbd className="studio-menu-shortcut">{command.shortcut}</kbd>
                      )}
                    </MenuItem>
                  </div>
                ))}
              </MenuPopup>
            </MenuRoot>
          ))}
        </nav>
        <Button
          variant="ghost"
          size="small"
          className="studio-workspace-nav"
          title={workspaceNavigationLabel}
          aria-label={workspaceNavigationLabel}
          onClick={onNavigateWorkspace}
        >
          工作台
        </Button>
      </div>

      <div className="studio-main-toolbar" role="toolbar" aria-label="Studio 主工具栏">
        <div className="studio-main-toolbar-content">{mainToolbar}</div>
        <div className="studio-main-toolbar-tail">
          <Button
            variant="ghost"
            size="small"
            aria-pressed={layout.leftVisible}
            aria-label={layout.leftVisible ? '隐藏左侧面板' : '显示左侧面板'}
            title={layout.leftVisible ? '隐藏左侧面板' : '显示左侧面板'}
            onClick={() => setLayout((current) => ({
              ...current,
              leftVisible: !current.leftVisible,
            }))}
          >
            左栏
          </Button>
          <Button
            variant="ghost"
            size="small"
            aria-pressed={layout.rightVisible}
            aria-label={layout.rightVisible ? '隐藏属性面板' : '显示属性面板'}
            title={layout.rightVisible ? '隐藏属性面板' : '显示属性面板'}
            onClick={() => setLayout((current) => ({
              ...current,
              rightVisible: !current.rightVisible,
            }))}
          >
            属性
          </Button>
          {modeControl}
        </div>
      </div>

      <div className="studio-document-bar">
        <div className="studio-document-identity">
          <strong>{documentTitle}{dirty ? ' *' : ''}</strong>
          <span>{documentType}</span>
        </div>
        <Button
          variant="ghost"
          size="small"
          aria-label={`关闭 ${documentTitle}`}
          title="关闭并返回工作台"
          onClick={onNavigateWorkspace}
        >
          ×
        </Button>
      </div>

      <div className="studio-workspace-grid">
        <aside className="studio-left-panel" hidden={!layout.leftVisible}>
          {leftPanel}
        </aside>
        {layout.leftVisible && (
          <StudioPanelResizeHandle
            side="left"
            width={layout.leftWidth}
            onWidthChange={(leftWidth) => setLayout((current) => ({
              ...current,
              leftWidth,
            }))}
          />
        )}
        <main className="studio-center-workspace">{center}</main>
        {layout.rightVisible && (
          <StudioPanelResizeHandle
            side="right"
            width={layout.rightWidth}
            onWidthChange={(rightWidth) => setLayout((current) => ({
              ...current,
              rightWidth,
            }))}
          />
        )}
        <aside className="studio-right-panel" hidden={!layout.rightVisible}>
          {rightPanel}
        </aside>
      </div>

      <StatusBar className="studio-status-bar">{status}</StatusBar>
    </div>
  )
}
