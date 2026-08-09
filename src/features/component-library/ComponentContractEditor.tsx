import { useState } from 'react'
import type {
  ComponentDefinition,
  ComponentPropertyDefinition,
  ComponentPropertyKind,
  ComponentPropertyOption,
  VisualAnchorDefinition,
  VisualAnchorRole,
} from '../../component-system/definition'

type ContractTab = 'properties' | 'actions' | 'events' | 'anchors'
type InteractionDefinition = { title: string; description?: string }

type ComponentContractEditorProps = {
  definition: ComponentDefinition
  readOnly: boolean
  onChange: (definition: ComponentDefinition) => void
}

const PROPERTY_KIND_LABELS: Array<[ComponentPropertyKind, string]> = [
  ['string', '文本'],
  ['number', '数字'],
  ['boolean', '布尔'],
  ['color', '颜色'],
  ['select', '枚举'],
]

const ANCHOR_ROLE_LABELS: Array<[VisualAnchorRole, string]> = [
  ['neutral', '中性'],
  ['source', '仅起点'],
  ['target', '仅终点'],
  ['both', '双向'],
]

function nextUniqueKey(prefix: string, keys: readonly string[]) {
  const keySet = new Set(keys)
  let index = 1

  while (keySet.has(`${prefix}${index}`)) {
    index += 1
  }

  return `${prefix}${index}`
}

function defaultValueForKind(kind: ComponentPropertyKind) {
  if (kind === 'number') return 0
  if (kind === 'boolean') return false
  if (kind === 'color') return '#2563eb'
  if (kind === 'select') return 'value1'
  return ''
}

function createProperty(kind: ComponentPropertyKind = 'string'): ComponentPropertyDefinition {
  return {
    title: '新属性',
    kind,
    defaultValue: defaultValueForKind(kind),
    bindable: false,
    options: kind === 'select'
      ? [{ label: '选项 1', value: 'value1' }]
      : undefined,
  }
}

function convertPropertyKind(
  property: ComponentPropertyDefinition,
  kind: ComponentPropertyKind,
): ComponentPropertyDefinition {
  if (property.kind === kind) {
    return property
  }

  return {
    title: property.title,
    description: property.description,
    bindable: property.bindable,
    kind,
    defaultValue: defaultValueForKind(kind),
    options: kind === 'select'
      ? [{ label: '选项 1', value: 'value1' }]
      : undefined,
  }
}

function formatOptions(options: readonly ComponentPropertyOption[] | undefined) {
  return (options ?? [])
    .map((option) => `${option.label}=${String(option.value)}`)
    .join('\n')
}

function parseOptionValue(value: string): string | number {
  const trimmed = value.trim()

  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) {
    const numeric = Number(trimmed)
    if (Number.isFinite(numeric)) return numeric
  }

  return trimmed
}

function parseOptions(value: string): ComponentPropertyOption[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf('=')
      const label = separator >= 0 ? line.slice(0, separator).trim() : line
      const rawValue = separator >= 0 ? line.slice(separator + 1) : line

      return {
        label: label || rawValue.trim(),
        value: parseOptionValue(rawValue),
      }
    })
}

function replaceRecordKey<T>(
  record: Readonly<Record<string, T>>,
  oldKey: string,
  nextKey: string,
) {
  const normalized = nextKey.trim()

  if (!normalized || (normalized !== oldKey && record[normalized])) {
    return record
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key === oldKey ? normalized : key,
      value,
    ]),
  ) as Record<string, T>
}

