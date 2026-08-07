// Editor-only viewport geometry. These values are never serialized into SceneDocument.
export const MIN_VIEWPORT_SCALE = 0.1
export const MAX_VIEWPORT_SCALE = 8
export const VIEWPORT_ZOOM_FACTOR = 1.15
export const VIEWPORT_FIT_PADDING = 64
export const VIEWPORT_FILL_PADDING = 24

export type ViewportPoint = {
  x: number
  y: number
}

export type ViewportSize = {
  width: number
  height: number
}

export type ViewportTransform = {
  x: number
  y: number
  scale: number
}

export function clampViewportScale(scale: number) {
  return Math.min(MAX_VIEWPORT_SCALE, Math.max(MIN_VIEWPORT_SCALE, scale))
}

export function scenePointFromViewport(
  point: ViewportPoint,
  transform: ViewportTransform,
): ViewportPoint {
  return {
    x: (point.x - transform.x) / transform.scale,
    y: (point.y - transform.y) / transform.scale,
  }
}

export function viewportPointFromScene(
  point: ViewportPoint,
  transform: ViewportTransform,
): ViewportPoint {
  return {
    x: transform.x + point.x * transform.scale,
    y: transform.y + point.y * transform.scale,
  }
}

export function zoomViewportAtPoint(
  transform: ViewportTransform,
  viewportPoint: ViewportPoint,
  requestedScale: number,
): ViewportTransform {
  const scale = clampViewportScale(requestedScale)
  const scenePoint = scenePointFromViewport(viewportPoint, transform)

  return {
    x: viewportPoint.x - scenePoint.x * scale,
    y: viewportPoint.y - scenePoint.y * scale,
    scale,
  }
}

export function centerSceneAtScale(
  viewport: ViewportSize,
  scene: ViewportSize,
  requestedScale: number,
): ViewportTransform {
  const scale = clampViewportScale(requestedScale)

  return {
    x: (viewport.width - scene.width * scale) / 2,
    y: (viewport.height - scene.height * scale) / 2,
    scale,
  }
}

export function fitSceneToViewport(
  viewport: ViewportSize,
  scene: ViewportSize,
  padding = VIEWPORT_FIT_PADDING,
): ViewportTransform {
  const availableWidth = Math.max(1, viewport.width - padding * 2)
  const availableHeight = Math.max(1, viewport.height - padding * 2)
  const scale = clampViewportScale(
    Math.min(availableWidth / scene.width, availableHeight / scene.height),
  )

  return centerSceneAtScale(viewport, scene, scale)
}

// 内容包围盒：用于按组件内容（而非场景画布边界）计算视口。
export type ContentBounds = {
  width: number
  height: number
  centerX: number
  centerY: number
}

// 填满容器：按内容包围盒计算缩放，让内容撑满整个可视区
// （短边刚好，长边溢出裁切），并让内容中心对齐画板中心。
export function fillContentToViewport(
  viewport: ViewportSize,
  content: ContentBounds,
  padding = VIEWPORT_FILL_PADDING,
): ViewportTransform {
  const availableWidth = Math.max(1, viewport.width - padding * 2)
  const availableHeight = Math.max(1, viewport.height - padding * 2)
  // 用 max 而非 min：填满而非适应。
  const scale = clampViewportScale(
    Math.max(availableWidth / content.width, availableHeight / content.height),
  )

  return {
    x: viewport.width / 2 - content.centerX * scale,
    y: viewport.height / 2 - content.centerY * scale,
    scale,
  }
}

export function isPointInsideScene(point: ViewportPoint, scene: ViewportSize) {
  return (
    point.x >= 0 &&
    point.y >= 0 &&
    point.x <= scene.width &&
    point.y <= scene.height
  )
}
