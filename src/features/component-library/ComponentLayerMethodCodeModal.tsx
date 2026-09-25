import { useState, useMemo, useRef, useEffect } from 'react'
import type {
  ComponentActionParameterDefinition,
  ComponentValueKind,
} from '../../component-system/definition'
import { SVG_LAYER_BUILTIN_METHODS } from '../../component-system/managedSvgTheme'
import type {
  ComponentVisualLayer,
  SvgVisualLayer,
} from '../../component-system/visual'
import {
  Button,
  Checkbox,
  DialogContent,
  DialogRoot,
  DialogTitle,
  IconButton,
  Input,
  Select,
  Textarea,
} from '../../ui'
import { TrashIcon } from '../../components/toolbar-icons'
import {
  AI_QUICK_PRESETS,
  type AiQuickPreset,
  buildMethodCode,
  extractFunctionBody,
  formatOptionsToInput,
  generateAiCode,
  highlightJsToNodes,
  PARAM_KIND_OPTIONS,
  parseInputToOptions,
  SVG_THEME_PRESET_OPTIONS,
  THEME_PRESET_META,
} from './component-layer-method-templates'
import type { MethodRunResult } from './component-layer-method-runner'

export type EditingImplementationState = {
  originalMethodName: string
  methodName: string
  title: string
  description: string
  isBuiltin: boolean
  isNew: boolean
  parameters: readonly ComponentActionParameterDefinition[]
  code: string
  testParamValues: Record<string, string | number | boolean>
  lastRunResult?: MethodRunResult
  initialSnapshot?: {
    methodName: string
    title: string
    description: string
    parameters: readonly ComponentActionParameterDefinition[]
    code: string
  }
}

type ComponentLayerMethodCodeModalProps = {
  editingImplementation: EditingImplementationState | null
  readOnly: boolean
  layer?: ComponentVisualLayer | null
  svgLayer?: SvgVisualLayer | null
  liveCurrentTheme: string | null
  livePreviewAssetRef: string | null
  onClose: () => void
  onSave: (state: EditingImplementationState) => void
  onRunTest: (state: EditingImplementationState) => MethodRunResult
  showStatus: (msg: string) => void
}

