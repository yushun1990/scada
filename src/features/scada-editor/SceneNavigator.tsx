import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { SceneNode } from '../../scene/schema'
import { Button, Input, Pressable } from '../../ui'
import { sceneNavigatorRows, sceneNodeAncestorIds, type SceneNavigatorRow } from './scene-navigation'
import './scene-navigator.css'

type SceneNavigatorProps = {
  nodes: readonly SceneNode[]
  selectedNodeIds: readonly string[]
  readOnly: boolean
  onSelectionChange: (ids: string[]) => void
  onNodeStateChange: (id: string, patch: { visible?: boolean; locked?: boolean }) => void
}

export function SceneNavigator({ nodes, selectedNodeIds, readOnly,
  onSelectionChange, onNodeStateChange }: SceneNavigatorProps) {
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [revealId, setRevealId] = useState<string | null>(null)
  const anchorRef = useRef<string | null>(null)
  const rowRefs = useRef(new Map<string, HTMLButtonElement>())
  const rows = sceneNavigatorRows(nodes, collapsed, search)
  const primaryId = selectedNodeIds.at(-1)
  const primary = nodes.find((node) => node.id === primaryId)
  const tabId = rows.find((row) => row.node.id === focusedId)?.node.id
    ?? rows.find((row) => row.node.id === primaryId)?.node.id ?? rows[0]?.node.id

  useEffect(() => {
    if (!revealId) return
    const element = rowRefs.current.get(revealId)
    element?.scrollIntoView({ block: 'nearest' })
    element?.focus()
    setRevealId(null)
  }, [revealId])

  function revealSelection() {
    if (!primaryId) return
    const ancestors = new Set(sceneNodeAncestorIds(nodes, primaryId))
    setSearch('')
    setCollapsed((current) => new Set([...current].filter((id) => !ancestors.has(id))))
    setRevealId(primaryId)
  }

  function toggleExpanded(id: string) {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function select(id: string, toggle = false, range = false) {
    if (readOnly) return
    const anchorIndex = rows.findIndex((row) => row.node.id === anchorRef.current)
    const index = rows.findIndex((row) => row.node.id === id)
    if (range && anchorIndex >= 0 && index >= 0) {
      onSelectionChange(rows.slice(Math.min(anchorIndex, index), Math.max(anchorIndex, index) + 1)
        .map((row) => row.node.id))
    } else {
      onSelectionChange(toggle
        ? selectedNodeIds.includes(id) ? selectedNodeIds.filter((key) => key !== id) : [...selectedNodeIds, id]
        : [id])
      anchorRef.current = id
    }
  }

  function handleKey(event: KeyboardEvent<HTMLButtonElement>, row: SceneNavigatorRow, index: number) {
    if (event.nativeEvent.isComposing) return
    let target: string | undefined
    const expanded = row.hasChildren && (Boolean(search.trim()) || !collapsed.has(row.node.id))
    switch (event.key) {
      case 'ArrowDown': target = rows[Math.min(rows.length - 1, index + 1)]?.node.id; break
      case 'ArrowUp': target = rows[Math.max(0, index - 1)]?.node.id; break
      case 'Home': target = rows[0]?.node.id; break
      case 'End': target = rows.at(-1)?.node.id; break
      case 'ArrowRight':
        if (row.hasChildren && !expanded) toggleExpanded(row.node.id)
        else if (row.hasChildren) target = rows[index + 1]?.node.id
        break
      case 'ArrowLeft':
        if (expanded && !search.trim()) toggleExpanded(row.node.id)
        else target = row.node.parentId ?? undefined
        break
      case ' ': select(row.node.id, true, event.shiftKey); break
      case 'Enter': select(row.node.id, event.ctrlKey || event.metaKey, event.shiftKey); break
      default: return
    }
    event.preventDefault()
    event.stopPropagation()
    if (target) rowRefs.current.get(target)?.focus()
  }

  return (
    <section className="scene-navigator" aria-label="场景导航">
      <div className="scene-navigator-heading">
        <strong>图层</strong>
        <Button size="small" disabled={!primary} onClick={revealSelection}>定位所选</Button>
      </div>
      <Input aria-label="搜索场景图层" placeholder="搜索名称、类型、隐藏或锁定" value={search}
        onChange={(event) => setSearch(event.target.value)} />
      <div className="scene-navigator-actions" aria-label="所选图层操作">
        <Button size="small" disabled={readOnly || selectedNodeIds.length !== 1 || !primary}
          onClick={() => primary && onNodeStateChange(primary.id, { visible: !primary.visible })}>
          {primary?.visible === false ? '显示所选' : '隐藏所选'}
        </Button>
        <Button size="small" disabled={readOnly || selectedNodeIds.length !== 1 || !primary}
          onClick={() => primary && onNodeStateChange(primary.id, { locked: !primary.locked })}>
          {primary?.locked ? '解锁所选' : '锁定所选'}
        </Button>
      </div>
      <p className="scene-navigator-summary">{nodes.length} 个对象 · 已选 {selectedNodeIds.length} 个</p>
      <div className="scene-navigator-tree" role="tree" aria-label="场景图层" aria-multiselectable="true">
        {rows.map((row, index) => (
          <Pressable key={row.node.id} ref={(element) => {
            if (element) rowRefs.current.set(row.node.id, element)
            else rowRefs.current.delete(row.node.id)
          }} role="treeitem" className="scene-navigator-row" data-node-id={row.node.id}
            aria-selected={selectedNodeIds.includes(row.node.id)} aria-level={row.depth + 1}
            aria-posinset={row.position} aria-setsize={row.siblingCount}
            aria-expanded={row.hasChildren ? Boolean(search.trim()) || !collapsed.has(row.node.id) : undefined}
            aria-disabled={readOnly} tabIndex={tabId === row.node.id ? 0 : -1}
            style={{ paddingInlineStart: `calc(var(--ui-space-1) + ${row.depth} * var(--ui-space-4))` }}
            title={`${row.node.name} · ${row.node.type}`}
            onFocus={() => setFocusedId(row.node.id)}
            onClick={(event) => select(row.node.id, event.ctrlKey || event.metaKey, event.shiftKey)}
            onDoubleClick={() => row.hasChildren && !search.trim() && toggleExpanded(row.node.id)}
            onKeyDown={(event) => handleKey(event, row, index)}>
            <span aria-hidden="true">{row.hasChildren ? !search.trim() && collapsed.has(row.node.id) ? '▸' : '▾' : '·'}</span>
            <span className="scene-navigator-name">{row.node.name}</span>
            {(!row.node.visible || row.hiddenByParent) && <span className="scene-navigator-state">{row.hiddenByParent ? '父级隐藏' : '隐藏'}</span>}
            {(row.node.locked || row.lockedByParent) && <span className="scene-navigator-state">{row.lockedByParent ? '父级锁定' : '锁定'}</span>}
          </Pressable>
        ))}
      </div>
      {!rows.length && <p className="panel-description">{search.trim() ? '没有匹配的对象' : '从组件面板添加对象，开始编辑。'}</p>}
      <p className="panel-description">方向键浏览和展开；Enter 选择，空格切换选择；Ctrl/⌘ 或 Shift 多选。</p>
    </section>
  )
}
