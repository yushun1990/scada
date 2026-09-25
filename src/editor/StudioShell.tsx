import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEventHandler,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import {
  Button,
  IconButton,
  MenuItem,
  MenuPopup,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
  StatusBar,
  Toolbar,
} from '../ui'
import { ChevronLeftIcon, ChevronRightIcon } from '../components/toolbar-icons'
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

type StudioShellProps = {
  documentTitle: string
  documentType: string
  dirty: boolean
  documentActions: ReactNode
  documentCommands?: StudioMenuCommand[]
  mainToolbar: ReactNode
  toolbarAside?: ReactNode
  toolbarPlacement?: 'full-width' | 'canvas'
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
    ? Math.min(500, Math.max(260, value))
    : Math.min(500, Math.max(300, value))
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(query).matches,
  )

  useEffect(() => {
    const mediaQuery = window.matchMedia(query)
    const update = () => setMatches(mediaQuery.matches)

    update()
    mediaQuery.addEventListener('change', update)
    return () => mediaQuery.removeEventListener('change', update)
  }, [query])

  return matches
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
      next = side === 'left' ? 260 : 300
    } else if (event.key === 'End') {
      next = 500
    } else if (event.key === 'Enter') {
      next = 360
    }

    if (next === null) return
    event.preventDefault()
    onWidthChange(clampPanelWidth(side, next))
  }

  const min = side === 'left' ? 260 : 300
  const max = 500

  return (
    <div
      className={`studio-panel-resizer studio-panel-resizer-${side}`}
      role="separator"
      tabIndex={0}
      aria-label={side === 'left' ? '调整左侧面板宽度' : '调整右侧面板宽度'}
      title="拖动调整宽度；双击或按 Enter 恢复默认宽度"
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(width)}
      onDoubleClick={() => onWidthChange(360)}
      onPointerDown={beginDrag}
      onPointerMove={updateDrag}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onKeyDown={handleKeyDown}
    />
  )
}

function StudioPanelRail({ side, visible, width, onToggle, onWidthChange }: {
  side: PanelSide
  visible: boolean
  width: number
  onToggle: () => void
  onWidthChange: (width: number) => void
}) {
  const label = `${visible ? '收起' : '展开'}${side === 'left' ? '左' : '右'}侧面板`
  const pointsLeft = side === 'left' ? visible : !visible
  return (
    <div className={`studio-panel-rail studio-panel-rail-${side}${visible ? ' is-visible' : ' is-collapsed'}`}>
      {visible && <StudioPanelResizeHandle side={side} width={width} onWidthChange={onWidthChange} />}
      <IconButton
        className="studio-panel-toggle"
        aria-label={label}
        title={label}
        aria-expanded={visible}
        aria-controls={`studio-${side}-panel`}
        onClick={onToggle}
      >
        {pointsLeft ? <ChevronLeftIcon /> : <ChevronRightIcon />}
      </IconButton>
    </div>
  )
}

