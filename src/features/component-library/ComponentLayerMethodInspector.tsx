import { useEffect, useMemo, useRef, useState } from 'react'
import { CollapsibleInspectorGroup } from '../../components/CollapsibleInspectorGroup'
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
import { Button } from '../../ui'
import { ComponentLayerMethodCodeModal, type LayerMethodEditState } from './ComponentLayerMethodCodeModal'
import { CodeIcon, PlayIcon, buildMethodCode } from './component-layer-method-templates'
import './component-layer-methods.css'

type ComponentLayerMethodInspectorProps = {
  layer?: ComponentVisualLayer | null
  visual: ComponentVisualDefinition
  readOnly: boolean
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
  onUpdateLayer,
  onUpdateVisual,
}: ComponentLayerMethodInspectorProps) {
  const [editState, setEditState] = useState<LayerMethodEditState | null>(null)
  const [runResults, setRunResults] = useState<Record<string, LayerMethodRunResult>>({})
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [runningName, setRunningName] = useState<string | null>(null)

  // Live theme state for the code modal's visual preview.
  const [liveCurrentTheme, setLiveCurrentTheme] = useState<string | null>(null)
  const [livePreviewAssetRef, setLivePreviewAssetRef] = useState<string | null>(null)
  const latestDocumentRef = useRef<ManagedSvgDocument | null>(null)

  const svgLayer = layer && layer.kind === 'svg' ? (layer as SvgVisualLayer) : null

  const customMethods = svgLayer?.methods ?? []

  useEffect(() => {
    latestDocumentRef.current = svgLayer?.document ?? null
    setLivePreviewAssetRef(svgLayer?.assetRef ?? null)
  }, [svgLayer?.document, svgLayer?.assetRef])

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

  if (!layer || layer.kind !== 'svg' || !svgLayer) {
    return (
      <div
        className="component-layer-methods-inspector"
        data-portable-action-execution="disabled"
      >
        <div className="component-methods-status-banner" role="status">
          当前图层没有 SVG 函数；图层函数仅对 SVG 图层开放。
        </div>
      </div>
    )
  }

  const selfLayer: SvgVisualLayer = svgLayer

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
      setRunResults((prev) => ({ ...prev, [row.name]: result }))

      if (result.ok) {
        let currentLayer = selfLayer
        for (const op of result.ops) {
          if (op.kind === 'setTheme' && currentLayer.document) {
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
      }
      return result
    } finally {
      setRunningName(null)
    }
  }

  function defaultArgsFor(parameters: SvgLayerMethodDefinition['parameters']): Record<string, unknown> {
    const args: Record<string, unknown> = {}
    for (const parameter of parameters ?? []) {
      if (parameter.defaultValue !== undefined) args[parameter.name] = parameter.defaultValue
      else if (parameter.kind === 'select' && parameter.options?.length) {
        args[parameter.name] = parameter.options[0].value
      }
    }
    return args
  }

  return (
    <div
      className="component-layer-methods-inspector"
      data-layer-method-execution="controlled-sandbox"
    >
      <CollapsibleInspectorGroup
        title="SVG 图层函数"
        defaultOpen={true}
      >
        <div className="component-methods-toolbar">
          <p className="component-inspector-help">
            为 SVG 定义的函数：可新增、<code>&lt;&gt;</code> 编辑源码、<code>▶</code> 在受控沙箱试运行并应用到当前画布。
            函数属于图层私有实现，不会生成为公开 Action/Event。
          </p>
          <Button
            size="small"
            variant="primary"
            disabled={readOnly || customMethods.length >= 16}
            onClick={openCreate}
          >
            + 新增函数
          </Button>
        </div>

        {!hasThemeClasses && customMethods.length === 0 ? (
          <div className="component-methods-empty">
            暂无函数。导入的 SVG 标注 <code>scada-theme-*</code> 语义类名后，会自动提供主题函数；
            也可以直接新增自定义函数。
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
                      title="在受控沙箱试运行并应用到当前画布"
                      onClick={() => void handleRun(row, defaultArgsFor(row.parameters))}
                    >
                      <PlayIcon />
                    </Button>
                  </div>
                </div>
                {(row.description || (row.parameters ?? []).length > 0) && (
                  <div className="component-method-item-desc">
                    {row.description}
                    {(row.parameters ?? []).length > 0 && (
                      <span className="component-method-params-hint">
                        {' '}参数：{(row.parameters ?? [])
                          .map((parameter) => `${parameter.name}: ${parameter.kind}`)
                          .join(', ')}
                      </span>
                    )}
                  </div>
                )}
                {runResults[row.name] && (
                  <div
                    className={`component-method-run-result ${runResults[row.name].ok ? 'is-ok' : 'is-error'}`}
                    role="status"
                  >
                    <div className="component-method-run-summary">
                      {runResults[row.name].ok ? '✓' : '✕'} {runResults[row.name].message}
                      {runResults[row.name].elapsedMs > 0 && ` · ${runResults[row.name].elapsedMs}ms`}
                    </div>
                    {runResults[row.name].ops
                      .filter((op) => op.kind === 'log' || op.kind === 'emit')
                      .map((op, index) => (
                        <div key={index} className="component-method-run-log">
                          {op.kind === 'log'
                            ? `[${op.level}] ${op.message}`
                            : `[emit] ${op.eventName} ${JSON.stringify(op.payload)}`}
                        </div>
                      ))}
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
      </CollapsibleInspectorGroup>

      <ComponentLayerMethodCodeModal
        editState={editState}
        readOnly={readOnly}
        svgLayer={selfLayer}
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
