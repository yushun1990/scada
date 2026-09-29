import { useEffect, useMemo, useRef, useState } from 'react'
import { serializeManagedSvgDataUrl } from '../../component-system/managedSvg'
import type { ManagedSvgDocument } from '../../component-system/managedSvg'
import {
  applyThemeToManagedSvgDocument,
  hasManagedSvgThemeClasses,
  SVG_LAYER_BUILTIN_METHODS,
} from '../../component-system/managedSvgTheme'
import type {
  ComponentVisualDefinition,
  ComponentVisualLayer,
  SvgLayerMethodDefinition,
  SvgVisualLayer,
} from '../../component-system/visual'
import {
  runLayerMethod,
  type LayerMethodRunResult,
} from '../../runtime/controlled-layer-method-engine'
import {
  Button,
  DialogContent,
  DialogDescription,
  DialogRoot,
  DialogTitle,
} from '../../ui'
import { ComponentLayerMethodCodeModal, type LayerMethodEditState } from './ComponentLayerMethodCodeModal'
import { LayerMethodParamControl } from './ComponentLayerMethodParamControl'
import { CodeIcon, PlayIcon, buildMethodCode } from './component-layer-method-templates'
import './component-layer-methods.css'

type ComponentLayerMethodInspectorProps = {
  layer?: ComponentVisualLayer | null
  visual: ComponentVisualDefinition
  readOnly: boolean
  onApplied?: (message: string) => void
  onUpdateLayer: (layer: ComponentVisualLayer) => void
  onUpdateVisual: (visual: ComponentVisualDefinition) => void
}

type MethodRow = {
  key: string
  name: string
  title: string
  description: string
  isBuiltin: boolean
  parameters: SvgLayerMethodDefinition['parameters']
  implementation: string
}

/**
 * The behaviors tab per the issue #209 / PR #198 functional design: SVG layer
 * functions only — listed, authorable (`<>` edit) and runnable (`▶` preview).
 * Execution goes exclusively through the controlled QuickJS sandbox engine;
 * authored source never runs as unrestricted page JavaScript and never
 * becomes a public Action/Event contract.
 */
