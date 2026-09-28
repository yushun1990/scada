import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from 'react'
import type {
  ComponentVisualDefinition,
  ComponentVisualLayer,
  GroupVisualLayer,
  ImageVisualLayer,
  SvgVisualLayer,
  TextVisualLayer,
} from '../../component-system/visual'
import type { VisualRule } from '../../component-system/visualRules'
import {
  Button,
  DialogContent,
  DialogDescription,
  DialogRoot,
  DialogTitle,
  Input,
  Pressable,
} from '../../ui'
import {
  EllipseIcon,
  LineIcon,
  RectangleIcon,
  TextIcon,
} from '../../components/toolbar-icons'
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
import {
  listComponentDefinitions,
  saveComponentDefinitionAsync,
  type ComponentLibraryEntry,
} from './storage'
import {
  applyImportedVisualAsset,
  importLocalVisualAsset,
  LOCAL_VISUAL_ASSET_ACCEPT,
} from './visual-asset-import'
import {
  createMultiImageComponent,
  suggestMultiImageComponentTitle,
} from './component-multi-image-create'
import type { ComponentLayerSelectionChange } from './ComponentVisualTreeEditor'

function PolygonIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polygon points="12 3 22 21 2 21" />
    </svg>
  )
}

function ArcIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 21a9 9 0 1 1 9-9" />
    </svg>
  )
}

function ScaleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M6 3v18" />
      <path d="M6 5h8" />
      <path d="M6 9h5" />
      <path d="M6 13h8" />
      <path d="M6 17h5" />
      <path d="M6 21h8" />
    </svg>
  )
}

const PALETTE_PRIMITIVES: ReadonlyArray<{
  tool: ComponentCreateTool
  icon: (props: React.SVGProps<SVGSVGElement>) => React.JSX.Element
}> = [
  {
    tool: {
      kind: 'vector',
      primitive: 'rect',
      label: '矩形',
      defaultWidth: 96,
      defaultHeight: 64,
    },
    icon: RectangleIcon,
  },
  {
    tool: {
      kind: 'vector',
      primitive: 'ellipse',
      label: '圆/椭圆',
      defaultWidth: 72,
      defaultHeight: 72,
    },
    icon: EllipseIcon,
  },
  {
    tool: {
      kind: 'vector',
      primitive: 'polygon',
      label: '多边形',
      defaultWidth: 80,
      defaultHeight: 80,
      initialSides: 3,
    },
    icon: PolygonIcon,
  },
  {
    tool: {
      kind: 'vector',
      primitive: 'arc',
      label: '圆弧/扇形',
      defaultWidth: 80,
      defaultHeight: 80,
      initialAngle: 270,
      initialInnerRadiusRatio: 0,
    },
    icon: ArcIcon,
  },
  {
    tool: {
      kind: 'vector',
      primitive: 'line',
      label: '直线',
      defaultWidth: 120,
      defaultHeight: 8,
    },
    icon: LineIcon,
  },
  {
    tool: {
      kind: 'vector',
      primitive: 'scale',
      label: '刻度标尺',
      defaultWidth: 28,
      defaultHeight: 140,
    },
    icon: ScaleIcon,
  },
]

const PALETTE_DRAG_MIME = 'application/x-scada-component-palette'

type PaletteDragPayload =
  | { kind: 'primitive'; primitive: ComponentCreateTool['primitive']; label?: string }
  | { kind: 'text' }
  | { kind: 'component'; componentId: string }
  | { kind: 'resource'; resourceId: string }

type ComponentAuthoringPaletteProps = {
  visual: ComponentVisualDefinition
  readOnly: boolean
  dropTarget: HTMLElement | null
  onSelectionChange: ComponentLayerSelectionChange
  onChange: (visual: ComponentVisualDefinition) => void
}

