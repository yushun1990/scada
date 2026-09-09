import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  ComponentVisualDefinition,
  ComponentVisualLayer,
  TextVisualLayer,
} from '../../component-system/visual'
import { Button, Input } from '../../ui'
import {
  appendCreatedVectorLayer,
  clearComponentCreateTool,
  resolveComponentCreateGeometry,
  selectComponentCreateTool,
  useComponentCreateTool,
  type ComponentCreateTool,
  type ComponentDesignPoint,
} from './component-create-mode'
import {
  addComponentVisualAssetResources,
  listComponentVisualAssetResources,
  type ComponentVisualAssetResource,
} from './component-visual-asset-library'
import { listComponentDefinitions, type ComponentLibraryEntry } from './storage'
import {
  applyImportedVisualAsset,
  importLocalVisualAsset,
  LOCAL_VISUAL_ASSET_ACCEPT,
} from './visual-asset-import'
import type { ComponentLayerSelectionChange } from './ComponentVisualTreeEditor'

const PALETTE_DRAG_MIME = 'application/x-scada-component-palette'

const PALETTE_PRIMITIVES: readonly Array<{
  tool: ComponentCreateTool
  symbol: string
}> = [
  {
    tool: {
      kind: 'vector',
      primitive: 'rect',
      label: '矩形',
      defaultWidth: 96,
      defaultHeight: 64,
    },
    symbol: '□',
  },
  {
    tool: {
      kind: 'vector',
      primitive: 'ellipse',
      label: '圆/椭圆',
      defaultWidth: 72,
      defaultHeight: 72,
    },
    symbol: '○',
  },
  {
    tool: {
      kind: 'vector',
      primitive: 'line',
      label: '线段',
      defaultWidth: 120,
      defaultHeight: 8,
    },
    symbol: '╱',
  },
]

type PaletteDragPayload =
  | { kind: 'primitive'; primitive: ComponentCreateTool['primitive'] }
  | { kind: 'text' }
  | { kind: 'component'; componentId: string }
  | { kind: 'resource'; resourceId: string }

type ComponentAuthoringPaletteProps = {
  visual: ComponentVisualDefinition
  readOnly: boolean
  onSelectionChange: ComponentLayerSelectionChange
  onChange: (visual: ComponentVisualDefinition) => void
}

function parseDragPayload(value: string): PaletteDragPayload | null {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    if (parsed.kind === 'text') return { kind: 'text' }
    if (
      parsed.kind === 'primitive'
      && (parsed.primitive === 'rect' || parsed.primitive === 'ellipse' || parsed.primitive === 'line')
    ) {
      return { kind: 'primitive', primitive: parsed.primitive }
    }
    if (parsed.kind === 'component' && typeof parsed.componentId === 'string') {
      return { kind: 'component', componentId: parsed.componentId }
    }
    if (parsed.kind === 'resource' && typeof parsed.resourceId === 'string') {
      return { kind: 'resource', resourceId: parsed.resourceId }
    }
  } catch {
    // Ignore foreign drag payloads.
  }
  return null
}

function setDragPayload(event: React.DragEvent, payload: PaletteDragPayload) {
  event.dataTransfer.effectAllowed = 'copy'
  event.dataTransfer.setData(PALETTE_DRAG_MIME, JSON.stringify(payload))
}