export function ComponentLayerMethodCodeModal({
  editingImplementation,
  readOnly,
  layer,
  svgLayer,
  liveCurrentTheme,
  livePreviewAssetRef,
  onClose,
  onSave,
  onRunTest,
  showStatus,
}: ComponentLayerMethodCodeModalProps) {
  const [currentEdit, setCurrentEdit] = useState<EditingImplementationState | null>(editingImplementation)

  // AI Prompt Assistant state
  const [aiPrompt, setAiPrompt] = useState('')
  const [isAiGenerating, setIsAiGenerating] = useState(false)
  const [aiResult, setAiResult] = useState<{ code: string; explanation: string } | null>(null)

  // Code editor refs for sync scroll
  const codeTextareaRef = useRef<HTMLTextAreaElement>(null)
  const highlightPreRef = useRef<HTMLPreElement>(null)
  const lineNumbersRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setCurrentEdit(editingImplementation)
    setAiResult(null)
    setAiPrompt('')
  }, [editingImplementation])

  const highlightedCodeNodes = useMemo(() => {
    if (!currentEdit) return []
    return highlightJsToNodes(currentEdit.code)
  }, [currentEdit?.code])

  if (!currentEdit) return null

  function handleMethodNameChange(rawName: string) {
    if (!currentEdit) return
    const nextName = rawName.replace(/[^a-zA-Z0-9_$]/g, '')
    const existingBody = extractFunctionBody(currentEdit.code)
    const nextCode = buildMethodCode(
      nextName,
      currentEdit.title,
      currentEdit.description,
      currentEdit.parameters,
      existingBody,
    )
    setCurrentEdit({ ...currentEdit, methodName: nextName, code: nextCode })
  }

  function handleTitleChange(nextTitle: string) {
    if (!currentEdit) return
    const existingBody = extractFunctionBody(currentEdit.code)
    const nextCode = buildMethodCode(
      currentEdit.methodName,
      nextTitle,
      nextTitle,
      currentEdit.parameters,
      existingBody,
    )
    setCurrentEdit({ ...currentEdit, title: nextTitle, description: nextTitle, code: nextCode })
  }

  function handleAddParameter() {
    if (!currentEdit) return
    const currentParams = [...currentEdit.parameters]
    let nextIdx = currentParams.length + 1
    let paramName = `param${nextIdx}`
    while (currentParams.some((p) => p.name === paramName)) {
      nextIdx++
      paramName = `param${nextIdx}`
    }

    const newParam: ComponentActionParameterDefinition = {
      name: paramName,
      title: `参数${nextIdx}`,
      kind: 'number',
    }
    const nextParams = [...currentParams, newParam]
    const existingBody = extractFunctionBody(currentEdit.code)
    const nextCode = buildMethodCode(
      currentEdit.methodName,
      currentEdit.title,
      currentEdit.description,
      nextParams,
      existingBody,
    )

    setCurrentEdit({
      ...currentEdit,
      parameters: nextParams,
      code: nextCode,
      testParamValues: {
        ...currentEdit.testParamValues,
        [paramName]: 0,
      },
    })
  }

  function handleUpdateParameter(
    index: number,
    updated: Partial<ComponentActionParameterDefinition>,
  ) {
    if (!currentEdit) return
    const currentParams = [...currentEdit.parameters]
    const oldParam = currentParams[index]
    if (!oldParam) return

    const newParam: ComponentActionParameterDefinition = {
      ...oldParam,
      ...updated,
    }
    currentParams[index] = newParam

    const existingBody = extractFunctionBody(currentEdit.code)
    const nextCode = buildMethodCode(
      currentEdit.methodName,
      currentEdit.title,
      currentEdit.description,
      currentParams,
      existingBody,
    )

    const nextTestValues = { ...currentEdit.testParamValues }
    if (updated.name && updated.name !== oldParam.name) {
      nextTestValues[updated.name] =
        nextTestValues[oldParam.name] ?? (newParam.kind === 'number' ? 0 : '')
      delete nextTestValues[oldParam.name]
    }

    setCurrentEdit({
      ...currentEdit,
      parameters: currentParams,
      code: nextCode,
      testParamValues: nextTestValues,
    })
  }

  function handleRemoveParameter(index: number) {
    if (!currentEdit) return
    const currentParams = [...currentEdit.parameters]
    const removed = currentParams.splice(index, 1)[0]

    const existingBody = extractFunctionBody(currentEdit.code)
    const nextCode = buildMethodCode(
      currentEdit.methodName,
      currentEdit.title,
      currentEdit.description,
      currentParams,
      existingBody,
    )

    const nextTestValues = { ...currentEdit.testParamValues }
    if (removed) {
      delete nextTestValues[removed.name]
    }

    setCurrentEdit({
      ...currentEdit,
      parameters: currentParams,
      code: nextCode,
      testParamValues: nextTestValues,
    })
  }

  function handleResetToInitial() {
    if (!currentEdit?.initialSnapshot) return
    setCurrentEdit({
      ...currentEdit,
      methodName: currentEdit.initialSnapshot.methodName,
      title: currentEdit.initialSnapshot.title,
      description: currentEdit.initialSnapshot.description,
      parameters: currentEdit.initialSnapshot.parameters,
      code: currentEdit.initialSnapshot.code,
    })
    showStatus('已重置为打开时的代码与形参设置')
  }

  function handleResetDefaultCode() {
    if (!currentEdit) return
    const builtin = SVG_LAYER_BUILTIN_METHODS.find((m) => m.name === currentEdit.originalMethodName)
    if (builtin?.defaultImplementation) {
      setCurrentEdit({ ...currentEdit, code: builtin.defaultImplementation })
      showStatus('已恢复默认出厂实现代码')
    }
  }

  function handleGenerateAiCode(customPrompt?: string) {
    const targetPrompt = (customPrompt ?? aiPrompt).trim()
    if (!currentEdit || !targetPrompt) return
    setIsAiGenerating(true)
    setAiPrompt('')
    setTimeout(() => {
      const res = generateAiCode(
        targetPrompt,
        currentEdit.methodName,
        currentEdit.parameters,
      )
      setCurrentEdit((prev) => (prev ? { ...prev, code: res.code } : null))
      setAiResult(res)
      setIsAiGenerating(false)
      showStatus(`✓ AI 已根据需求直接重构代码`)
    }, 450)
  }

  function handleSelectAiPreset(preset: AiQuickPreset) {
    handleGenerateAiCode(preset.prompt)
  }

  function handleRunInsideModal() {
    if (!currentEdit) return
    const result = onRunTest(currentEdit)
    setCurrentEdit((prev) => (prev ? { ...prev, lastRunResult: result } : null))
  }

  function handleCodeKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Tab') {
      e.preventDefault()
      const target = e.currentTarget
      const start = target.selectionStart
      const end = target.selectionEnd
      const val = target.value
      const newVal = val.substring(0, start) + '  ' + val.substring(end)
      setCurrentEdit((prev) => (prev ? { ...prev, code: newVal } : null))
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 2
      }, 0)
    }
  }

  function handleCodeScroll(e: React.UIEvent<HTMLTextAreaElement>) {
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = e.currentTarget.scrollTop
    }
    if (highlightPreRef.current) {
      highlightPreRef.current.scrollTop = e.currentTarget.scrollTop
      highlightPreRef.current.scrollLeft = e.currentTarget.scrollLeft
    }
  }

  const lineCount = (currentEdit.code.match(/\n/g)?.length ?? 0) + 1

  return (
    <DialogRoot
      open={true}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="component-method-implementation-modal">
        {/* Header */}
        <div className="component-method-dialog-header">
          <div className="component-method-dialog-title-row">
            <div className="component-method-dialog-title-wrap">
              <DialogTitle className="component-method-dialog-title">
                {currentEdit.isNew ? '新建方法实现' : '方法实现编辑器'}
              </DialogTitle>
              <span className="component-method-dialog-divider">/</span>
              <span className="component-method-dialog-subtitle">
                契约优先 · Form 驱动形参声明 · 左右布局 · 统一控制台
              </span>
            </div>
            <Button
              variant="ghost"
              size="small"
              onClick={onClose}
              className="component-method-close-btn"
              title="关闭窗口"
            >
              ✕
            </Button>
          </div>
        </div>

        {/* Metadata Bar */}
        <div className="component-method-metadata-bar">
          <Input
            className="component-method-meta-name-input"
            value={currentEdit.methodName}
            placeholder="setRunState"
            title="方法标识名 (如 setRunState)"
            aria-label="方法标识名"
            disabled={readOnly}
            onChange={(e) => handleMethodNameChange(e.target.value)}
          />
          <Input
            className="component-method-meta-desc-input"
            value={currentEdit.title}
            placeholder="设置运行状态"
            title="方法简介说明 (如 设置运行状态)"
            aria-label="方法简介说明"
            disabled={readOnly}
            onChange={(e) => handleTitleChange(e.target.value)}
          />
        </div>

        {/* Main Split: Left Column (Form + Code + AI), Right Column (Preview + Test) */}
        <div className="component-method-editor-preview-split">
          {/* Left Column: Form Parameters + Code Editor + AI Assistant */}
          <div className="component-method-code-editor-box">
            {/* 1. Form-Driven Parameters Section */}
            <div className="component-method-params-section">
              <div className="component-method-params-header">
                <div className="component-method-params-title-wrap">
                  <span className="component-method-params-title">📋 形参列表 (Form 驱动契约)</span>
                  <span className="component-method-params-count">
                    共 {currentEdit.parameters.length} 个自定义入参
                  </span>
                </div>
                {!readOnly && (
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={handleAddParameter}
                    title="向当前方法添加新形参"
                  >
                    + 添加形参
                  </Button>
                )}
              </div>

              {currentEdit.parameters.length > 0 ? (
                <div className="component-method-params-table-wrap">
                  <table className="component-method-params-table">
                    <thead>
                      <tr>
                        <th style={{ width: '24%' }}>参数名 (Key)</th>
                        <th style={{ width: '28%' }}>中文标题 (Title)</th>
                        <th style={{ width: '22%' }}>类型 (Kind)</th>
                        <th style={{ width: '18%' }}>枚举选项</th>
                        <th style={{ width: '8%', textAlign: 'center' }}>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentEdit.parameters.map((param, pIdx) => (
                        <tr key={param.name + pIdx}>
                          <td>
                            <Input
                              className="component-method-param-cell-input"
                              value={param.name}
                              disabled={readOnly}
                              placeholder="形参变量名"
                              onChange={(e) =>
                                handleUpdateParameter(pIdx, {
                                  name: e.target.value.replace(/[^a-zA-Z0-9_$]/g, ''),
                                })
                              }
                            />
                          </td>
                          <td>
                            <Input
                              className="component-method-param-cell-input"
                              value={param.title || ''}
                              disabled={readOnly}
                              placeholder="中文说明"
                              onChange={(e) =>
                                handleUpdateParameter(pIdx, { title: e.target.value })
                              }
                            />
                          </td>
                          <td>
                            <Select
                              value={param.kind}
                              disabled={readOnly}
                              ariaLabel={`参数 ${param.name} 类型`}
                              options={PARAM_KIND_OPTIONS}
                              onValueChange={(val) => {
                                const newKind = val as ComponentValueKind
                                const update: Partial<ComponentActionParameterDefinition> = { kind: newKind }
                                if (newKind === 'select' && (!param.options || param.options.length === 0)) {
                                  update.options = [
                                    { value: 'running', label: '运行态' },
                                    { value: 'alarm', label: '报警态' },
                                  ]
                                }
                                handleUpdateParameter(pIdx, update)
                              }}
                            />
                          </td>
                          <td>
                            {param.kind === 'select' ? (
                              <Input
                                className="component-method-param-cell-input"
                                value={formatOptionsToInput(param.options)}
                                disabled={readOnly}
                                placeholder="值=标题 (逗号隔开)"
                                title="配置枚举选项，如: running=运行态, alarm=报警态"
                                onChange={(e) =>
                                  handleUpdateParameter(pIdx, {
                                    options: parseInputToOptions(e.target.value),
                                  })
                                }
                              />
                            ) : (
                              <span className="component-method-param-cell-muted">-</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {!readOnly && (
                              <IconButton
                                variant="ghost"
                                size="small"
                                aria-label={`删除形参 ${param.name}`}
                                title="删除此形参"
                                onClick={() => handleRemoveParameter(pIdx)}
                              >
                                <TrashIcon />
                              </IconButton>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="component-method-params-empty">
                  <span>暂无自定义形参（首参约定为内置 <code>$self</code> 图层驱动上下文）。点击右上角「+ 添加形参」可声明业务入参并自动同步代码签名。</span>
                </div>
              )}
            </div>

            {/* 2. Code Editor */}
            <div className="component-method-code-editor">
              <div className="component-method-code-toolbar">
                <span className="component-method-file-name">
                  📄 {currentEdit.methodName}.js
                </span>
                <span className="component-method-file-lang">
                  JavaScript · {lineCount} 行
                </span>
              </div>
              <div className="component-method-code-body">
                <div className="component-method-line-numbers" ref={lineNumbersRef}>
                  {Array.from({ length: lineCount }, (_, i) => (
                    <div key={i + 1} className="component-method-line-number">
                      {i + 1}
                    </div>
                  ))}
                </div>
                <div className="component-method-editor-area">
                  <pre
                    ref={highlightPreRef}
                    className="component-method-code-highlight"
                    aria-hidden="true"
                  >
                    {highlightedCodeNodes}
                  </pre>
                  <Textarea
                    ref={codeTextareaRef}
                    className="component-method-code-textarea"
                    value={currentEdit.code}
                    disabled={readOnly}
                    spellCheck={false}
                    onChange={(e) =>
                      setCurrentEdit((prev) =>
                        prev ? { ...prev, code: e.target.value } : null,
                      )
                    }
                    onKeyDown={handleCodeKeyDown}
                    onScroll={handleCodeScroll}
                  />
                </div>
              </div>
            </div>

            {/* 3. AI Code Assistant */}
            <div className="component-method-ai-pane">
              <div className="component-method-ai-header">
                <span className="component-method-ai-title">✨ 本地 AI 代码助手 (上下文已就绪)</span>
                <span className="component-method-ai-status-badge">
                  ● 本地模型就绪 (Ollama/vLLM)
                </span>
              </div>

              <div className="component-method-ai-chips">
                {AI_QUICK_PRESETS.map((preset) => (
                  <Button
                    key={preset.label}
                    variant="ghost"
                    size="small"
                    className="component-method-ai-chip"
                    onClick={() => handleSelectAiPreset(preset)}
                    title={preset.prompt}
                  >
                    {preset.icon} {preset.label}
                  </Button>
                ))}
              </div>

              <div className="component-method-ai-input-row">
                <Textarea
                  className="component-method-ai-prompt-textarea"
                  placeholder="输入修改提示词（如：当 speed > 80 时切换为 alarm 告警光影并抛出事件，按 Ctrl + Enter 发送）..."
                  value={aiPrompt}
                  disabled={isAiGenerating}
                  rows={2}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                      e.preventDefault()
                      handleGenerateAiCode()
                    }
                  }}
                />
                <Button
                  variant="primary"
                  size="small"
                  className="component-method-ai-send-btn"
                  disabled={isAiGenerating || !aiPrompt.trim()}
                  onClick={() => handleGenerateAiCode()}
                  title="发送提示词 (Ctrl + Enter)，AI 将结合当前代码上下文直接修改代码"
                >
                  {isAiGenerating ? '生成中...' : '发送 (Ctrl+↵)'}
                </Button>
              </div>

              {aiResult && (
                <div className="component-method-ai-result-strip">
                  <div className="component-method-ai-result-header">
                    <span className="component-method-ai-result-tag">💡 AI 已直接修改代码</span>
                    <span className="component-method-ai-result-desc" title={aiResult.explanation}>
                      {aiResult.explanation}
                    </span>
                    <Button
                      variant="ghost"
                      size="small"
                      onClick={() => {
                        navigator.clipboard?.writeText(aiResult.code)
                        showStatus('✓ 已复制 AI 代码到剪贴板')
                      }}
                    >
                      复制
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Live Visual Preview + Test Panel */}
          <div className="component-method-right-pane">
            <div className="component-method-live-preview-box">
              <div className="component-method-preview-header">
                <span className="component-method-preview-title">🖥️ 实时渲染画面</span>
                {(() => {
                  const themeMeta = liveCurrentTheme ? THEME_PRESET_META[liveCurrentTheme] : null
                  if (themeMeta) {
                    return (
                      <span
                        className="component-method-preview-badge"
                        style={{ color: themeMeta.color, borderColor: themeMeta.color }}
                      >
                        {themeMeta.icon} {themeMeta.label}
                      </span>
                    )
                  }
                  return (
                    <span className="component-method-preview-badge">
                      ⚙️ 当前图层状态
                    </span>
                  )
                })()}
              </div>
              <div className="component-method-preview-viewport">
                {livePreviewAssetRef || svgLayer?.assetRef ? (
                  <img
                    src={livePreviewAssetRef || svgLayer?.assetRef || ''}
                    alt={layer?.name || '图层实时画面'}
                    className="component-method-preview-image"
                  />
                ) : (
                  <div className="component-method-preview-empty">
                    <span>暂无图层矢量图形预览</span>
                  </div>
                )}
              </div>
            </div>

            {/* Test Run Parameters & Execution Feedback Panel */}
            <div className="component-method-test-panel">
              <div className="component-method-test-header">
                <span className="component-method-test-title">⚙️ 试运行参数测试</span>
                <span className="component-method-test-subtitle">Form 形参实时绑定</span>
              </div>

              <div className="component-method-test-fields-body">
                {currentEdit.parameters.length > 0 ? (
                  currentEdit.parameters.map((param) => {
                    const currentVal = currentEdit.testParamValues[param.name]
                    return (
                      <div key={param.name} className="component-method-test-field-item">
                        <span
                          className="component-method-test-field-label"
                          title={`${param.title || param.name} (${param.kind})`}
                        >
                          {param.title || param.name} <code className="component-method-test-field-kind">({param.kind})</code>:
                        </span>
                        <div className="component-method-test-field-control">
                          {param.kind === 'select' || (param.options && param.options.length > 0) ? (
                            <Select
                              value={String(currentVal ?? '')}
                              ariaLabel={param.title || param.name}
                              options={(param.options ?? SVG_THEME_PRESET_OPTIONS).map((opt) => ({
                                value: String(opt.value),
                                label: opt.label,
                              }))}
                              onValueChange={(nextVal) => {
                                setCurrentEdit((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        testParamValues: {
                                          ...prev.testParamValues,
                                          [param.name]: nextVal,
                                        },
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
                                setCurrentEdit((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        testParamValues: {
                                          ...prev.testParamValues,
                                          [param.name]: checked,
                                        },
                                      }
                                    : null,
                                )
                              }}
                            />
                          ) : (
                            <Input
                              value={String(currentVal ?? '')}
                              type={param.kind === 'number' ? 'number' : 'text'}
                              placeholder={param.kind === 'number' ? '0' : '测试值'}
                              onChange={(e) => {
                                setCurrentEdit((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        testParamValues: {
                                          ...prev.testParamValues,
                                          [param.name]:
                                            param.kind === 'number'
                                              ? Number(e.target.value)
                                              : e.target.value,
                                        },
                                      }
                                    : null,
                                )
                              }}
                            />
                          )}
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="component-method-test-no-params">
                    <span>当前方法无自定义形参，直接以内置 <code>$self</code> 图层驱动上下文执行。</span>
                  </div>
                )}
              </div>

              {/* Execution Result Feedback */}
              <div className="component-method-test-status-box">
                {currentEdit.lastRunResult ? (
                  <div
                    className={`component-method-test-result-msg ${
                      currentEdit.lastRunResult.ok ? 'is-success' : 'is-error'
                    }`}
                  >
                    <span className="component-method-test-result-icon">
                      {currentEdit.lastRunResult.ok ? '✓' : '❌'}
                    </span>
                    <span className="component-method-test-result-text">
                      {currentEdit.lastRunResult.ok
                        ? `执行成功 (${currentEdit.lastRunResult.elapsedMs}ms) · ${currentEdit.lastRunResult.message}`
                        : `执行出错: ${currentEdit.lastRunResult.message}`}
                    </span>
                  </div>
                ) : (
                  <div className="component-method-test-result-placeholder">
                    <span>点击底栏「预览 / 试运行」执行当前代码并在上方观察画面响应</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Unified Bottom Action Bar */}
        <div className="component-method-dialog-actions">
          <div className="component-method-dialog-actions-left">
            {currentEdit.isBuiltin && (
              <Button
                variant="ghost"
                size="normal"
                onClick={handleResetDefaultCode}
                title="恢复此图层方法的出厂默认实现"
              >
                恢复出厂默认
              </Button>
            )}
          </div>

          <div className="component-method-dialog-actions-right">
            <Button
              variant="secondary"
              size="normal"
              onClick={handleResetToInitial}
              title="重置为打开本弹窗时的初始状态"
            >
              重置
            </Button>
            <Button
              variant="secondary"
              size="normal"
              onClick={onClose}
            >
              取消
            </Button>
            <Button
              variant="secondary"
              size="normal"
              onClick={handleRunInsideModal}
              title="执行当前代码以测试运行效果并更新画面"
            >
              ▶ 预览 / 试运行
            </Button>
            <Button
              variant="primary"
              size="normal"
              disabled={!currentEdit.methodName.trim()}
              onClick={() => onSave(currentEdit)}
            >
              保存方法实现
            </Button>
          </div>
        </div>
      </DialogContent>
    </DialogRoot>
  )
}