function ContractKeyInput({
  value,
  disabled,
  onCommit,
}: {
  value: string
  disabled: boolean
  onCommit: (value: string) => void
}) {
  return (
    <input
      key={value}
      defaultValue={value}
      disabled={disabled}
      onBlur={(event) => onCommit(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
    />
  )
}

function PropertyDefaultEditor({
  property,
  disabled,
  onChange,
}: {
  property: ComponentPropertyDefinition
  disabled: boolean
  onChange: (value: ComponentPropertyDefinition['defaultValue']) => void
}) {
  if (property.kind === 'boolean') {
    return (
      <label className="contract-checkbox">
        <input
          type="checkbox"
          checked={Boolean(property.defaultValue)}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>默认开启</span>
      </label>
    )
  }

  if (property.kind === 'number') {
    return (
      <input
        type="number"
        value={typeof property.defaultValue === 'number' ? property.defaultValue : 0}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    )
  }

  if (property.kind === 'color') {
    return (
      <input
        type="color"
        value={typeof property.defaultValue === 'string' ? property.defaultValue : '#2563eb'}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  }

  if (property.kind === 'select') {
    return (
      <select
        value={String(property.defaultValue ?? '')}
        disabled={disabled}
        onChange={(event) => {
          const option = property.options?.find(
            (candidate) => String(candidate.value) === event.target.value,
          )
          onChange(option?.value ?? event.target.value)
        }}
      >
        {(property.options ?? []).map((option) => (
          <option
            key={`${typeof option.value}:${String(option.value)}`}
            value={String(option.value)}
          >
            {option.label}
          </option>
        ))}
      </select>
    )
  }

  return (
    <input
      value={typeof property.defaultValue === 'string' ? property.defaultValue : ''}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

function InteractionList({
  label,
  emptyLabel,
  items,
  readOnly,
  onRename,
  onUpdate,
  onRemove,
  onAdd,
}: {
  label: string
  emptyLabel: string
  items: Readonly<Record<string, InteractionDefinition>>
  readOnly: boolean
  onRename: (oldKey: string, nextKey: string) => void
  onUpdate: (key: string, value: InteractionDefinition) => void
  onRemove: (key: string) => void
  onAdd: () => void
}) {
  return (
    <div className="contract-list">
      {Object.entries(items).map(([key, item]) => (
        <article className="contract-item" key={key}>
          <div className="contract-item-head">
            <strong>{item.title || key}</strong>
            {!readOnly && <button type="button" onClick={() => onRemove(key)}>删除</button>}
          </div>
          <div className="contract-grid">
            <label>
              <span>Key</span>
              <ContractKeyInput
                value={key}
                disabled={readOnly}
                onCommit={(nextKey) => onRename(key, nextKey)}
              />
            </label>
            <label>
              <span>标题</span>
              <input
                value={item.title}
                disabled={readOnly}
                onChange={(event) => onUpdate(key, { ...item, title: event.target.value })}
              />
            </label>
          </div>
          <label className="contract-block-field">
            <span>说明</span>
            <textarea
              rows={2}
              value={item.description ?? ''}
              disabled={readOnly}
              onChange={(event) => onUpdate(key, { ...item, description: event.target.value })}
            />
          </label>
        </article>
      ))}
      {Object.keys(items).length === 0 && <div className="contract-empty">{emptyLabel}</div>}
      {!readOnly && <button className="contract-add-button" type="button" onClick={onAdd}>+ 添加{label}</button>}
    </div>
  )
}

export function ComponentContractEditor({
  definition,
  readOnly,
  onChange,
}: ComponentContractEditorProps) {
  const [tab, setTab] = useState<ContractTab>('properties')

  function updateProperty(key: string, property: ComponentPropertyDefinition) {
    onChange({
      ...definition,
      properties: { ...definition.properties, [key]: property },
    })
  }

  function removeProperty(key: string) {
    const next = { ...definition.properties }
    delete next[key]
    onChange({ ...definition, properties: next })
  }

  function renameProperty(oldKey: string, nextKey: string) {
    onChange({
      ...definition,
      properties: replaceRecordKey(definition.properties, oldKey, nextKey),
    })
  }

  function addProperty() {
    const key = nextUniqueKey('property', Object.keys(definition.properties))
    onChange({
      ...definition,
      properties: { ...definition.properties, [key]: createProperty() },
    })
  }

  function updateAction(key: string, action: InteractionDefinition) {
    onChange({
      ...definition,
      actions: { ...definition.actions, [key]: action },
    })
  }

  function renameAction(oldKey: string, nextKey: string) {
    onChange({
      ...definition,
      actions: replaceRecordKey(definition.actions, oldKey, nextKey),
    })
  }

  function removeAction(key: string) {
    const next = { ...definition.actions }
    delete next[key]
    onChange({ ...definition, actions: next })
  }

  function addAction() {
    const key = nextUniqueKey('action', Object.keys(definition.actions))
    onChange({
      ...definition,
      actions: { ...definition.actions, [key]: { title: '新方法' } },
    })
  }

  function updateEvent(key: string, event: InteractionDefinition) {
    onChange({
      ...definition,
      events: { ...definition.events, [key]: event },
    })
  }

  function renameEvent(oldKey: string, nextKey: string) {
    onChange({
      ...definition,
      events: replaceRecordKey(definition.events, oldKey, nextKey),
    })
  }

  function removeEvent(key: string) {
    const next = { ...definition.events }
    delete next[key]
    onChange({ ...definition, events: next })
  }

  function addEvent() {
    const key = nextUniqueKey('event', Object.keys(definition.events))
    onChange({
      ...definition,
      events: { ...definition.events, [key]: { title: '新事件' } },
    })
  }

  function updateAnchor(index: number, anchor: VisualAnchorDefinition) {
    onChange({
      ...definition,
      anchors: definition.anchors.map((candidate, candidateIndex) =>
        candidateIndex === index ? anchor : candidate,
      ),
    })
  }

  function removeAnchor(index: number) {
    onChange({
      ...definition,
      anchors: definition.anchors.filter((_, candidateIndex) => candidateIndex !== index),
    })
  }

  function addAnchor() {
    const id = nextUniqueKey('anchor', definition.anchors.map((anchor) => anchor.id))
    onChange({
      ...definition,
      anchors: [
        ...definition.anchors,
        {
          id,
          title: '新锚点',
          position: { x: 1, y: 0.5 },
          outward: { x: 1, y: 0 },
          snapRadius: 24,
          role: 'neutral',
        },
      ],
    })
  }

  const counts: Record<ContractTab, number> = {
    properties: Object.keys(definition.properties).length,
    actions: Object.keys(definition.actions).length,
    events: Object.keys(definition.events).length,
    anchors: definition.anchors.length,
  }

  return (
    <section className="component-contract-card">
      <div className="component-form-heading">
        <span>PUBLIC CONTRACT</span>
        <h1>公开契约</h1>
        <p>SCADA 组态只会看到这里明确暴露的 Property、Action、Event 和 Anchor；组件内部图层与实现不会自动泄漏出去。</p>
      </div>

      <div className="component-contract-tabs" role="tablist" aria-label="组件公开契约">
        {([
          ['properties', '属性'],
          ['actions', '方法'],
          ['events', '事件'],
          ['anchors', '锚点'],
        ] as Array<[ContractTab, string]>).map(([candidate, label]) => (
          <button
            key={candidate}
            type="button"
            className={tab === candidate ? 'active' : ''}
            onClick={() => setTab(candidate)}
          >
            {label} <small>{counts[candidate]}</small>
          </button>
        ))}
      </div>

      {tab === 'properties' && (
        <div className="contract-list">
          {Object.entries(definition.properties).map(([key, property]) => (
            <article className="contract-item" key={key}>
              <div className="contract-item-head">
                <strong>{property.title || key}</strong>
                {!readOnly && <button type="button" onClick={() => removeProperty(key)}>删除</button>}
              </div>
              <div className="contract-grid">
                <label>
                  <span>Key</span>
                  <ContractKeyInput
                    value={key}
                    disabled={readOnly}
                    onCommit={(nextKey) => renameProperty(key, nextKey)}
                  />
                </label>
                <label>
                  <span>标题</span>
                  <input
                    value={property.title}
                    disabled={readOnly}
                    onChange={(event) => updateProperty(key, { ...property, title: event.target.value })}
                  />
                </label>
                <label>
                  <span>类型</span>
                  <select
                    value={property.kind}
                    disabled={readOnly}
                    onChange={(event) => updateProperty(
                      key,
                      convertPropertyKind(property, event.target.value as ComponentPropertyKind),
                    )}
                  >
                    {PROPERTY_KIND_LABELS.map(([kind, label]) => (
                      <option key={kind} value={kind}>{label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>默认值</span>
                  <PropertyDefaultEditor
                    property={property}
                    disabled={readOnly}
                    onChange={(defaultValue) => updateProperty(key, { ...property, defaultValue })}
                  />
                </label>
              </div>

              {property.kind === 'select' && (
                <label className="contract-block-field">
                  <span>枚举选项（每行 `标题=值`，纯数字值会保存为 number）</span>
                  <textarea
                    rows={4}
                    value={formatOptions(property.options)}
                    disabled={readOnly}
                    onChange={(event) => {
                      const options = parseOptions(event.target.value)
                      const currentDefaultValid = options.some(
                        (option) => option.value === property.defaultValue,
                      )
                      updateProperty(key, {
                        ...property,
                        options,
                        defaultValue: currentDefaultValid
                          ? property.defaultValue
                          : options[0]?.value ?? '',
                      })
                    }}
                  />
                </label>
              )}

              <div className="contract-inline-row">
                <label className="contract-checkbox">
                  <input
                    type="checkbox"
                    checked={Boolean(property.bindable)}
                    disabled={readOnly}
                    onChange={(event) => updateProperty(key, { ...property, bindable: event.target.checked })}
                  />
                  <span>允许 SCADA 数据绑定</span>
                </label>
              </div>

              <label className="contract-block-field">
                <span>说明</span>
                <textarea
                  rows={2}
                  value={property.description ?? ''}
                  disabled={readOnly}
                  onChange={(event) => updateProperty(key, { ...property, description: event.target.value })}
                />
              </label>
            </article>
          ))}
          {Object.keys(definition.properties).length === 0 && (
            <div className="contract-empty">尚未定义公开 Property。</div>
          )}
          {!readOnly && (
            <button className="contract-add-button" type="button" onClick={addProperty}>+ 添加属性</button>
          )}
        </div>
      )}

      {tab === 'actions' && (
        <InteractionList
          label="方法"
          emptyLabel="尚未定义公开 Action。"
          items={definition.actions}
          readOnly={readOnly}
          onRename={renameAction}
          onUpdate={updateAction}
          onRemove={removeAction}
          onAdd={addAction}
        />
      )}

      {tab === 'events' && (
        <InteractionList
          label="事件"
          emptyLabel="尚未定义公开 Event。"
          items={definition.events}
          readOnly={readOnly}
          onRename={renameEvent}
          onUpdate={updateEvent}
          onRemove={removeEvent}
          onAdd={addEvent}
        />
      )}

      {tab === 'anchors' && (
        <div className="contract-list">
          {definition.anchors.map((anchor, index) => (
            <article className="contract-item" key={index}>
              <div className="contract-item-head">
                <strong>{anchor.title || anchor.id}</strong>
                {!readOnly && <button type="button" onClick={() => removeAnchor(index)}>删除</button>}
              </div>
              <div className="contract-grid contract-grid-three">
                <label>
                  <span>ID</span>
                  <input value={anchor.id} disabled={readOnly} onChange={(event) => updateAnchor(index, { ...anchor, id: event.target.value })} />
                </label>
                <label>
                  <span>标题</span>
                  <input value={anchor.title} disabled={readOnly} onChange={(event) => updateAnchor(index, { ...anchor, title: event.target.value })} />
                </label>
                <label>
                  <span>角色</span>
                  <select value={anchor.role ?? 'neutral'} disabled={readOnly} onChange={(event) => updateAnchor(index, { ...anchor, role: event.target.value as VisualAnchorRole })}>
                    {ANCHOR_ROLE_LABELS.map(([role, label]) => <option key={role} value={role}>{label}</option>)}
                  </select>
                </label>
                <label>
                  <span>位置 X (0..1)</span>
                  <input type="number" min="0" max="1" step="0.05" value={anchor.position.x} disabled={readOnly} onChange={(event) => updateAnchor(index, { ...anchor, position: { ...anchor.position, x: Number(event.target.value) } })} />
                </label>
                <label>
                  <span>位置 Y (0..1)</span>
                  <input type="number" min="0" max="1" step="0.05" value={anchor.position.y} disabled={readOnly} onChange={(event) => updateAnchor(index, { ...anchor, position: { ...anchor.position, y: Number(event.target.value) } })} />
                </label>
                <label>
                  <span>吸附半径</span>
                  <input type="number" min="1" value={anchor.snapRadius ?? 24} disabled={readOnly} onChange={(event) => updateAnchor(index, { ...anchor, snapRadius: Number(event.target.value) })} />
                </label>
                <label>
                  <span>方向 X</span>
                  <input type="number" step="0.1" value={anchor.outward.x} disabled={readOnly} onChange={(event) => updateAnchor(index, { ...anchor, outward: { ...anchor.outward, x: Number(event.target.value) } })} />
                </label>
                <label>
                  <span>方向 Y</span>
                  <input type="number" step="0.1" value={anchor.outward.y} disabled={readOnly} onChange={(event) => updateAnchor(index, { ...anchor, outward: { ...anchor.outward, y: Number(event.target.value) } })} />
                </label>
                <label>
                  <span>连接类别（逗号分隔）</span>
                  <input
                    value={(anchor.kinds ?? []).join(', ')}
                    disabled={readOnly}
                    onChange={(event) => updateAnchor(index, {
                      ...anchor,
                      kinds: event.target.value
                        .split(',')
                        .map((kind) => kind.trim())
                        .filter(Boolean),
                    })}
                  />
                </label>
              </div>
            </article>
          ))}
          {definition.anchors.length === 0 && <div className="contract-empty">尚未定义 Visual Anchor。</div>}
          {!readOnly && <button className="contract-add-button" type="button" onClick={addAnchor}>+ 添加锚点</button>}
        </div>
      )}
    </section>
  )
}
