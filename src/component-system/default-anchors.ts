import type { VisualAnchorDefinition } from './definition'

function anchor(
  id: string,
  title: string,
  x: number,
  y: number,
  outwardX: number,
  outwardY: number,
): VisualAnchorDefinition {
  return {
    id,
    title,
    position: { x, y },
    outward: { x: outwardX, y: outwardY },
    snapRadius: 24,
    role: 'neutral',
  }
}

export const DEFAULT_RECT_ANCHORS: readonly VisualAnchorDefinition[] = [
  anchor('top-left', '左上角', 0, 0, -1, -1),
  anchor('top-25', '上边 25%', 0.25, 0, 0, -1),
  anchor('top-center', '上边中心', 0.5, 0, 0, -1),
  anchor('top-75', '上边 75%', 0.75, 0, 0, -1),
  anchor('top-right', '右上角', 1, 0, 1, -1),
  anchor('right-25', '右边 25%', 1, 0.25, 1, 0),
  anchor('right-center', '右边中心', 1, 0.5, 1, 0),
  anchor('right-75', '右边 75%', 1, 0.75, 1, 0),
  anchor('bottom-right', '右下角', 1, 1, 1, 1),
  anchor('bottom-75', '下边 75%', 0.75, 1, 0, 1),
  anchor('bottom-center', '下边中心', 0.5, 1, 0, 1),
  anchor('bottom-25', '下边 25%', 0.25, 1, 0, 1),
  anchor('bottom-left', '左下角', 0, 1, -1, 1),
  anchor('left-75', '左边 75%', 0, 0.75, -1, 0),
  anchor('left-center', '左边中心', 0, 0.5, -1, 0),
  anchor('left-25', '左边 25%', 0, 0.25, -1, 0),
]
