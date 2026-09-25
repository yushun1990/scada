import { useState, useMemo, useRef, useEffect } from 'react'
import { CollapsibleInspectorGroup } from '../../components/CollapsibleInspectorGroup'
import type {
  ComponentActionDefinition,
  ComponentActionParameterDefinition,
  ComponentDefinition,
} from '../../component-system/definition'
import {
  hasManagedSvgThemeClasses,
  SVG_LAYER_BUILTIN_METHODS,
} from '../../component-system/managedSvgTheme'
import type {
  ComponentVisualDefinition,
  ComponentVisualLayer,
  SvgVisualLayer,
} from '../../component-system/visual'
import type { ManagedSvgDocument } from '../../component-system/managedSvg'

import {
  Button,
  Checkbox,
  DialogContent,
  DialogDescription,
  DialogRoot,
  DialogTitle,
  IconButton,
  Input,
  Select,
} from '../../ui'
import { TrashIcon } from '../../components/toolbar-icons'
import {
  CodeIcon,
  getMethodImplementation,
  PlayIcon,
  SVG_THEME_PRESET_OPTIONS,
} from './component-layer-method-templates'
import {
  executeMethodCode,
  type MethodRunResult,
} from './component-layer-method-runner'
import {
  ComponentLayerMethodCodeModal,
  type EditingImplementationState,
} from './ComponentLayerMethodCodeModal'
import './component-layer-methods.css'

type ComponentLayerMethodInspectorProps = {
  layer?: ComponentVisualLayer | null
  definition: ComponentDefinition
  visual: ComponentVisualDefinition
  readOnly: boolean
  onUpdateVisual?: (visual: ComponentVisualDefinition) => void
  onUpdateLayer?: (layer: ComponentVisualLayer) => void
  onUpdateDefinition: (definition: ComponentDefinition) => void
}

type TestingMethodState = {
  name: string
  title: string
  parameters: readonly ComponentActionParameterDefinition[]
  paramValues: Record<string, string | number | boolean>
}

