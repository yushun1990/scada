import { useEffect, useMemo, useState } from 'react'
import {
  serializeManagedSvgDataUrl,
  type ManagedSvgElement,
} from '../../component-system/managedSvg'
import {
  findManagedSvgElement,
  getManagedSvgElementAttribute,
  getManagedSvgGeometryFields,
  isManagedSvgPresentationEditableElement,
  updateManagedSvgElementAuthorRef,
  updateManagedSvgElementGeometry,
  updateManagedSvgElementPresentation,
  type ManagedSvgGeometryField,
  type ManagedSvgPresentationField,
} from '../../component-system/managedSvgAuthoring'
import type { SvgVisualLayer } from '../../component-system/visual'
import { Input, Pressable } from '../../ui'
import {
  setComponentManagedSvgSelection,
  useComponentManagedSvgSelection,
} from './component-managed-svg-selection'
import './component-managed-svg-editor.css'

type ComponentManagedSvgEditorProps = {
  layer: SvgVisualLayer
  readOnly: boolean
  onChange: (layer: SvgVisualLayer) => void
}

type SvgTreeEntry = {
  element: ManagedSvgElement
  depth: number
}

const GEOMETRY_FIELD_LABELS: Record<ManagedSvgGeometryField, string> = {
  x: 'X',
  y: 'Y',
  width: 'Width',
  height: 'Height',
  rx: 'Radius X',
  ry: 'Radius Y',
  cx: 'Center X',
  cy: 'Center Y',
  r: 'Radius',
  x1: 'X1',
  y1: 'Y1',
  x2: 'X2',
  y2: 'Y2',
  points: 'Points',
}

const NON_NEGATIVE_GEOMETRY_FIELDS = new Set<ManagedSvgGeometryField>([
  'width',
  'height',
  'r',
  'rx',
  'ry',
])

function flattenSvgTree(root: ManagedSvgElement) {
  const result: SvgTreeEntry[] = []
  const visit = (element: ManagedSvgElement, depth: number) => {
    result.push({ element, depth })
    for (const child of element.children) {
      if (child.kind === 'element') visit(child, depth + 1)
    }
  }
  visit(root, 0)
  return result
}

