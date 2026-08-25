export type GeometryBounds = {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
  centerX: number
  centerY: number
}

export type GeometryItem = {
  id: string
  bounds: GeometryBounds
}

export type GeometryDelta = {
  dx: number
  dy: number
}

export type GeometryDeltas = Record<string, GeometryDelta>

type AlignmentAxis =
  | 'left'
  | 'centerX'
  | 'right'
  | 'top'
  | 'centerY'
  | 'bottom'

type DistributionAxis = 'horizontal' | 'vertical'

function createSelectionBounds(items: readonly GeometryItem[]): GeometryBounds | null {
  if (items.length === 0) {
    return null
  }

  const left = Math.min(...items.map((item) => item.bounds.left))
  const top = Math.min(...items.map((item) => item.bounds.top))
  const right = Math.max(...items.map((item) => item.bounds.right))
  const bottom = Math.max(...items.map((item) => item.bounds.bottom))

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  }
}

function align(
  items: readonly GeometryItem[],
  axis: AlignmentAxis,
): GeometryDeltas {
  if (items.length < 2) {
    return {}
  }

  const selection = createSelectionBounds(items)

  if (!selection) {
    return {}
  }

  return Object.fromEntries(items.map((item) => {
    let dx = 0
    let dy = 0

    switch (axis) {
      case 'left':
        dx = selection.left - item.bounds.left
        break
      case 'centerX':
        dx = selection.centerX - item.bounds.centerX
        break
      case 'right':
        dx = selection.right - item.bounds.right
        break
      case 'top':
        dy = selection.top - item.bounds.top
        break
      case 'centerY':
        dy = selection.centerY - item.bounds.centerY
        break
      case 'bottom':
        dy = selection.bottom - item.bounds.bottom
        break
    }

    return [item.id, { dx, dy }]
  }))
}

function distribute(
  items: readonly GeometryItem[],
  axis: DistributionAxis,
): GeometryDeltas {
  if (items.length < 3) {
    return {}
  }

  const records = [...items].sort((first, second) =>
    axis === 'horizontal'
      ? first.bounds.left - second.bounds.left
      : first.bounds.top - second.bounds.top,
  )
  const first = records[0]
  const last = records[records.length - 1]

  if (!first || !last) {
    return {}
  }

  const totalItemSize = records.reduce(
    (sum, record) =>
      sum + (axis === 'horizontal' ? record.bounds.width : record.bounds.height),
    0,
  )
  const span = axis === 'horizontal'
    ? last.bounds.right - first.bounds.left
    : last.bounds.bottom - first.bounds.top
  const gap = (span - totalItemSize) / (records.length - 1)
  let cursor = axis === 'horizontal' ? first.bounds.left : first.bounds.top
  const deltas: GeometryDeltas = {}

  for (const record of records) {
    const current = axis === 'horizontal' ? record.bounds.left : record.bounds.top
    const delta = cursor - current

    deltas[record.id] = axis === 'horizontal'
      ? { dx: delta, dy: 0 }
      : { dx: 0, dy: delta }

    cursor +=
      (axis === 'horizontal' ? record.bounds.width : record.bounds.height) + gap
  }

  return deltas
}

export function alignLeft(items: readonly GeometryItem[]) {
  return align(items, 'left')
}

export function alignCenterX(items: readonly GeometryItem[]) {
  return align(items, 'centerX')
}

export function alignRight(items: readonly GeometryItem[]) {
  return align(items, 'right')
}

export function alignTop(items: readonly GeometryItem[]) {
  return align(items, 'top')
}

export function alignCenterY(items: readonly GeometryItem[]) {
  return align(items, 'centerY')
}

export function alignBottom(items: readonly GeometryItem[]) {
  return align(items, 'bottom')
}

export function distributeHorizontal(items: readonly GeometryItem[]) {
  return distribute(items, 'horizontal')
}

export function distributeVertical(items: readonly GeometryItem[]) {
  return distribute(items, 'vertical')
}
