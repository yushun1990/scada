import { useEffect, useMemo, useState } from 'react'
import {
  serializeManagedSvgDataUrl,
  type ManagedSvgElement,
} from '../../component-system/managedSvg'
import {
  findManagedSvgElement,
  getManagedSvgElementAttribute,
  isManagedSvgPresentationEditableElement,
  updateManagedSvgElementPresentation,
  type ManagedSvgPresentationField,
} from '../../component-system/managedSvgAuthoring'
import type { SvgVisualLayer } from '../../component-system/visual'
import { Input, Pressable } from '../../ui'
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

export function ComponentManagedSvgEditor({
  layer,
  readOnly,
  onChange,
}: ComponentManagedSvgEditorProps) {
  const document = layer.document
  const [selectedTagId, setSelectedTagId] = useState(document?.root.tagId ?? null)
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

  useEffect(() => {
    if (!document) {
      setSelectedTagId(null)
      return
    }
    if (!selectedTagId || !findManagedSvgElement(document, selectedTagId)) {
      setSelectedTagId(document.root.tagId)
    }
  }, [document, selectedTagId])

  if (!document) return null

  const editable = selectedElement
    ? isManagedSvgPresentationEditableElement(selectedElement)
    : false

  function commitPresentation(field: ManagedSvgPresentationField, value: string) {
    if (readOnly || !selectedTagId) return

    try {
      const nextDocument = updateManagedSvgElementPresentation(
        document,
        selectedTagId,
        field,
        value,
      )
      if (nextDocument === document) {
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
        <span>{entries.length} 个托管标签 · 选择不会改变外层 SVG 图层选择</span>
      </div>

      <div className="component-managed-svg-tree" role="tree" aria-label="SVG 内部结构">
        {entries.map(({ element, depth }) => {
          const sourceId = getManagedSvgElementAttribute(element, 'id')
          return (
            <Pressable
              key={element.tagId}
              className={`component-managed-svg-row${selectedTagId === element.tagId ? ' active' : ''}`}
              style={{ paddingLeft: `${10 + depth * 14}px` }}
              role="treeitem"
              aria-selected={selectedTagId === element.tagId}
              onClick={() => {
                setSelectedTagId(element.tagId)
                setMessage('')
              }}
            >
              <span className="component-managed-svg-tag">&lt;{element.tagName}&gt;</span>
              <span className="component-managed-svg-id">{element.tagId}</span>
              {sourceId && <small>#{sourceId}</small>}
            </Pressable>
          )
        })}
      </div>

      {selectedElement && (
        <div className="component-managed-svg-properties">
          <div className="component-managed-svg-selected">
            <strong>&lt;{selectedElement.tagName}&gt;</strong>
            <span>{selectedElement.tagId}</span>
          </div>

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
                type="number"
                min="0"
                max="1"
                step="0.05"
                onCommit={commitPresentation}
              />
            </div>
          ) : (
            <p className="component-inspector-help">
              当前节点保留在安全 SVG 结构中，但不属于 P1.2 的 presentation 编辑子集。
            </p>
          )}
        </div>
      )}

      <p className="component-inspector-help">
        P1.2 只编辑 fill / stroke / stroke-width / opacity；留空会移除该属性并恢复 SVG 继承。不会开放任意 XML 属性或 Path 点编辑。
      </p>
      {message && (
        <span className="component-managed-svg-message" role="status" aria-live="polite">
          {message}
        </span>
      )}
    </div>
  )
}