function currentComponentIdFromHash() {
  const match = window.location.hash.match(/^#\/components\/([^/?#]+)/)
  if (!match) return null

  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

function nextTextLayerId(layers: readonly ComponentVisualLayer[]) {
  const ids = new Set(layers.map((layer) => layer.id))
  let index = 1
  while (ids.has(`text${index}`)) index += 1
  return `text${index}`
}

function uniqueImportedLayerId(
  sourceId: string,
  usedIds: Set<string>,
) {
  const safeBase = sourceId.replace(/[^a-zA-Z0-9_-]+/g, '-') || 'layer'
  let candidate = safeBase
  let index = 2
  while (usedIds.has(candidate)) {
    candidate = `${safeBase}-${index}`
    index += 1
  }
  usedIds.add(candidate)
  return candidate
}

function cloneLayer<T extends ComponentVisualLayer>(layer: T): T {
  return globalThis.structuredClone
    ? globalThis.structuredClone(layer)
    : JSON.parse(JSON.stringify(layer)) as T
}

function placeComponentVisualCopy(
  target: ComponentVisualDefinition,
  source: ComponentLibraryEntry,
  point: ComponentDesignPoint,
) {
  if (
    target.mode !== 'composite'
    || source.visual.mode !== 'composite'
    || source.visual.layers.length === 0
  ) {
    return { visual: target, rootIds: [] as string[] }
  }

  const rootLayers = source.visual.layers.filter((layer) => layer.parentId === null)
  if (rootLayers.length === 0) {
    return { visual: target, rootIds: [] as string[] }
  }

  const minX = Math.min(...rootLayers.map((layer) => layer.transform.x))
  const minY = Math.min(...rootLayers.map((layer) => layer.transform.y))
  const maxX = Math.max(...rootLayers.map((layer) => layer.transform.x + layer.transform.width))
  const maxY = Math.max(...rootLayers.map((layer) => layer.transform.y + layer.transform.height))
  const boundsWidth = Math.max(1, maxX - minX)
  const boundsHeight = Math.max(1, maxY - minY)
  const requestedX = point.x - (minX + boundsWidth / 2)
  const requestedY = point.y - (minY + boundsHeight / 2)
  const minOffsetX = -minX
  const minOffsetY = -minY
  const maxOffsetX = target.designSize.width - maxX
  const maxOffsetY = target.designSize.height - maxY
  const offsetX = boundsWidth <= target.designSize.width
    ? Math.min(maxOffsetX, Math.max(minOffsetX, requestedX))
    : requestedX
  const offsetY = boundsHeight <= target.designSize.height
    ? Math.min(maxOffsetY, Math.max(minOffsetY, requestedY))
    : requestedY

  const usedIds = new Set(target.layers.map((layer) => layer.id))
  const idMap = new Map<string, string>()
  for (const layer of source.visual.layers) {
    idMap.set(layer.id, uniqueImportedLayerId(layer.id, usedIds))
  }

  const copiedLayers = source.visual.layers.map((sourceLayer) => {
    const layer = cloneLayer(sourceLayer)
    const mappedId = idMap.get(sourceLayer.id)!
    const mappedParentId = sourceLayer.parentId
      ? idMap.get(sourceLayer.parentId) ?? null
      : null

    return {
      ...layer,
      id: mappedId,
      name: `${source.definition.title} · ${sourceLayer.name}`,
      parentId: mappedParentId,
      transform: sourceLayer.parentId === null
        ? {
            ...layer.transform,
            x: layer.transform.x + offsetX,
            y: layer.transform.y + offsetY,
          }
        : layer.transform,
    } as ComponentVisualLayer
  })

  return {
    visual: { ...target, layers: [...target.layers, ...copiedLayers] },
    rootIds: rootLayers.map((layer) => idMap.get(layer.id)!).filter(Boolean),
  }
}

function centeredPoint(visual: ComponentVisualDefinition): ComponentDesignPoint {
  return {
    x: visual.designSize.width / 2,
    y: visual.designSize.height / 2,
  }
}

export function ComponentAuthoringPalette({
  visual,
  readOnly,
  onSelectionChange,
  onChange,
}: ComponentAuthoringPaletteProps) {
  const createTool = useComponentCreateTool()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [components, setComponents] = useState<ComponentLibraryEntry[]>([])
  const [resources, setResources] = useState<ComponentVisualAssetResource[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const currentComponentId = useMemo(currentComponentIdFromHash, [])
  const editableComponents = useMemo(
    () => components.filter((component) =>
      !component.builtIn
      && component.id !== currentComponentId
      && component.visual.mode === 'composite'
      && component.visual.layers.length > 0,
    ),
    [components, currentComponentId],
  )

  useEffect(() => {
    let active = true
    void Promise.all([
      listComponentDefinitions(),
      listComponentVisualAssetResources(),
    ]).then(([nextComponents, nextResources]) => {
      if (!active) return
      setComponents(nextComponents)
      setResources(nextResources)
    }).catch((error) => {
      if (active) setMessage(error instanceof Error ? error.message : '左侧资源加载失败')
    })

    return () => {
      active = false
    }
  }, [])

  function commitVisual(nextVisual: ComponentVisualDefinition, layerId: string | null) {
    clearComponentCreateTool()
    onChange(nextVisual)
    onSelectionChange(layerId)
  }

  function placePrimitive(tool: ComponentCreateTool, point = centeredPoint(visual)) {
    if (readOnly || visual.mode !== 'composite') return
    const geometry = resolveComponentCreateGeometry(
      tool,
      point,
      point,
      visual.designSize.width,
      visual.designSize.height,
    )
    const result = appendCreatedVectorLayer(visual, tool, geometry)
    if (result.layerId) commitVisual(result.visual, result.layerId)
  }

  function placeText(point = centeredPoint(visual)) {
    if (readOnly || visual.mode !== 'composite') return
    const width = Math.min(120, visual.designSize.width)
    const height = Math.min(36, visual.designSize.height)
    const id = nextTextLayerId(visual.layers)
    const layer: TextVisualLayer = {
      id,
      name: `文本 ${id.replace(/\D+/g, '') || ''}`.trim(),
      kind: 'text',
      parentId: null,
      transform: {
        x: Math.min(
          Math.max(0, point.x - width / 2),
          Math.max(0, visual.designSize.width - width),
        ),
        y: Math.min(
          Math.max(0, point.y - height / 2),
          Math.max(0, visual.designSize.height - height),
        ),
        width,
        height,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      },
      visible: true,
      opacity: 1,
      text: 'Text',
    }
    commitVisual({ ...visual, layers: [...visual.layers, layer] }, id)
  }

  function placeResource(resource: ComponentVisualAssetResource, point?: ComponentDesignPoint) {
    if (readOnly || visual.mode !== 'composite') return
    const result = applyImportedVisualAsset(visual, resource)
    let nextVisual = result.visual

    if (point) {
      nextVisual = {
        ...nextVisual,
        layers: nextVisual.layers.map((layer) => {
          if (layer.id !== result.layerId) return layer
          const maxX = Math.max(0, visual.designSize.width - layer.transform.width)
          const maxY = Math.max(0, visual.designSize.height - layer.transform.height)
          return {
            ...layer,
            transform: {
              ...layer.transform,
              x: Math.min(maxX, Math.max(0, point.x - layer.transform.width / 2)),
              y: Math.min(maxY, Math.max(0, point.y - layer.transform.height / 2)),
            },
          } as ComponentVisualLayer
        }),
      }
    }

    commitVisual(nextVisual, result.layerId)
  }

  function placeComponent(component: ComponentLibraryEntry, point = centeredPoint(visual)) {
    if (readOnly || visual.mode !== 'composite') return
    const result = placeComponentVisualCopy(visual, component, point)
    const primaryRootId = result.rootIds[result.rootIds.length - 1] ?? null
    if (!primaryRootId) {
      setMessage('该组件没有可复用的 Composite Visual')
      return
    }
    commitVisual(result.visual, primaryRootId)
    setMessage(`已复制 ${component.definition.title} 的可编辑视觉`)
  }

  useEffect(() => {
    const artboard = document.querySelector<HTMLElement>(
      '.component-editor-shell .component-artboard',
    )
    if (!artboard || readOnly || visual.mode !== 'composite') return

    const hasPalettePayload = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes(PALETTE_DRAG_MIME)

    const handleDragOver = (event: DragEvent) => {
      if (!hasPalettePayload(event)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
      artboard.classList.add('component-palette-drop-active')
    }
    const handleDragLeave = () => {
      artboard.classList.remove('component-palette-drop-active')
    }
    const handleDrop = (event: DragEvent) => {
      const raw = event.dataTransfer?.getData(PALETTE_DRAG_MIME)
      if (!raw) return
      const payload = parseDragPayload(raw)
      if (!payload) return

      event.preventDefault()
      artboard.classList.remove('component-palette-drop-active')
      const rect = artboard.getBoundingClientRect()
      const point = {
        x: Math.min(
          visual.designSize.width,
          Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width) * visual.designSize.width),
        ),
        y: Math.min(
          visual.designSize.height,
          Math.max(0, (event.clientY - rect.top) / Math.max(1, rect.height) * visual.designSize.height),
        ),
      }

      if (payload.kind === 'text') {
        placeText(point)
        return
      }
      if (payload.kind === 'primitive') {
        const item = PALETTE_PRIMITIVES.find(({ tool }) => tool.primitive === payload.primitive)
        if (item) placePrimitive(item.tool, point)
        return
      }
      if (payload.kind === 'component') {
        const component = editableComponents.find((item) => item.id === payload.componentId)
        if (component) placeComponent(component, point)
        return
      }
      const resource = resources.find((item) => item.id === payload.resourceId)
      if (resource) placeResource(resource, point)
    }

    artboard.addEventListener('dragover', handleDragOver)
    artboard.addEventListener('dragleave', handleDragLeave)
    artboard.addEventListener('drop', handleDrop)
    return () => {
      artboard.classList.remove('component-palette-drop-active')
      artboard.removeEventListener('dragover', handleDragOver)
      artboard.removeEventListener('dragleave', handleDragLeave)
      artboard.removeEventListener('drop', handleDrop)
    }
  }, [editableComponents, readOnly, resources, visual])

  async function uploadResources(files: FileList | null) {
    if (!files || files.length === 0 || readOnly || busy) return
    setBusy(true)
    setMessage('')
    try {
      const imported = []
      for (const file of Array.from(files)) {
        imported.push(await importLocalVisualAsset(file))
      }
      const next = await addComponentVisualAssetResources(imported)
      setResources(next)
      setMessage(`已保存 ${imported.length} 个资源 · 共 ${next.length} 个`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '资源上传失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="component-authoring-palette" aria-label="组件创作素材">
      {visual.mode === 'composite' ? (
        <>
          <details className="component-palette-disclosure" open>
            <summary className="component-palette-summary">
              <span>基础图元</span>
              <small>双击居中 · 拖到画布</small>
            </summary>
            <div className="component-palette-disclosure-body">
              <div className="component-palette-grid">
                {PALETTE_PRIMITIVES.map(({ tool, symbol }) => {
                  const active = createTool?.primitive === tool.primitive
                  return (
                    <Button
                      key={tool.primitive}
                      size="small"
                      className={`component-palette-item${active ? ' create-tool-active' : ''}`}
                      disabled={readOnly}
                      draggable={!readOnly}
                      aria-label={tool.label}
                      aria-pressed={active}
                      title={`单击进入绘制；双击居中添加；也可拖到画布任意位置`}
                      onClick={() => selectComponentCreateTool(tool)}
                      onDoubleClick={(event) => {
                        event.preventDefault()
                        placePrimitive(tool)
                      }}
                      onDragStart={(event) => setDragPayload(event, {
                        kind: 'primitive',
                        primitive: tool.primitive,
                      })}
                    >
                      <span className="component-palette-item-symbol" aria-hidden="true">{symbol}</span>
                    </Button>
                  )
                })}
                <Button
                  size="small"
                  className="component-palette-item"
                  disabled={readOnly}
                  draggable={!readOnly}
                  aria-label="文本"
                  title="双击居中添加；也可拖到画布任意位置"
                  onDoubleClick={() => placeText()}
                  onDragStart={(event) => setDragPayload(event, { kind: 'text' })}
                >
                  <span className="component-palette-item-symbol" aria-hidden="true">T</span>
                </Button>
              </div>
            </div>
          </details>

          <details className="component-palette-disclosure" open={editableComponents.length > 0}>
            <summary className="component-palette-summary">
              <span>组件</span>
              <small>{editableComponents.length} 个可复用</small>
            </summary>
            <div className="component-palette-disclosure-body">
              {editableComponents.length > 0 ? (
                <div className="component-palette-component-list">
                  {editableComponents.map((component) => (
                    <Button
                      key={component.id}
                      size="small"
                      className="component-palette-component-item"
                      disabled={readOnly}
                      draggable={!readOnly}
                      title="双击居中复制；也可拖到画布任意位置。复制后是当前组件自身的可编辑视觉。"
                      onDoubleClick={() => placeComponent(component)}
                      onDragStart={(event) => setDragPayload(event, {
                        kind: 'component',
                        componentId: component.id,
                      })}
                    >
                      <span className="component-palette-component-icon" aria-hidden="true">
                        {component.definition.title.slice(0, 1).toUpperCase()}
                      </span>
                      <span>
                        <strong>{component.definition.title}</strong>
                        <small>{component.visual.layers.length} 图层</small>
                      </span>
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="component-palette-empty">保存过的 Composite 组件会显示在这里。</p>
              )}
            </div>
          </details>

          <details className="component-palette-disclosure" open>
            <summary className="component-palette-summary">
              <span>其他资源</span>
              <small>{resources.length} 个</small>
            </summary>
            <div className="component-palette-disclosure-body component-palette-resource-library">
              <Input
                ref={fileInputRef}
                type="file"
                hidden
                multiple
                tabIndex={-1}
                accept={LOCAL_VISUAL_ASSET_ACCEPT}
                disabled={readOnly || busy}
                onChange={(event) => {
                  const files = event.currentTarget.files
                  event.currentTarget.value = ''
                  void uploadResources(files)
                }}
              />
              <Button
                size="small"
                disabled={readOnly || busy}
                onClick={() => fileInputRef.current?.click()}
              >
                {busy ? '处理中…' : '上传 SVG / 图片'}
              </Button>
              {resources.length > 0 ? (
                <div className="component-palette-resource-grid">
                  {resources.map((resource) => (
                    <button
                      key={resource.id}
                      type="button"
                      className="component-palette-resource-item"
                      disabled={readOnly}
                      draggable={!readOnly}
                      title={`${resource.name} · 双击居中添加，或拖到画布`}
                      onDoubleClick={() => placeResource(resource)}
                      onDragStart={(event) => setDragPayload(event, {
                        kind: 'resource',
                        resourceId: resource.id,
                      })}
                    >
                      <img src={resource.assetRef} alt="" draggable={false} />
                      <span>{resource.name}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="component-palette-empty">上传后的资源会持久保存在这里，供后续组件复用。</p>
              )}
            </div>
          </details>

          <p className="component-palette-help">
            {createTool
              ? `绘制${createTool.label}：在画布拖拽或单击，Esc 取消。`
              : '双击素材会放到画布中央；拖动素材可精确放到目标位置。'}
          </p>
          {message && <p className="component-palette-message" role="status">{message}</p>}
        </>
      ) : (
        <div className="component-layer-empty">
          内置组件可查看和预览，不能添加内部图元。
        </div>
      )}
    </section>
  )
}