function PresentationInput({
  label,
  field,
  value,
  disabled,
  type,
  min,
  max,
  step,
  onCommit,
}: {
  label: string
  field: ManagedSvgPresentationField
  value: string | null
  disabled: boolean
  type?: 'text' | 'number'
  min?: string
  max?: string
  step?: string
  onCommit: (field: ManagedSvgPresentationField, value: string) => void
}) {
  return (
    <label className="property-field compact">
      <span>{label}</span>
      <Input
        key={`${field}:${value ?? ''}`}
        type={type ?? 'text'}
        defaultValue={value ?? ''}
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        placeholder="未设置 / 继承"
        onBlur={(event) => onCommit(field, event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
      />
    </label>
  )
}

function GeometryInput({
  field,
  value,
  disabled,
  onCommit,
}: {
  field: ManagedSvgGeometryField
  value: string | null
  disabled: boolean
  onCommit: (field: ManagedSvgGeometryField, value: string) => void
}) {
  const points = field === 'points'
  return (
    <label className={`property-field compact${points ? ' component-managed-svg-points-field' : ''}`}>
      <span>{GEOMETRY_FIELD_LABELS[field]}</span>
      <Input
        key={`geometry:${field}:${value ?? ''}`}
        type={points ? 'text' : 'number'}
        defaultValue={value ?? ''}
        disabled={disabled}
        min={!points && NON_NEGATIVE_GEOMETRY_FIELDS.has(field) ? '0' : undefined}
        step={points ? undefined : 'any'}
        placeholder={points ? '例如 0,0 20,10 40,0' : '未设置 / SVG 默认值'}
        onBlur={(event) => onCommit(field, event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
      />
    </label>
  )
}

export function ComponentManagedSvgEditor({
  layer,
  readOnly,
  onChange,
}: ComponentManagedSvgEditorProps) {
  const document = layer.document
  const selection = useComponentManagedSvgSelection()
  const selectedTagId = selection?.layerId === layer.id ? selection.tagId : null
  const [message, setMessage] = useState('')
  const entries = useMemo(
    () => document ? flattenSvgTree(document.root) : [],
    [document],
  )
  const selectedElement = useMemo(
    () => document && selectedTagId
      ? findManagedSvgElement(document, selectedTagId)
      : null,
    [document, selectedTagId],
  )
  const geometryFields = useMemo(
    () => selectedElement ? getManagedSvgGeometryFields(selectedElement) : [],
    [selectedElement],
  )

  useEffect(() => {
    if (!document) {
      if (selection?.layerId === layer.id) {
        setComponentManagedSvgSelection(null)
      }
      return
    }

    if (!selectedTagId || !findManagedSvgElement(document, selectedTagId)) {
      setComponentManagedSvgSelection({
        layerId: layer.id,
        tagId: document.root.tagId,
      })
    }
  }, [document, layer.id, selectedTagId, selection?.layerId])

  if (!document) return null

  const editable = selectedElement
    ? isManagedSvgPresentationEditableElement(selectedElement)
    : false

  function commitAuthorRef(value: string) {
    const currentDocument = layer.document
    if (readOnly || !selectedTagId || !currentDocument) return

    try {
      const nextDocument = updateManagedSvgElementAuthorRef(
        currentDocument,
        selectedTagId,
        value,
      )
      if (nextDocument === currentDocument) {
        setMessage('引用名称未改变')
        return
      }

      onChange({
        ...layer,
        document: nextDocument,
      })
      setMessage(
        value.trim()
          ? `${selectedTagId} · 引用名称已更新`
          : `${selectedTagId} · 引用名称已移除`,
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'SVG 引用名称编辑失败')
    }
  }

  function commitGeometry(field: ManagedSvgGeometryField, value: string) {
    const currentDocument = layer.document
    if (readOnly || !selectedTagId || !currentDocument) return

    try {
      const nextDocument = updateManagedSvgElementGeometry(
        currentDocument,
        selectedTagId,
        field,
        value,
      )
      if (nextDocument === currentDocument) {
        setMessage('几何值未改变')
        return
      }
      onChange({
        ...layer,
        document: nextDocument,
        assetRef: serializeManagedSvgDataUrl(nextDocument),
      })
      setMessage(`${selectedTagId} · ${field} 已更新`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'SVG 几何编辑失败')
    }
  }

  function commitPresentation(field: ManagedSvgPresentationField, value: string) {
    const currentDocument = layer.document
    if (readOnly || !selectedTagId || !currentDocument) return

    try {
      const nextDocument = updateManagedSvgElementPresentation(
        currentDocument,
        selectedTagId,
        field,
        value,
      )
      if (nextDocument === currentDocument) {
        setMessage('值未改变')
        return
      }
      onChange({
        ...layer,
        document: nextDocument,
        assetRef: serializeManagedSvgDataUrl(nextDocument),
      })
      setMessage(`${selectedTagId} · ${field} 已更新`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'SVG 标签编辑失败')
    }
  }

  return (
    <div className="component-managed-svg-editor">
      <div className="component-managed-svg-summary">
        <strong>内部 SVG 结构</strong>
        <span>{entries.length} 个托管标签 · 树选择同步 Canvas 高亮</span>
      </div>

      <div className="component-managed-svg-tree" role="tree" aria-label="SVG 内部结构">
        {entries.map(({ element, depth }) => {
          const sourceId = getManagedSvgElementAttribute(element, 'id')
          const details = [
            element.authorRef ? element.tagId : null,
            sourceId ? `#${sourceId}` : null,
          ].filter(Boolean).join(' · ')

          return (
            <Pressable
              key={element.tagId}
              className={`component-managed-svg-row${selectedTagId === element.tagId ? ' active' : ''}`}
              style={{ paddingLeft: `${10 + depth * 14}px` }}
              role="treeitem"
              aria-selected={selectedTagId === element.tagId}
              onClick={() => {
                setComponentManagedSvgSelection({
                  layerId: layer.id,
                  tagId: element.tagId,
                })
                setMessage('')
              }}
            >
              <span className="component-managed-svg-tag">&lt;{element.tagName}&gt;</span>
              <span className="component-managed-svg-id">
                {element.authorRef ? `@${element.authorRef}` : element.tagId}
              </span>
              {details && <small>{details}</small>}
            </Pressable>
          )
        })}
      </div>

      {selectedElement && (
        <div className="component-managed-svg-properties">
          <div className="component-managed-svg-selected">
            <strong>&lt;{selectedElement.tagName}&gt;</strong>
            <span>
              {selectedElement.authorRef ? `@${selectedElement.authorRef} · ` : ''}
              {selectedElement.tagId}
            </span>
          </div>

          <label className="property-field">
            <span>引用名称</span>
            <Input
              key={`authorRef:${selectedElement.authorRef ?? ''}`}
              defaultValue={selectedElement.authorRef ?? ''}
              disabled={readOnly}
              placeholder="例如 rotor / statusLamp"
              onBlur={(event) => commitAuthorRef(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
              }}
            />
          </label>
          <p className="component-inspector-help component-managed-svg-reference-help">
            引用名称是组件私有的 authoring alias；真正的结构/runtime identity 仍是 {selectedElement.tagId}。重命名或移除引用不会改写现有 Visual Rule target。
          </p>

          {geometryFields.length > 0 && (
            <div className="component-managed-svg-geometry-section">
              <div className="component-managed-svg-selected">
                <strong>Geometry</strong>
                <span>&lt;{selectedElement.tagName}&gt; 的受控 SVG 几何属性</span>
              </div>
              <div className="property-grid component-managed-svg-property-grid">
                {geometryFields.map((field) => (
                  <GeometryInput
                    key={field}
                    field={field}
                    value={getManagedSvgElementAttribute(selectedElement, field)}
                    disabled={readOnly}
                    onCommit={commitGeometry}
                  />
                ))}
              </div>
              <p className="component-inspector-help">
                数值字段只接受有限的无单位 SVG user-space 数字；尺寸/半径不可为负。Points 会规范化为 x,y 坐标对。留空恢复 SVG 默认值。
              </p>
            </div>
          )}

          {editable ? (
            <div className="property-grid component-managed-svg-property-grid">
              <PresentationInput
                label="Fill"
                field="fill"
                value={getManagedSvgElementAttribute(selectedElement, 'fill')}
                disabled={readOnly}
                onCommit={commitPresentation}
              />
              <PresentationInput
                label="Stroke"
                field="stroke"
                value={getManagedSvgElementAttribute(selectedElement, 'stroke')}
                disabled={readOnly}
                onCommit={commitPresentation}
              />
              <PresentationInput
                label="Stroke Width"
                field="stroke-width"
                value={getManagedSvgElementAttribute(selectedElement, 'stroke-width')}
                disabled={readOnly}
                onCommit={commitPresentation}
              />
              <PresentationInput
                label="Opacity"
                field="opacity"
                value={getManagedSvgElementAttribute(selectedElement, 'opacity')}
                disabled={readOnly}
                onCommit={commitPresentation}
              />
            </div>
          ) : (
            <p className="component-inspector-help">
              当前节点保留在安全 SVG 结构中，但不属于当前 presentation 编辑子集。
            </p>
          )}
        </div>
      )}

      <p className="component-inspector-help">
        这里只开放稳定 authoring reference、受控 typed geometry 与 fill / stroke / stroke-width / opacity；不会开放任意 XML 属性、DOM selector、Transform 字符串、Path d 或 Path 点编辑。
      </p>
      {message && (
        <span className="component-managed-svg-message" role="status" aria-live="polite">
          {message}
        </span>
      )}
    </div>
  )
}