export function ComponentLayerMethodInspector({
  layer,
  visual,
  readOnly,
  onApplied,
  onUpdateLayer,
  onUpdateVisual,
}: ComponentLayerMethodInspectorProps) {
  const [editState, setEditState] = useState<LayerMethodEditState | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [runningName, setRunningName] = useState<string | null>(null)
  const [paramModalMethod, setParamModalMethod] = useState<MethodRow | null>(null)
  const [paramModalValues, setParamModalValues] = useState<Record<string, unknown>>({})
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    }
  }, [])

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    setToast({ message, type })
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null)
      toastTimeoutRef.current = null
    }, 3000)
    onApplied?.(message)
  }

  // Live theme state for the code modal's visual preview.
  const [liveCurrentTheme, setLiveCurrentTheme] = useState<string | null>(null)
  const [livePreviewAssetRef, setLivePreviewAssetRef] = useState<string | null>(null)
  const latestDocumentRef = useRef<ManagedSvgDocument | null>(null)

  const svgLayer = layer && layer.kind === 'svg' ? (layer as SvgVisualLayer) : null

  const customMethods = layer?.methods ?? []

  useEffect(() => {
    latestDocumentRef.current = svgLayer?.document ?? null
    setLivePreviewAssetRef(layer && 'assetRef' in layer ? layer.assetRef : null)
  }, [svgLayer?.document, layer])

  const hasThemeClasses = useMemo(() => {
    return svgLayer?.document ? hasManagedSvgThemeClasses(svgLayer.document) : false
  }, [svgLayer?.document])

  const methodRows = useMemo<MethodRow[]>(() => {
    const rows: MethodRow[] = []
    const customByName = new Map(customMethods.map((method) => [method.name, method]))

    if (svgLayer && hasThemeClasses) {
      for (const builtin of SVG_LAYER_BUILTIN_METHODS) {
        const custom = customByName.get(builtin.name)
        rows.push({
          key: `method-${builtin.name}`,
          name: builtin.name,
          title: custom?.title || builtin.title,
          description: custom?.description ?? builtin.description ?? '',
          isBuiltin: !custom,
          parameters: custom?.parameters ?? builtin.parameters,
          implementation: custom?.implementation ?? builtin.implementation,
        })
        customByName.delete(builtin.name)
      }
    }

    for (const method of customByName.values()) {
      rows.push({
        key: `method-${method.name}`,
        name: method.name,
        title: method.title,
        description: method.description ?? '',
        isBuiltin: false,
        parameters: method.parameters ?? [],
        implementation: method.implementation,
      })
    }

    return rows
  }, [customMethods, hasThemeClasses, svgLayer])

  if (!layer) {
    return (
      <div
        className="component-layer-methods-inspector"
        data-portable-action-execution="disabled"
      >
        <div className="component-methods-empty">
          请选择图层以管理函数。
        </div>
      </div>
    )
  }

  const selfLayer: ComponentVisualLayer = layer

  function saveMethods(next: SvgLayerMethodDefinition[]) {
    onUpdateLayer({ ...selfLayer, methods: next })
  }

  function openCreate() {
    const code = buildMethodCode('', '', '', [])
    setEditState({
      originalMethodName: '',
      methodName: '',
      title: '',
      description: '',
      isBuiltin: false,
      isNew: true,
      parameters: [],
      code,
      testParamValues: {},
      initialSnapshot: {
        methodName: '',
        title: '',
        description: '',
        parameters: [],
        code,
      },
    })
  }

  function openEdit(row: MethodRow) {
    setEditState({
      originalMethodName: row.name,
      methodName: row.name,
      title: row.title,
      description: row.description,
      isBuiltin: row.isBuiltin,
      isNew: false,
      parameters: [...(row.parameters ?? [])],
      code: row.implementation,
      testParamValues: {},
      initialSnapshot: {
        methodName: row.name,
        title: row.title,
        description: row.description,
        parameters: [...(row.parameters ?? [])],
        code: row.implementation,
      },
    })
  }

  function handleSaveEdit(state: LayerMethodEditState) {
    const next = customMethods.filter((method) => method.name !== state.originalMethodName)
    next.push({
      name: state.methodName,
      title: state.title,
      description: state.description || undefined,
      parameters: state.parameters,
      implementation: state.code,
    })
    saveMethods(next)
    setEditState(null)
    setStatusMessage(
      state.isBuiltin
        ? `已将内置函数 ${state.methodName} 另存为自定义实现`
        : `函数 ${state.methodName} 已保存（▶ 试运行可用）`,
    )
    setTimeout(() => setStatusMessage(null), 4000)
  }

  async function handleRun(
    row: Pick<MethodRow, 'name' | 'title' | 'description' | 'parameters' | 'implementation'>,
    args: Record<string, unknown>,
  ): Promise<LayerMethodRunResult | null> {
    if (runningName) return null
    setRunningName(row.name)
    try {
      const otherLayers = visual.layers.filter((candidate) => candidate.id !== selfLayer.id)
      const result = await runLayerMethod({
        method: {
          name: row.name,
          implementation: row.implementation,
          parameters: row.parameters ?? [],
        },
        args,
        layers: [
          { id: selfLayer.id, name: selfLayer.name, kind: selfLayer.kind, visible: selfLayer.visible !== false },
          ...otherLayers.map((candidate) => ({
            id: candidate.id,
            name: candidate.name,
            kind: candidate.kind,
            visible: candidate.visible !== false,
          })),
        ],
      })
      if (result.ok) {
        let currentLayer = selfLayer
        for (const op of result.ops) {
          if (op.kind === 'setTheme' && currentLayer.kind === 'svg' && currentLayer.document) {
            const nextDoc = applyThemeToManagedSvgDocument(currentLayer.document, op.state)
            const nextAssetRef = serializeManagedSvgDataUrl(nextDoc)
            currentLayer = { ...currentLayer, document: nextDoc, assetRef: nextAssetRef }
            latestDocumentRef.current = nextDoc
            setLiveCurrentTheme(op.state)
            setLivePreviewAssetRef(nextAssetRef)
          }
        }
        const themeApplied = result.ops.some((op) => op.kind === 'setTheme')
        const visibilityOps = result.ops.filter((op) => op.kind === 'setLayerVisible')

        if (themeApplied || visibilityOps.some((op) => op.layerId === selfLayer.id)) {
          for (const op of visibilityOps) {
            if (op.layerId === currentLayer.id) {
              currentLayer = { ...currentLayer, visible: op.visible }
            }
          }
          onUpdateLayer(currentLayer)
        }

        const otherVisibility = visibilityOps.filter((op) => op.layerId !== selfLayer.id)
        if (otherVisibility.length > 0) {
          const visibilityById = new Map(otherVisibility.map((op) => [op.layerId, op.visible]))
          onUpdateVisual({
            ...visual,
            layers: visual.layers.map((candidate) => {
              const nextVisible = visibilityById.get(candidate.id)
              return nextVisible === undefined ? candidate : { ...candidate, visible: nextVisible }
            }),
          })
        }

        showToast(`✓ 函数 "${row.title || row.name}" 运行成功`, 'success')
      } else {
        showToast(`✕ 函数 "${row.title || row.name}" 运行失败：${result.message}`, 'error')
      }
      return result
    } finally {
      setRunningName(null)
    }
  }

  function defaultArgsFor(parameters: SvgLayerMethodDefinition['parameters']): Record<string, unknown> {
    const args: Record<string, unknown> = {}
    for (const parameter of parameters ?? []) {
      if (parameter.defaultValue !== undefined) {
        args[parameter.name] = parameter.defaultValue
      } else if (parameter.kind === 'select' && parameter.options?.length) {
        args[parameter.name] = parameter.options[0].value
      } else if (parameter.kind === 'number') {
        args[parameter.name] = 0
      } else if (parameter.kind === 'boolean') {
        args[parameter.name] = false
      } else {
        args[parameter.name] = ''
      }
    }
    return args
  }

  function handleRowRunClick(row: MethodRow) {
    const params = row.parameters ?? []
    if (params.length === 0) {
      void handleRun(row, {})
    } else {
      setParamModalMethod(row)
      setParamModalValues(defaultArgsFor(params))
    }
  }

  return (
    <div
      className="component-layer-methods-inspector"
      data-layer-method-execution="controlled-sandbox"
    >
      <div className="component-methods-header-bar">
        <span className="component-methods-count-hint">
          共 {methodRows.length} 个函数
        </span>
        <Button
          size="small"
          variant="soft"
          className="component-methods-add-button"
          disabled={readOnly || customMethods.length >= 16}
          onClick={openCreate}
        >
          + 新增
        </Button>
      </div>

      {toast && (
        <div
          className={`component-methods-toast component-methods-toast-${toast.type}`}
          role="status"
          aria-live="polite"
        >
          {toast.message}
        </div>
      )}

      {methodRows.length === 0 ? (
        <div className="component-methods-empty">
          {selfLayer.kind === 'svg' ? (
            <>
              暂无函数。导入的 SVG 标注 <code>scada-theme-*</code> 语义类名后，会自动提供主题函数；
              也可以点击右上角“新增”定义函数。
            </>
          ) : (
            <>
              暂无函数。可点击右上角“新增”定义图层函数。
            </>
          )}
        </div>
      ) : (
        <ul className="component-methods-list">
          {methodRows.map((row) => (
            <li key={row.key} className="component-method-item">
              <div className="component-method-item-head">
                <div className="component-method-item-title">
                  <code>{row.name}</code>
                  <span>{row.title}</span>
                  {row.isBuiltin && <span className="component-method-badge">内置</span>}
                </div>
                <div className="component-method-item-actions">
                  <Button
                    size="small"
                    variant="ghost"
                    disabled={readOnly}
                    aria-label={`${row.name} 编辑源码`}
                    title="编辑函数源码"
                    onClick={() => openEdit(row)}
                  >
                    <CodeIcon />
                  </Button>
                  <Button
                    size="small"
                    variant="ghost"
                    disabled={readOnly || runningName !== null}
                    aria-label={`${row.name} 运行预览`}
                    title="运行预览并应用到当前画布"
                    onClick={() => handleRowRunClick(row)}
                  >
                    <PlayIcon />
                  </Button>
                </div>
              </div>
              {row.description && (
                <div className="component-method-item-desc">
                  {row.description}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {statusMessage && (
        <div className="component-methods-status-banner" role="status">
          {statusMessage}
        </div>
      )}

      <DialogRoot
        open={paramModalMethod !== null}
        onOpenChange={(open) => {
          if (!open) setParamModalMethod(null)
        }}
      >
        <DialogContent className="component-method-run-dialog">
          <div className="component-method-dialog-header">
            <DialogTitle className="component-method-run-dialog-title">
              运行参数设置
            </DialogTitle>
            <DialogDescription className="component-method-run-dialog-subtitle">
              函数 <code>{paramModalMethod?.name}</code>（{paramModalMethod?.title}）需要输入参数：
            </DialogDescription>
          </div>

          <div className="component-method-run-fields">
            {(paramModalMethod?.parameters ?? []).map((param) => (
              <div key={param.name} className="component-method-run-field">
                <label className="component-method-run-field-label">
                  <span className="component-method-run-field-title">{param.title || param.name}</span>
                  <code className="component-method-run-field-name">{param.name}</code>
                  <span className="component-method-run-field-kind">({param.kind})</span>
                </label>
                <div className="component-method-run-field-input">
                  <LayerMethodParamControl
                    param={param}
                    value={paramModalValues[param.name]}
                    onChange={(next) => {
                      setParamModalValues((prev) => ({ ...prev, [param.name]: next }))
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="ui-dialog-actions">
            <Button
              variant="ghost"
              size="small"
              onClick={() => setParamModalMethod(null)}
            >
              取消
            </Button>
            <Button
              variant="primary"
              size="small"
              disabled={runningName !== null}
              onClick={async () => {
                const targetMethod = paramModalMethod
                const targetValues = { ...paramModalValues }
                setParamModalMethod(null)
                if (targetMethod) {
                  await handleRun(targetMethod, targetValues)
                }
              }}
            >
              ▶ 运行
            </Button>
          </div>
        </DialogContent>
      </DialogRoot>

      <ComponentLayerMethodCodeModal
        editState={editState}
        readOnly={readOnly}
        layer={selfLayer}
        liveCurrentTheme={liveCurrentTheme}
        livePreviewAssetRef={livePreviewAssetRef}
        onClose={() => setEditState(null)}
        onSave={handleSaveEdit}
        onRunTest={async (state) => {
          const result = await handleRun(
            {
              name: state.methodName,
              title: state.title,
              description: state.description,
              parameters: state.parameters,
              implementation: state.code,
            },
            state.testParamValues,
          )
          return (
            result ?? {
              ok: false,
              message: '已有函数正在运行，请稍后再试',
              elapsedMs: 0,
              ops: [],
            }
          )
        }}
        showStatus={(message) => {
          setStatusMessage(message)
          setTimeout(() => setStatusMessage(null), 3000)
        }}
      />
    </div>
  )
}