export function StudioShell({
  documentTitle,
  documentType,
  dirty,
  documentActions,
  documentCommands = [],
  mainToolbar,
  toolbarAside,
  toolbarPlacement = 'full-width',
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
  const { layout, setLayout } = useStudioLayoutPreferences()
  const canvasToolbar = toolbarPlacement === 'canvas'
  const narrowViewport = useMediaQuery('(max-width: 900px)')
  const compactPanels = canvasToolbar && narrowViewport

  useEffect(() => {
    if (!compactPanels || !layout.leftVisible || !layout.rightVisible) return

    // A narrow canvas has one overlay lane. Keep the creation/navigation panel
    // available when a desktop preference had both docks open.
    setLayout((current) => ({ ...current, rightVisible: false }))
  }, [compactPanels, layout.leftVisible, layout.rightVisible, setLayout])

  function togglePanel(side: PanelSide) {
    setLayout((current) => {
      const visible = side === 'left' ? current.leftVisible : current.rightVisible
      if (!compactPanels || visible) {
        return {
          ...current,
          ...(side === 'left'
            ? { leftVisible: !visible }
            : { rightVisible: !visible }),
        }
      }

      return {
        ...current,
        leftVisible: side === 'left',
        rightVisible: side === 'right',
      }
    })
  }

  const shellStyle = {
    '--studio-left-width': layout.leftVisible ? `${layout.leftWidth}px` : '0px',
    '--studio-left-resizer': layout.leftVisible ? '6px' : '24px',
    '--studio-right-width': layout.rightVisible ? `${layout.rightWidth}px` : '0px',
    '--studio-right-resizer': layout.rightVisible ? '6px' : '24px',
  } as CSSProperties

  const toolbar = (
    <Toolbar className="studio-main-toolbar" aria-label="Studio 主工具栏">
      <div className="studio-main-toolbar-content">{mainToolbar}</div>
    </Toolbar>
  )

  return (
    <div
      className={`studio-shell${canvasToolbar ? ' studio-shell-canvas-toolbar' : ''} ${className}`.trim()}
      style={shellStyle}
      onFocusCapture={onFocusCapture}
      onBlurCapture={onBlurCapture}
    >
      <header className="studio-document-header">
        <div className="studio-document-brand">
          <Button
            variant="ghost"
            className="studio-workspace-nav"
            title={workspaceNavigationLabel}
            aria-label={workspaceNavigationLabel}
            onClick={onNavigateWorkspace}
          >
            工作台
          </Button>
          <span className="studio-document-brand-divider" aria-hidden="true">
            /
          </span>
          <div className="studio-document-identity" title={`${documentTitle} · ${documentType}`}>
            <strong aria-label={`${documentTitle}${dirty ? '，未保存' : ''}`}>
              {documentTitle}{dirty ? ' *' : ''}
            </strong>
            <span>{documentType}</span>
          </div>
        </div>
        {canvasToolbar && <div className="studio-document-mode">{modeControl}</div>}
        <div className="studio-document-actions">
          {documentActions}
          {documentCommands.length > 0 && (
            <StudioCommandMenu label="文件" commands={documentCommands} />
          )}
          {!canvasToolbar && modeControl}
        </div>
      </header>

      {!canvasToolbar && toolbar}

      <div className="studio-workspace-grid">
        <aside id="studio-left-panel" className="studio-left-panel" aria-label="左侧工作面板" hidden={!layout.leftVisible}>
          {leftPanel}
        </aside>
        <StudioPanelRail
          side="left"
          visible={layout.leftVisible}
          width={layout.leftWidth}
          onToggle={() => togglePanel('left')}
          onWidthChange={(leftWidth) => setLayout((current) => ({ ...current, leftWidth }))}
        />
        <main className="studio-center-workspace" aria-label={`${documentTitle} 编辑区`}>
          {canvasToolbar ? (
            <>
              <div className="studio-canvas-toolbar-row">
                {toolbar}
                {toolbarAside}
              </div>
              <div className="studio-canvas-content">{center}</div>
            </>
          ) : center}
        </main>
        <StudioPanelRail
          side="right"
          visible={layout.rightVisible}
          width={layout.rightWidth}
          onToggle={() => togglePanel('right')}
          onWidthChange={(rightWidth) => setLayout((current) => ({ ...current, rightWidth }))}
        />
        <aside id="studio-right-panel" className="studio-right-panel" aria-label="属性面板" hidden={!layout.rightVisible}>
          {rightPanel}
        </aside>
      </div>

      <StatusBar className="studio-status-bar">{status}</StatusBar>
    </div>
  )
}

function StudioCommandMenu({ label, commands }: { label: string; commands: StudioMenuCommand[] }) {
  return (
    <MenuRoot>
      <MenuTrigger className="studio-menu-trigger">{label}</MenuTrigger>
      <MenuPopup className="studio-menu-popup" align="end">
        {commands.map((command) => (
          <div key={command.id}>
            {command.separatorBefore && <MenuSeparator />}
            <MenuItem
              className="studio-menu-item"
              disabled={command.disabled}
              destructive={command.destructive}
              onClick={command.onSelect}
            >
              <span>{command.label}</span>
              {command.shortcut && <kbd className="studio-menu-shortcut">{command.shortcut}</kbd>}
            </MenuItem>
          </div>
        ))}
      </MenuPopup>
    </MenuRoot>
  )
}