export function ComponentLayerMethodInspector({
  layer,
  definition,
  visual,
  readOnly,
  onUpdateVisual,
  onUpdateLayer,
  onUpdateDefinition,
}: ComponentLayerMethodInspectorProps) {
  const [editingImplementation, setEditingImplementation] = useState<EditingImplementationState | null>(null)
  const [testingMethod, setTestingMethod] = useState<TestingMethodState | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  // Svg Layer specific states for theme live updates
  const svgLayer = layer && layer.kind === 'svg' ? (layer as SvgVisualLayer) : null
  const [liveCurrentTheme, setLiveCurrentTheme] = useState<string | null>(null)
  const [livePreviewAssetRef, setLivePreviewAssetRef] = useState<string | null>(null)
  const latestDocumentRef = useRef<ManagedSvgDocument | null>(svgLayer?.document ?? null)

  useEffect(() => {
    latestDocumentRef.current = svgLayer?.document ?? null
    setLivePreviewAssetRef(svgLayer?.assetRef ?? null)
  }, [svgLayer?.document, svgLayer?.assetRef])

  const hasThemeClasses = useMemo(() => {
    if (!svgLayer?.document) return false
    return hasManagedSvgThemeClasses(svgLayer.document)
  }, [svgLayer?.document])

  // Combine actions from definition and builtin methods
  const allMethods = useMemo(() => {
    const list: Array<{
      key: string
      name: string
      title: string
      description: string
      isBuiltin: boolean
      hasCustomCode: boolean
      parameters: readonly ComponentActionParameterDefinition[]
      implementation?: string
    }> = []

    const customActions = definition.actions || {}

    // 1. Built-in methods for SVG layers
    if (svgLayer && hasThemeClasses) {
      for (const builtin of SVG_LAYER_BUILTIN_METHODS) {
        const custom = customActions[builtin.name]
        const builtinParams: readonly ComponentActionParameterDefinition[] =
          builtin.parameter ? [builtin.parameter as ComponentActionParameterDefinition] : []
        list.push({
          key: `builtin-${builtin.name}`,
          name: builtin.name,
          title: custom?.title || builtin.title,
          description: custom?.description || builtin.description,
          isBuiltin: true,
          hasCustomCode: Boolean(custom?.implementation),
          parameters: custom?.parameters ?? builtinParams,
          implementation: custom?.implementation || builtin.defaultImplementation,
        })
      }
    }

    // 2. Custom actions in definition that are not builtins
    for (const [actionName, actionDef] of Object.entries(customActions)) {
      if (list.some((item) => item.name === actionName)) continue
      list.push({
        key: `custom-${actionName}`,
        name: actionName,
        title: actionDef.title || actionName,
        description: actionDef.description || '',
        isBuiltin: false,
        hasCustomCode: Boolean(actionDef.implementation),
        parameters: actionDef.parameters || [],
        implementation: actionDef.implementation,
      })
    }

    return list
  }, [definition.actions, svgLayer, hasThemeClasses])

  function showStatus(msg: string) {
    setStatusMessage(msg)
    setTimeout(() => {
      setStatusMessage((current) => (current === msg ? null : current))
    }, 4000)
  }

  function runMethodCode(
    methodName: string,
    code: string,
    args: Record<string, unknown>,
    parameterDefs: readonly ComponentActionParameterDefinition[],
  ): MethodRunResult {
    return executeMethodCode(methodName, code, args, parameterDefs, {
      visual,
      definition,
      layer,
      svgLayer,
      getLatestSvgDocument: () => latestDocumentRef.current,
      setLatestSvgDocument: (doc) => {
        latestDocumentRef.current = doc
      },
      onUpdateVisual,
      onUpdateLayer,
      onThemeChanged: (state, assetRef) => {
        setLiveCurrentTheme(state)
        setLivePreviewAssetRef(assetRef)
      },
    })
  }

  function openImplementationEditor(m: {
    name: string
    title: string
    description: string
    isBuiltin: boolean
    parameters: readonly ComponentActionParameterDefinition[]
  }) {
    const rawCode = getMethodImplementation(
      m.name,
      definition,
      m.isBuiltin,
      m.parameters,
      m.title,
      m.description,
    )
    const initialTestVals: Record<string, string | number | boolean> = {}
    for (const p of m.parameters) {
      if (p.kind === 'number') initialTestVals[p.name] = 0
      else if (p.kind === 'boolean') initialTestVals[p.name] = false
      else if (p.kind === 'select' && p.options && p.options.length > 0)
        initialTestVals[p.name] = String(p.options[0].value)
      else initialTestVals[p.name] = ''
    }

    setEditingImplementation({
      originalMethodName: m.name,
      methodName: m.name,
      title: m.title,
      description: m.description,
      isBuiltin: m.isBuiltin,
      isNew: false,
      parameters: m.parameters,
      code: rawCode,
      testParamValues: initialTestVals,
      initialSnapshot: {
        methodName: m.name,
        title: m.title,
        description: m.description,
        parameters: m.parameters,
        code: rawCode,
      },
    })
  }

  function handleAddNewMethod() {
    let baseName = 'customAction'
    let idx = 1
    while (definition.actions?.[`${baseName}${idx}`]) {
      idx++
    }
    const finalMethodName = `${baseName}${idx}`
    const defaultParams: ComponentActionParameterDefinition[] = []
    const defaultCode = getMethodImplementation(
      finalMethodName,
      definition,
      false,
      defaultParams,
      `自定义方法 ${idx}`,
      '组件私有动作执行逻辑',
    )

    setEditingImplementation({
      originalMethodName: '',
      methodName: finalMethodName,
      title: `自定义方法 ${idx}`,
      description: '组件私有动作执行逻辑',
      isBuiltin: false,
      isNew: true,
      parameters: defaultParams,
      code: defaultCode,
      testParamValues: {},
      initialSnapshot: {
        methodName: finalMethodName,
        title: `自定义方法 ${idx}`,
        description: '组件私有动作执行逻辑',
        parameters: defaultParams,
        code: defaultCode,
      },
    })
  }

  function handleCloseEditor() {
    setEditingImplementation(null)
  }

  function handleSaveImplementation(state: EditingImplementationState) {
    const rawName = state.methodName.trim()
    if (!rawName) return

    const detectedNameMatch = state.code.match(/function\s+([a-zA-Z0-9_$]+)/)
    const finalMethodName = detectedNameMatch ? detectedNameMatch[1] : rawName

    const originalName = state.originalMethodName || finalMethodName
    const nextActions = { ...definition.actions }

    if (originalName && originalName !== finalMethodName && nextActions[originalName]) {
      delete nextActions[originalName]
    }

    const existingAction = definition.actions[originalName] || {}
    const finalTitle = state.title.trim() || finalMethodName
    const finalDescription = state.description.trim()

    const nextAction: ComponentActionDefinition = {
      ...existingAction,
      title: finalTitle,
      description: finalDescription,
      parameters: state.parameters,
      implementation: state.code,
    }

    nextActions[finalMethodName] = nextAction
    onUpdateDefinition({
      ...definition,
      actions: nextActions,
    })

    handleCloseEditor()
    showStatus(`✓ 方法 ${finalMethodName} 的代码实现已保存！`)
  }

  function handleRunInsideModal(state: EditingImplementationState) {
    const detectedNameMatch = state.code.match(/function\s+([a-zA-Z0-9_$]+)/)
    const runName = detectedNameMatch ? detectedNameMatch[1] : state.methodName
    const result = runMethodCode(runName, state.code, state.testParamValues, state.parameters)
    showStatus(result.ok ? `✓ ${runName} 执行成功 (${result.elapsedMs}ms)` : `❌ ${runName} 出错: ${result.message}`)
    return result
  }

  function handleRunMethodDirect(item: {
    name: string
    title: string
    parameters: readonly ComponentActionParameterDefinition[]
    isBuiltin: boolean
  }) {
    if (item.parameters.length > 0) {
      const initVals: Record<string, string | number | boolean> = {}
      for (const p of item.parameters) {
        if (p.kind === 'number') initVals[p.name] = 0
        else if (p.kind === 'boolean') initVals[p.name] = false
        else if (p.kind === 'select' && p.options && p.options.length > 0)
          initVals[p.name] = String(p.options[0].value)
        else initVals[p.name] = ''
      }
      setTestingMethod({
        name: item.name,
        title: item.title,
        parameters: item.parameters,
        paramValues: initVals,
      })
      return
    }

    const code = getMethodImplementation(item.name, definition, item.isBuiltin, item.parameters, item.title)
    const res = runMethodCode(item.name, code, {}, item.parameters)
    showStatus(res.ok ? `✓ ${item.name} 执行完成 (${res.elapsedMs}ms)` : `❌ 执行失败: ${res.message}`)
  }

  function handleExecuteExternalTest() {
    if (!testingMethod) return
    const targetName = testingMethod.name
    const isBuiltin = SVG_LAYER_BUILTIN_METHODS.some((b) => b.name === targetName)
    const code = getMethodImplementation(
      targetName,
      definition,
      isBuiltin,
      testingMethod.parameters,
      testingMethod.title,
    )
    const res = runMethodCode(targetName, code, testingMethod.paramValues, testingMethod.parameters)
    setTestingMethod(null)
    showStatus(res.ok ? `✓ ${targetName} 试运行完成 (${res.elapsedMs}ms)` : `❌ 试运行出错: ${res.message}`)
  }

  function handleDeleteMethod(key: string) {
    const rawName = key.replace(/^(builtin|custom)-/, '')
    if (!definition.actions?.[rawName]) return
    const nextActions = { ...definition.actions }
    delete nextActions[rawName]
    onUpdateDefinition({
      ...definition,
      actions: nextActions,
    })
    showStatus(`✓ 已移除方法 ${rawName}`)
  }

  return (
    <div className="component-layer-methods-inspector">
      <CollapsibleInspectorGroup
        title="方法 (Actions)"
        defaultOpen={true}
        className="component-methods-inspector-group"
      >
        <div className="component-methods-header-bar">
          <span className="component-methods-count-hint">
            共 {allMethods.length} 个可用方法
          </span>
          <div className="component-methods-header-actions">
            {!readOnly && (
              <Button
                variant="secondary"
                size="small"
                onClick={handleAddNewMethod}
                title="手动为组件/图层添加新方法并编写实现"
              >
                + 新增
              </Button>
            )}
          </div>
        </div>

        {statusMessage && (
          <div className="component-methods-status-banner" role="status">
            {statusMessage}
          </div>
        )}

        {/* Methods List */}
        <div className="component-methods-list">
          {allMethods.map((m) => {
            const paramStr =
              m.parameters.length > 0
                ? m.parameters.map((p) => p.name).join(', ')
                : ''
            const callSignature = `$self.${m.name}(${paramStr})`
            return (
              <div
                key={m.key}
                className="component-method-card is-interactive"
                onClick={() => openImplementationEditor(m)}
                title="点击在编辑器中查看并编辑实现代码"
              >
                <div className="component-method-main">
                  <span className="component-method-pill">fn</span>
                  <strong className="component-method-name">{m.name}</strong>
                  {paramStr && (
                    <span className="component-method-params">({paramStr})</span>
                  )}
                  {m.isBuiltin && (
                    <span className="component-method-builtin-badge">内置</span>
                  )}
                  {m.hasCustomCode && (
                    <span className="component-method-custom-badge">自定义代码</span>
                  )}
                </div>

                <div className="component-method-desc-row">
                  <span className="component-method-desc">
                    {m.title !== m.name ? `${m.title} · ` : ''}
                    <code>{callSignature}</code>
                  </span>
                </div>

                {/* Card footer action buttons */}
                <div
                  className="component-method-card-actions"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    variant="secondary"
                    size="small"
                    className="component-method-action-btn"
                    title="立即试运行该方法"
                    onClick={() => handleRunMethodDirect(m)}
                  >
                    <PlayIcon className="btn-icon" /> 运行
                  </Button>
                  <Button
                    variant="secondary"
                    size="small"
                    className="component-method-action-btn"
                    title="打开全功能代码编辑器"
                    onClick={() => openImplementationEditor(m)}
                  >
                    <CodeIcon className="btn-icon" /> 代码
                  </Button>
                  {!m.isBuiltin && !readOnly && (
                    <IconButton
                      variant="ghost"
                      size="small"
                      aria-label={`删除方法 ${m.name}`}
                      title="删除此方法定义"
                      onClick={() => handleDeleteMethod(m.key)}
                    >
                      <TrashIcon />
                    </IconButton>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </CollapsibleInspectorGroup>

      {/* Method Implementation Code Editor Modal */}
      {editingImplementation && (
        <ComponentLayerMethodCodeModal
          editingImplementation={editingImplementation}
          readOnly={readOnly}
          layer={layer}
          svgLayer={svgLayer}
          liveCurrentTheme={liveCurrentTheme}
          livePreviewAssetRef={livePreviewAssetRef}
          onClose={handleCloseEditor}
          onSave={handleSaveImplementation}
          onRunTest={handleRunInsideModal}
          showStatus={showStatus}
        />
      )}

      {/* Test Run Parameters Dialog for external list button */}
      <DialogRoot
        open={testingMethod !== null}
        onOpenChange={(open) => {
          if (!open) setTestingMethod(null)
        }}
      >
        <DialogContent className="component-method-test-modal">
          <div className="component-method-dialog-header">
            <DialogTitle>试运行参数测试 · {testingMethod?.name}</DialogTitle>
            <DialogDescription>
              请输入/选择测试常量参数，执行后将运行该方法的具体实现代码：
            </DialogDescription>
          </div>

          {testingMethod && (
            <div className="component-method-test-fields">
              {testingMethod.parameters.map((param) => {
                const currentVal = testingMethod.paramValues[param.name]
                return (
                  <label key={param.name} className="property-field">
                    <span>
                      {param.title || param.name} <code>({param.kind})</code>:
                    </span>
                    {param.kind === 'select' || (param.options && param.options.length > 0) ? (
                      <Select
                        value={String(currentVal ?? '')}
                        ariaLabel={param.title || param.name}
                        options={(param.options ?? SVG_THEME_PRESET_OPTIONS).map((opt) => ({
                          value: String(opt.value),
                          label: opt.label,
                        }))}
                        onValueChange={(nextVal) => {
                          setTestingMethod((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  paramValues: { ...prev.paramValues, [param.name]: nextVal },
                                }
                              : null,
                          )
                        }}
                      />
                    ) : param.kind === 'boolean' ? (
                      <Checkbox
                        checked={Boolean(currentVal)}
                        label={currentVal ? 'true' : 'false'}
                        onCheckedChange={(checked) => {
                          setTestingMethod((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  paramValues: { ...prev.paramValues, [param.name]: checked },
                                }
                              : null,
                          )
                        }}
                      />
                    ) : (
                      <Input
                        value={String(currentVal ?? '')}
                        placeholder="测试常量"
                        onChange={(e) => {
                          setTestingMethod((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  paramValues: { ...prev.paramValues, [param.name]: e.target.value },
                                }
                              : null,
                          )
                        }}
                      />
                    )}
                  </label>
                )
              })}
            </div>
          )}

          <div className="component-method-dialog-actions">
            <Button
              variant="secondary"
              size="normal"
              onClick={() => setTestingMethod(null)}
            >
              取消
            </Button>
            <Button
              variant="primary"
              size="normal"
              onClick={handleExecuteExternalTest}
            >
              ▶ 执行试运行
            </Button>
          </div>
        </DialogContent>
      </DialogRoot>
    </div>
  )
}