function parseDragPayload(value: string): PaletteDragPayload | null {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    if (parsed.kind === 'text') return { kind: 'text' }
    if (
      parsed.kind === 'primitive'
      && (
        parsed.primitive === 'rect' ||
        parsed.primitive === 'ellipse' ||
        parsed.primitive === 'line' ||
        parsed.primitive === 'polygon' ||
        parsed.primitive === 'arc' ||
        parsed.primitive === 'scale'
      )
    ) {
      return {
        kind: 'primitive',
        primitive: parsed.primitive,
        label: typeof parsed.label === 'string' ? parsed.label : undefined,
      }
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

function setDragPayload(event: ReactDragEvent, payload: PaletteDragPayload) {
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

function nextTextLayerName(layers: readonly ComponentVisualLayer[]) {
  const existing = new Set(layers.flatMap((layer) => [layer.id, layer.name]))
  let index = 1
  while (existing.has(`txt_${index}`)) index += 1
  return `txt_${index}`
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
  return structuredClone(layer)
}

function getComponentPreviewAsset(component: ComponentLibraryEntry): string | null {
  if (component.visual.mode !== 'composite') return null
  const imageLayers = component.visual.layers.filter(
    (layer): layer is ImageVisualLayer | SvgVisualLayer =>
      (layer.kind === 'image' || layer.kind === 'svg') && Boolean(layer.assetRef),
  )
  if (imageLayers.length === 0) return null
  const visible = imageLayers.find((layer) => layer.visible)
  return (visible ?? imageLayers[0])?.assetRef ?? null
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

  // 1. Calculate auto-fit scale (keep within 80% of canvas)
  const maxAllowedWidth = Math.max(16, target.designSize.width * 0.8)
  const maxAllowedHeight = Math.max(16, target.designSize.height * 0.8)
  const scale = Math.min(1, maxAllowedWidth / boundsWidth, maxAllowedHeight / boundsHeight)

  const effectiveWidth = Math.max(1, Math.round(boundsWidth * scale))
  const effectiveHeight = Math.max(1, Math.round(boundsHeight * scale))

  // 2. Position: Center at point, clamp within artboard bounds
  const targetX = point.x - effectiveWidth / 2
  const targetY = point.y - effectiveHeight / 2
  const clampX = Math.max(0, Math.min(Math.max(0, target.designSize.width - effectiveWidth), targetX))
  const clampY = Math.max(0, Math.min(Math.max(0, target.designSize.height - effectiveHeight), targetY))

  const usedIds = new Set(target.layers.map((layer) => layer.id))
  const idMap = new Map<string, string>()
  for (const layer of source.visual.layers) {
    idMap.set(layer.id, uniqueImportedLayerId(layer.id, usedIds))
  }

  // 3. Encapsulate into a group
  const groupId = uniqueImportedLayerId('group', usedIds)
  const group: GroupVisualLayer = {
    id: groupId,
    name: source.definition.title,
    kind: 'group',
    parentId: null,
    transform: {
      x: clampX,
      y: clampY,
      width: effectiveWidth,
      height: effectiveHeight,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    },
    visible: true,
    opacity: 1,
  }

  const copiedLayers: ComponentVisualLayer[] = source.visual.layers.map((sourceLayer) => {
    const layer = cloneLayer(sourceLayer)
    const mappedId = idMap.get(sourceLayer.id)!
    const isRoot = sourceLayer.parentId === null
    const mappedParentId = isRoot ? groupId : (idMap.get(sourceLayer.parentId!) ?? groupId)

    return {
      ...layer,
      id: mappedId,
      name: sourceLayer.name,
      parentId: mappedParentId,
      transform: isRoot
        ? {
            ...layer.transform,
            x: Math.round((sourceLayer.transform.x - minX) * scale),
            y: Math.round((sourceLayer.transform.y - minY) * scale),
            width: Math.max(1, Math.round(sourceLayer.transform.width * scale)),
            height: Math.max(1, Math.round(sourceLayer.transform.height * scale)),
          }
        : {
            ...layer.transform,
            x: Math.round(sourceLayer.transform.x * scale),
            y: Math.round(sourceLayer.transform.y * scale),
            width: Math.max(1, Math.round(sourceLayer.transform.width * scale)),
            height: Math.max(1, Math.round(sourceLayer.transform.height * scale)),
          },
    } as ComponentVisualLayer
  })

  // 4. Map Visual Rules
  const usedRuleIds = new Set((target.rules ?? []).map((r) => r.id))
  const copiedRules: VisualRule[] = (source.visual.rules ?? []).map((sourceRule) => {
    const mappedLayerId = idMap.get(sourceRule.layerId)
    if (!mappedLayerId) return null
    let candidate = sourceRule.id
    while (usedRuleIds.has(candidate)) {
      candidate = `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
    }
    usedRuleIds.add(candidate)
    return {
      ...structuredClone(sourceRule),
      id: candidate,
      layerId: mappedLayerId,
    }
  }).filter((r): r is VisualRule => r !== null)

  return {
    visual: {
      ...target,
      layers: [...target.layers, group, ...copiedLayers],
      rules: [...(target.rules ?? []), ...copiedRules],
    },
    rootIds: [groupId],
  }
}

function centeredPoint(visual: ComponentVisualDefinition): ComponentDesignPoint {
  return {
    x: visual.designSize.width / 2,
    y: visual.designSize.height / 2,
  }
}

function SearchIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

export function ComponentAuthoringPalette({
  visual,
  readOnly,
  dropTarget,
  onSelectionChange,
  onChange,
}: ComponentAuthoringPaletteProps) {
  const createTool = useComponentCreateTool()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const multiImageInputRef = useRef<HTMLInputElement>(null)
  const componentDetailsRef = useRef<HTMLDetailsElement>(null)
  const resourceDetailsRef = useRef<HTMLDetailsElement>(null)
  const [components, setComponents] = useState<ComponentLibraryEntry[]>([])
  const [resources, setResources] = useState<ComponentVisualAssetResource[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [namingModalOpen, setNamingModalOpen] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [pendingTitle, setPendingTitle] = useState('')
  const [namingError, setNamingError] = useState<string | null>(null)
  const [componentSearch, setComponentSearch] = useState('')
  const [isComponentSearchOpen, setIsComponentSearchOpen] = useState(false)
  const [resourceSearch, setResourceSearch] = useState('')
  const [isResourceSearchOpen, setIsResourceSearchOpen] = useState(false)

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

  const filteredComponents = useMemo(() => {
    const q = componentSearch.trim().toLowerCase()
    if (!q) return editableComponents
    return editableComponents.filter((component) =>
      component.definition.title.toLowerCase().includes(q),
    )
  }, [editableComponents, componentSearch])

  const filteredResources = useMemo(() => {
    const q = resourceSearch.trim().toLowerCase()
    if (!q) return resources
    return resources.filter((resource) =>
      resource.name.toLowerCase().includes(q),
    )
  }, [resources, resourceSearch])

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
    const name = nextTextLayerName(visual.layers)
    const layer: TextVisualLayer = {
      id: name,
      name,
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
    commitVisual({ ...visual, layers: [...visual.layers, layer] }, name)
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
    const artboard = dropTarget
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
        const item = PALETTE_PRIMITIVES.find(({ tool }) =>
          payload.label ? tool.label === payload.label : tool.primitive === payload.primitive,
        )
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
  }, [dropTarget, editableComponents, readOnly, resources, visual])

  async function uploadResources(files: readonly File[]) {
    if (files.length === 0 || readOnly || busy) return
    setBusy(true)
    setMessage('')
    try {
      const imported = []
      for (const file of files) {
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

  async function createMultiImageComponentFromFiles(files: readonly File[], title?: string) {
    if (files.length < 2 || readOnly || busy) return
    setBusy(true)
    setMessage('')
    try {
      const assets = []
      for (const file of files) {
        assets.push(await importLocalVisualAsset(file))
      }

      const result = createMultiImageComponent(assets, { title })
      await saveComponentDefinitionAsync(result.component)

      const nextComponents = await listComponentDefinitions()
      setComponents(nextComponents)

      const warning = result.sizeDeviationWarning
        ? ` · ${result.sizeDeviationWarning}`
        : ''
      setMessage(`已创建组件“${result.component.definition.title}”（${assets.length} 张图片）${warning}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '多图组件创建失败')
    } finally {
      setBusy(false)
    }
  }

  function handleConfirmCreateMultiImage() {
    const trimmed = pendingTitle.trim()
    if (!trimmed) {
      setNamingError('组件名称不能为空')
      return
    }
    setNamingModalOpen(false)
    void createMultiImageComponentFromFiles(pendingFiles, trimmed)
  }

  return (
    <section className="component-authoring-palette" aria-label="组件创作素材">
      {visual.mode === 'composite' ? (
        <>
          <details className="component-palette-disclosure" open>
            <summary
              className="component-palette-summary"
              title="双击居中 · 拖到画布"
            >
              <span>基础图元</span>
              <small className="component-palette-summary-count">
                {PALETTE_PRIMITIVES.length + 1} 个
              </small>
            </summary>
            <div className="component-palette-disclosure-body">
              <div className="component-palette-grid">
                {PALETTE_PRIMITIVES.map(({ tool, icon: Icon }) => {
                  const active = createTool?.label === tool.label
                  return (
                    <Button
                      key={tool.label}
                      size="small"
                      className={`component-palette-item${active ? ' create-tool-active' : ''}`}
                      disabled={readOnly}
                      draggable={!readOnly}
                      aria-label={tool.label}
                      aria-pressed={active}
                      title={tool.label}
                      onClick={() => selectComponentCreateTool(tool)}
                      onDoubleClick={(event) => {
                        event.preventDefault()
                        placePrimitive(tool)
                      }}
                      onDragStart={(event) => setDragPayload(event, {
                        kind: 'primitive',
                        primitive: tool.primitive,
                        label: tool.label,
                      })}
                    >
                      <span className="component-palette-item-symbol"><Icon /></span>
                    </Button>
                  )
                })}
                <Button
                  size="small"
                  className="component-palette-item"
                  disabled={readOnly}
                  draggable={!readOnly}
                  aria-label="文本"
                  title="文本"
                  onDoubleClick={() => placeText()}
                  onDragStart={(event) => setDragPayload(event, { kind: 'text' })}
                >
                  <span className="component-palette-item-symbol"><TextIcon /></span>
                </Button>
              </div>
            </div>
          </details>

          <details
            ref={componentDetailsRef}
            className="component-palette-disclosure"
            open={editableComponents.length > 0}
          >
            <summary
              className="component-palette-summary"
              title="双击居中复制，或拖到画布"
            >
              <span>组件</span>
              <small className="component-palette-summary-count">
                {componentSearch
                  ? `${filteredComponents.length}/${editableComponents.length} 个`
                  : `${editableComponents.length} 个`}
              </small>
            </summary>
            <div className="component-palette-disclosure-body">
              <Input
                ref={multiImageInputRef}
                className="component-palette-resource-input"
                type="file"
                hidden
                multiple
                tabIndex={-1}
                accept={LOCAL_VISUAL_ASSET_ACCEPT}
                disabled={readOnly || busy}
                onChange={(event) => {
                  const files = Array.from(event.currentTarget.files ?? [])
                  event.currentTarget.value = ''
                  if (files.length < 2) {
                    setMessage('多图组件至少需要选择 2 张图片')
                    return
                  }
                  const suggested = suggestMultiImageComponentTitle(
                    files.map((f) => f.name),
                    components.map((c) => c.definition.title),
                  )
                  setPendingFiles(files)
                  setPendingTitle(suggested)
                  setNamingError(null)
                  setNamingModalOpen(true)
                }}
              />

              {editableComponents.length > 0 && (
                <div className="component-palette-group-toolbar">
                  {componentSearch && (
                    <span className="component-palette-group-filter-status">
                      匹配到 {filteredComponents.length} 个
                    </span>
                  )}
                  <Button
                    size="small"
                    variant="ghost"
                    className={`component-palette-search-btn${
                      isComponentSearchOpen || componentSearch ? ' is-active' : ''
                    }`}
                    onClick={() => {
                      setIsComponentSearchOpen((prev) => !prev)
                      if (isComponentSearchOpen && componentSearch) {
                        setComponentSearch('')
                      }
                    }}
                    title={isComponentSearchOpen ? '收起搜索' : '搜索组件'}
                    aria-label="搜索组件"
                  >
                    <SearchIcon />
                  </Button>
                </div>
              )}

              {(isComponentSearchOpen || componentSearch) && (
                <div className="component-palette-search-bar">
                  <Input
                    className="component-palette-search-input"
                    value={componentSearch}
                    onChange={(e) => setComponentSearch(e.target.value)}
                    placeholder="搜索组件名称..."
                    autoFocus
                  />
                  {componentSearch && (
                    <Button
                      size="small"
                      variant="ghost"
                      className="component-palette-search-clear"
                      onClick={() => setComponentSearch('')}
                      title="清空搜索"
                    >
                      ✕
                    </Button>
                  )}
                </div>
              )}

              {filteredComponents.length > 0 ? (
                <div className="component-palette-component-grid">
                  {filteredComponents.map((component) => {
                    const previewAsset = getComponentPreviewAsset(component)
                    return (
                      <Pressable
                        key={component.id}
                        className="component-palette-component-card"
                        disabled={readOnly}
                        draggable={!readOnly}
                        title={component.definition.title}
                        onDoubleClick={() => placeComponent(component)}
                        onDragStart={(event) => setDragPayload(event, {
                          kind: 'component',
                          componentId: component.id,
                        })}
                      >
                        <div className="component-palette-component-card-preview">
                          {previewAsset ? (
                            <img
                              src={previewAsset}
                              alt=""
                              draggable={false}
                            />
                          ) : (
                            <span
                              className="component-palette-component-card-fallback"
                              aria-hidden="true"
                            >
                              {component.definition.title.slice(0, 1).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <span
                          className="component-palette-component-card-title"
                          title={component.definition.title}
                        >
                          {component.definition.title}
                        </span>
                      </Pressable>
                    )
                  })}
                </div>
              ) : componentSearch ? (
                <div className="component-palette-search-empty">
                  <span>未找到匹配 “{componentSearch}” 的组件</span>
                  <Button
                    size="small"
                    variant="ghost"
                    onClick={() => setComponentSearch('')}
                  >
                    清空搜索
                  </Button>
                </div>
              ) : (
                <p className="component-palette-empty">保存过的 Composite 组件会显示在这里。</p>
              )}

              <Button
                size="small"
                variant="secondary"
                className="component-palette-bottom-action"
                disabled={readOnly || busy}
                title="添加多图组件"
                onClick={() => {
                  multiImageInputRef.current?.click()
                }}
              >
                {busy ? '处理中…' : '+ 多图组件'}
              </Button>
            </div>
          </details>

          <details
            ref={resourceDetailsRef}
            className="component-palette-disclosure"
            open
          >
            <summary
              className="component-palette-summary"
              title="双击居中添加，或拖到画布"
            >
              <span>其他资源</span>
              <small className="component-palette-summary-count">
                {resourceSearch
                  ? `${filteredResources.length}/${resources.length} 个`
                  : `${resources.length} 个`}
              </small>
            </summary>
            <div className="component-palette-disclosure-body component-palette-resource-library">
              <Input
                ref={fileInputRef}
                className="component-palette-resource-input"
                type="file"
                hidden
                multiple
                tabIndex={-1}
                accept={LOCAL_VISUAL_ASSET_ACCEPT}
                disabled={readOnly || busy}
                onChange={(event) => {
                  const files = Array.from(event.currentTarget.files ?? [])
                  event.currentTarget.value = ''
                  void uploadResources(files)
                }}
              />

              {resources.length > 0 && (
                <div className="component-palette-group-toolbar">
                  {resourceSearch && (
                    <span className="component-palette-group-filter-status">
                      匹配到 {filteredResources.length} 个
                    </span>
                  )}
                  <Button
                    size="small"
                    variant="ghost"
                    className={`component-palette-search-btn${
                      isResourceSearchOpen || resourceSearch ? ' is-active' : ''
                    }`}
                    onClick={() => {
                      setIsResourceSearchOpen((prev) => !prev)
                      if (isResourceSearchOpen && resourceSearch) {
                        setResourceSearch('')
                      }
                    }}
                    title={isResourceSearchOpen ? '收起搜索' : '搜索资源'}
                    aria-label="搜索资源"
                  >
                    <SearchIcon />
                  </Button>
                </div>
              )}

              {(isResourceSearchOpen || resourceSearch) && (
                <div className="component-palette-search-bar">
                  <Input
                    className="component-palette-search-input"
                    value={resourceSearch}
                    onChange={(e) => setResourceSearch(e.target.value)}
                    placeholder="搜索资源名称..."
                    autoFocus
                  />
                  {resourceSearch && (
                    <Button
                      size="small"
                      variant="ghost"
                      className="component-palette-search-clear"
                      onClick={() => setResourceSearch('')}
                      title="清空搜索"
                    >
                      ✕
                    </Button>
                  )}
                </div>
              )}

              {filteredResources.length > 0 ? (
                <div className="component-palette-resource-grid">
                  {filteredResources.map((resource) => (
                    <Pressable
                      key={resource.id}
                      className="component-palette-resource-item"
                      disabled={readOnly}
                      draggable={!readOnly}
                      title={resource.name}
                      onDoubleClick={() => placeResource(resource)}
                      onDragStart={(event) => setDragPayload(event, {
                        kind: 'resource',
                        resourceId: resource.id,
                      })}
                    >
                      <img src={resource.assetRef} alt="" draggable={false} />
                      <span>{resource.name}</span>
                    </Pressable>
                  ))}
                </div>
              ) : resourceSearch ? (
                <div className="component-palette-search-empty">
                  <span>未找到匹配 “{resourceSearch}” 的资源</span>
                  <Button
                    size="small"
                    variant="ghost"
                    onClick={() => setResourceSearch('')}
                  >
                    清空搜索
                  </Button>
                </div>
              ) : (
                <p className="component-palette-empty">上传后的资源会持久保存在这里，供后续组件复用。</p>
              )}

              <Button
                size="small"
                variant="secondary"
                className="component-palette-bottom-action"
                disabled={readOnly || busy}
                title="上传资源"
                onClick={() => {
                  fileInputRef.current?.click()
                }}
              >
                {busy ? '处理中…' : '上传资源'}
              </Button>
            </div>
          </details>

          {createTool && (
            <p className="component-palette-help">
              {`绘制${createTool.label}：在画布拖拽或单击，Esc 取消。`}
            </p>
          )}
          {message && <p className="component-palette-message" role="status">{message}</p>}
        </>
      ) : (
        <div className="component-layer-empty">
          内置组件可查看和预览，不能添加内部图元。
        </div>
      )}

      {/* 创建多图组件命名对话框 */}
      <DialogRoot open={namingModalOpen} onOpenChange={setNamingModalOpen}>
        <DialogContent className="component-palette-dialog-popup">
          <DialogTitle>新建多图组件</DialogTitle>
          <DialogDescription>
            已选择 {pendingFiles.length} 张图片，请输入此组件的名称：
          </DialogDescription>
          <Input
            autoFocus
            value={pendingTitle}
            aria-label="多图组件名称"
            placeholder="组件名称，例如：水泵状态组件"
            onChange={(e) => {
              setPendingTitle(e.target.value)
              if (namingError) setNamingError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleConfirmCreateMultiImage()
              }
            }}
          />
          {namingError && (
            <p className="component-palette-dialog-error">{namingError}</p>
          )}
          <div className="component-palette-dialog-actions">
            <Button
              variant="ghost"
              size="small"
              onClick={() => setNamingModalOpen(false)}
            >
              取消
            </Button>
            <Button
              variant="primary"
              size="small"
              disabled={busy}
              onClick={handleConfirmCreateMultiImage}
            >
              {busy ? '创建中…' : '创建组件'}
            </Button>
          </div>
        </DialogContent>
      </DialogRoot>
    </section>
  )
}
