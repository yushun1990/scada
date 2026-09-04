import {
  assertManagedSvgDocument,
  type ManagedSvgAttribute,
  type ManagedSvgDocument,
  type ManagedSvgElement,
  type ManagedSvgNode,
} from './managedSvg'

export const MANAGED_SVG_PRESENTATION_FIELDS = [
  'fill',
  'stroke',
  'stroke-width',
  'opacity',
] as const

export type ManagedSvgPresentationField = typeof MANAGED_SVG_PRESENTATION_FIELDS[number]

const PRESENTATION_EDITABLE_TAGS = new Set([
  'svg',
  'g',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'symbol',
  'use',
  'text',
  'tspan',
])

function normalizePresentationValue(
  field: ManagedSvgPresentationField,
  value: string | null,
) {
  const normalized = value?.trim() ?? ''
  if (!normalized) return null

  if (normalized.length > 256) {
    throw new Error(`SVG ${field} 值过长`)
  }

  if (/[{};]/.test(normalized)) {
    throw new Error(`SVG ${field} 只接受单个受控属性值`)
  }

  if (field === 'opacity') {
    const parsed = Number(normalized)
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
      throw new Error('SVG opacity 必须是 0 到 1 之间的数字')
    }
    return String(parsed)
  }

  if (field === 'stroke-width') {
    const match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:px)?$/i.exec(normalized)
    if (!match) {
      throw new Error('SVG stroke-width 只接受非负数字或 px 值')
    }
    return normalized
  }

  return normalized
}

export function getManagedSvgElementAttribute(
  element: ManagedSvgElement,
  name: string,
) {
  return element.attributes.find((attribute) => attribute.name === name)?.value ?? null
}

export function findManagedSvgElement(
  document: ManagedSvgDocument,
  tagId: string,
): ManagedSvgElement | null {
  assertManagedSvgDocument(document)

  const visit = (element: ManagedSvgElement): ManagedSvgElement | null => {
    if (element.tagId === tagId) return element
    for (const child of element.children) {
      if (child.kind !== 'element') continue
      const found = visit(child)
      if (found) return found
    }
    return null
  }

  return visit(document.root)
}

export function isManagedSvgPresentationEditableElement(element: ManagedSvgElement) {
  return PRESENTATION_EDITABLE_TAGS.has(element.tagName)
}

function replacePresentationAttribute(
  attributes: readonly ManagedSvgAttribute[],
  field: ManagedSvgPresentationField,
  value: string | null,
) {
  const next = attributes.filter((attribute) => attribute.name !== field)
  if (value !== null) next.push({ name: field, value })
  next.sort((left, right) => left.name.localeCompare(right.name))
  return next
}

export function updateManagedSvgElementPresentation(
  document: ManagedSvgDocument,
  tagId: string,
  field: ManagedSvgPresentationField,
  value: string | null,
): ManagedSvgDocument {
  assertManagedSvgDocument(document)
  const current = findManagedSvgElement(document, tagId)
  if (!current) {
    throw new Error(`SVG 标签不存在：${tagId}`)
  }
  if (!isManagedSvgPresentationEditableElement(current)) {
    throw new Error(`<${current.tagName}> 不是当前可编辑的 SVG presentation 标签`)
  }

  const normalizedValue = normalizePresentationValue(field, value)
  const currentValue = getManagedSvgElementAttribute(current, field)
  if (currentValue === normalizedValue) return document

  let replaced = false
  const visit = (node: ManagedSvgNode): ManagedSvgNode => {
    if (node.kind === 'text') return node
    if (node.tagId === tagId) {
      replaced = true
      return {
        ...node,
        attributes: replacePresentationAttribute(node.attributes, field, normalizedValue),
      }
    }
    return {
      ...node,
      children: node.children.map(visit),
    }
  }

  const nextDocument: ManagedSvgDocument = {
    ...document,
    root: visit(document.root) as ManagedSvgElement,
  }

  if (!replaced) {
    throw new Error(`SVG 标签不存在：${tagId}`)
  }

  assertManagedSvgDocument(nextDocument)
  return nextDocument
}
