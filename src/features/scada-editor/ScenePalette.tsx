import { useState } from 'react'
import { builtInComponentRegistry } from '../../component-system/builtins'
import { Input, Pressable, Select } from '../../ui'

export function ScenePalette({ readOnly, onAdd }: { readOnly: boolean; onAdd: (type: string) => void }) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const registrations = builtInComponentRegistry.list()
  const categories = [...new Set(registrations.map(({ definition }) => definition.category))].sort()
  const query = search.trim().toLocaleLowerCase()
  const filtered = registrations.filter(({ definition }) =>
    (!category || definition.category === category)
    && [definition.title, definition.type, definition.category].join(' ').toLocaleLowerCase().includes(query))
  return (
    <section className="scene-palette dock-content" aria-label="场景组件">
      <Input aria-label="搜索场景组件" placeholder="搜索组件名称或类型" value={search}
        onChange={(event) => setSearch(event.target.value)} />
      <Select ariaLabel="组件分类" value={category} onValueChange={setCategory}
        options={[{ value: '', label: '全部分类' }, ...categories.map((value) => ({ value, label: value }))]} />
      <div className="panel-title">可用组件 · {filtered.length}</div>
      {filtered.map(({ definition }) => (
        <Pressable key={definition.type} className="component-item" disabled={readOnly}
          onClick={() => onAdd(definition.type)}>
          <span className="component-icon">{definition.title.slice(0, 1).toUpperCase()}</span>
          <span><strong>{definition.title}</strong><small>{definition.type}</small></span>
        </Pressable>
      ))}
      {!filtered.length && <p className="panel-description">没有匹配的组件</p>}
    </section>
  )
}
