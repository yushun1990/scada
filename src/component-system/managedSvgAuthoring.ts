import {
  assertManagedSvgDocument,
  isManagedSvgAuthorRef,
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

export const MANAGED_SVG_GEOMETRY_FIELDS_BY_TAG = {
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
  circle: ['cx', 'cy', 'r'],
  ellipse: ['cx', 'cy', 'rx', 'ry'],
  line: ['x1', 'y1', 'x2', 'y2'],
  polyline: ['points'],
  polygon: ['points'],
} as const

export type ManagedSvgGeometryTag = keyof typeof MANAGED_SVG_GEOMETRY_FIELDS_BY_TAG
export type ManagedSvgGeometryField =
  typeof MANAGED_SVG_GEOMETRY_FIELDS_BY_TAG[ManagedSvgGeometryTag][number]

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

const NON_NEGATIVE_GEOMETRY_FIELDS = new Set<ManagedSvgGeometryField>([
  'width',
  'height',
  'r',
  'rx',
  'ry',
])

const SVG_NUMBER_SOURCE = String.raw`[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?`
const SVG_NUMBER_PATTERN = new RegExp(`^${SVG_NUMBER_SOURCE}$`)
const SVG_POINTS_PATTERN = new RegExp(
  `^\\s*${SVG_NUMBER_SOURCE}(?:(?:\\s*,\\s*|\\s+)${SVG_NUMBER_SOURCE})*\\s*$`,
)
const SVG_NUMBER_SCAN_PATTERN = new RegExp(SVG_NUMBER_SOURCE, 'g')
const MAX_MANAGED_SVG_POINT_PAIRS = 512

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

function normalizeAuthorRefValue(value: string | null) {
  const normalized = value?.trim() ?? ''
  if (!normalized) return null
  if (!isManagedSvgAuthorRef(normalized)) {
    throw new Error('SVG authorRef 必须是 1-64 位 ASCII 标识符，且不能使用保留的 svg-tag- 前缀')
  }
  return normalized
}

function normalizeGeometryNumber(
  field: ManagedSvgGeometryField,
  value: string,
) {
  if (!SVG_NUMBER_PATTERN.test(value)) {
    throw new Error(`SVG ${field} 只接受有限的无单位数字`)
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`SVG ${field} 必须是有限数字`)
  }
  if (NON_NEGATIVE_GEOMETRY_FIELDS.has(field) && parsed < 0) {
    throw new Error(`SVG ${field} 不能为负数`)
  }
  return String(parsed)
}

function normalizeGeometryPoints(value: string) {
  if (!SVG_POINTS_PATTERN.test(value)) {
    throw new Error('SVG points 只接受有限的无单位坐标对')
  }

  const tokens = value.match(SVG_NUMBER_SCAN_PATTERN) ?? []
  if (tokens.length < 2 || tokens.length % 2 !== 0) {
    throw new Error('SVG points 必须包含完整的 x,y 坐标对')
  }
  if (tokens.length / 2 > MAX_MANAGED_SVG_POINT_PAIRS) {
    throw new Error(`SVG points 最多接受 ${MAX_MANAGED_SVG_POINT_PAIRS} 个坐标对`)
  }

  const normalized = tokens.map((token) => {
    const parsed = Number(token)
    if (!Number.isFinite(parsed)) {
      throw new Error('SVG points 坐标必须是有限数字')
    }
    return String(parsed)
  })

  const pairs: string[] = []
  for (let index = 0; index < normalized.length; index += 2) {
    pairs.push(`${normalized[index]},${normalized[index + 1]}`)
  }
  return pairs.join(' ')
}

function normalizeGeometryValue(
  field: ManagedSvgGeometryField,
  value: string | null,
) {
  const normalized = value?.trim() ?? ''
  if (!normalized) return null
  return field === 'points'
    ? normalizeGeometryPoints(normalized)
    : normalizeGeometryNumber(field, normalized)
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

export function findManagedSvgElementByAuthorRef(
  document: ManagedSvgDocument,
  authorRef: string,
): ManagedSvgElement | null {
  assertManagedSvgDocument(document)
  const normalized = authorRef.trim()
  if (!isManagedSvgAuthorRef(normalized)) return null

  const visit = (element: ManagedSvgElement): ManagedSvgElement | null => {
    if (element.authorRef === normalized) return element
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

export function getManagedSvgGeometryFields(element: ManagedSvgElement) {
  if (!(element.tagName in MANAGED_SVG_GEOMETRY_FIELDS_BY_TAG)) {
    return [] as readonly ManagedSvgGeometryField[]
  }
  return MANAGED_SVG_GEOMETRY_FIELDS_BY_TAG[
    element.tagName as ManagedSvgGeometryTag
  ] as readonly ManagedSvgGeometryField[]
}

export function isManagedSvgGeometryEditableElement(element: ManagedSvgElement) {
  return getManagedSvgGeometryFields(element).length > 0
}

function replaceAttribute(
  attributes: readonly ManagedSvgAttribute[],
  field: string,
  value: string | null,
) {
  const next = attributes.filter((attribute) => attribute.name !== field)
  if (value !== null) next.push({ name: field, value })
  next.sort((left, right) => left.name.localeCompare(right.name))
  return next
}

export function updateManagedSvgElementAuthorRef(
  document: ManagedSvgDocument,
  tagId: string,
  value: string | null,
): ManagedSvgDocument {
  assertManagedSvgDocument(document)
  const current = findManagedSvgElement(document, tagId)
  if (!current) {
    throw new Error(`SVG 标签不存在：${tagId}`)
  }

  const normalizedValue = normalizeAuthorRefValue(value)
  if ((current.authorRef ?? null) === normalizedValue) return document

  if (normalizedValue !== null) {
    const occupied = findManagedSvgElementByAuthorRef(document, normalizedValue)
    if (occupied && occupied.tagId !== tagId) {
      throw new Error(`SVG authorRef 已被占用：${normalizedValue}`)
    }
  }

  let replaced = false
  const visit = (node: ManagedSvgNode): ManagedSvgNode => {
    if (node.kind === 'text') return node
    if (node.tagId === tagId) {
      replaced = true
      if (normalizedValue === null) {
        const { authorRef: _authorRef, ...withoutAuthorRef } = node
        return withoutAuthorRef
      }
      return {
        ...node,
        authorRef: normalizedValue,
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
        attributes: replaceAttribute(node.attributes, field, normalizedValue),
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

export function updateManagedSvgElementGeometry(
  document: ManagedSvgDocument,
  tagId: string,
  field: ManagedSvgGeometryField,
  value: string | null,
): ManagedSvgDocument {
  assertManagedSvgDocument(document)
  const current = findManagedSvgElement(document, tagId)
  if (!current) {
    throw new Error(`SVG 标签不存在：${tagId}`)
  }

  const editableFields = getManagedSvgGeometryFields(current)
  if (!editableFields.includes(field)) {
    throw new Error(`<${current.tagName}> 不支持几何字段 ${field}`)
  }

  const normalizedValue = normalizeGeometryValue(field, value)
  const currentValue = getManagedSvgElementAttribute(current, field)
  if (currentValue === normalizedValue) return document

  let replaced = false
  const visit = (node: ManagedSvgNode): ManagedSvgNode => {
    if (node.kind === 'text') return node
    if (node.tagId === tagId) {
      replaced = true
      return {
        ...node,
        attributes: replaceAttribute(node.attributes, field, normalizedValue),
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
