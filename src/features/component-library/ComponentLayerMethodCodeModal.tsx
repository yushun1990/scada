import { useEffect, useMemo, useRef, useState } from 'react'
import { TrashIcon } from '../../components/toolbar-icons'
import { SVG_LAYER_BUILTIN_METHODS } from '../../component-system/managedSvgTheme'
import type { SvgLayerMethodParameter, SvgVisualLayer } from '../../component-system/visual'
import type { LayerMethodRunResult } from '../../runtime/controlled-layer-method-engine'
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
import {
  AI_QUICK_PRESETS,
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

export type LayerMethodEditState = {
  originalMethodName: string
  methodName: string
  title: string
  description: string
  isBuiltin: boolean
  isNew: boolean
  parameters: SvgLayerMethodParameter[]
  code: string
  testParamValues: Record<string, string | number | boolean>
  lastRunResult?: LayerMethodRunResult
  initialSnapshot?: {
    methodName: string
    title: string
    description: string
    parameters: SvgLayerMethodParameter[]
    code: string
  }
}

type ComponentLayerMethodCodeModalProps = {
  editState: LayerMethodEditState | null
  readOnly: boolean
  svgLayer: SvgVisualLayer
  liveCurrentTheme: string | null
  livePreviewAssetRef: string | null
  onClose: () => void
  onSave: (state: LayerMethodEditState) => void
  onRunTest: (state: LayerMethodEditState) => Promise<LayerMethodRunResult>
  showStatus: (message: string) => void
}

/**
 * SVG layer function editor per the PR #198 design: metadata bar, form-driven
 * parameter table, code editor with line numbers and syntax highlight, local
 * code assistant, live visual preview and an in-modal test-run panel. Runs go
 * through the controlled sandbox engine only.
 */
export function ComponentLayerMethodCodeModal({
  editState,
  readOnly,
  svgLayer,
  liveCurrentTheme,
  livePreviewAssetRef,
  onClose,
  onSave,
  onRunTest,
  showStatus,
}: ComponentLayerMethodCodeModalProps) {
  const [current, setCurrent] = useState<LayerMethodEditState | null>(editState)
  const [aiPrompt, setAiPrompt] = useState('')
  const [isAiGenerating, setIsAiGenerating] = useState(false)
  const [aiResult, setAiResult] = useState<{ code: string; explanation: string } | null>(null)
  const [running, setRunning] = useState(false)

  const codeTextareaRef = useRef<HTMLTextAreaElement>(null)
  const highlightPreRef = useRef<HTMLPreElement>(null)
  const lineNumbersRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setCurrent(editState)
    setAiResult(null)
    setAiPrompt('')
  }, [editState])

  const highlightedCodeNodes = useMemo(() => {
    if (!current) return []
    return highlightJsToNodes(current.code)
  }, [current?.code])

  const lineCount = current ? (current.code.match(/\n/g)?.length ?? 0) + 1 : 0

  if (!current) return null

  const method = current

  function syncSignature(patch: Partial<LayerMethodEditState>) {
    setCurrent((prev) => {
      if (!prev) return prev
      const merged = { ...prev, ...patch }
      const existingBody = extractFunctionBody(prev.code)
      return {
        ...merged,
        code: buildMethodCode(
          merged.methodName,
          merged.title,
          merged.description,
          merged.parameters,
          existingBody,
        ),
      }
    })
  }

  function handleMethodNameChange(rawName: string) {
    syncSignature({ methodName: rawName.replace(/[^a-zA-Z0-9_$]/g, '') })
  }

  function handleAddParameter() {
    const currentParams = [...method.parameters]
    let nextIdx = currentParams.length + 1
    let paramName = `param${nextIdx}`
    while (currentParams.some((p) => p.name === paramName)) {
      nextIdx++
      paramName = `param${nextIdx}`
    }

    const newParam: SvgLayerMethodParameter = {
      name: paramName,
      title: `参数${nextIdx}`,
      kind: 'number',
    }
    const nextParams = [...currentParams, newParam]
    syncSignature({
      parameters: nextParams,
      testParamValues: { ...method.testParamValues, [paramName]: 0 },
    })
  }

  function handleUpdateParameter(
    index: number,
    updated: Partial<SvgLayerMethodParameter>,
  ) {
    const currentParams = [...method.parameters]
    const oldParam = currentParams[index]
    if (!oldParam) return

    currentParams[index] = { ...oldParam, ...updated }
    const nextTestValues = { ...method.testParamValues }
    if (updated.name && updated.name !== oldParam.name) {
      nextTestValues[updated.name] =
        nextTestValues[oldParam.name] ?? (updated.kind === 'number' ? 0 : '')
      delete nextTestValues[oldParam.name]
    }
    syncSignature({ parameters: currentParams, testParamValues: nextTestValues })
  }

  function handleRemoveParameter(index: number) {
    const currentParams = [...method.parameters]
    const removed = currentParams.splice(index, 1)[0]
    const nextTestValues = { ...method.testParamValues }
    if (removed) delete nextTestValues[removed.name]
    syncSignature({ parameters: currentParams, testParamValues: nextTestValues })
  }

  function handleResetToInitial() {
    if (!method.initialSnapshot) return
    setCurrent({
      ...method,
      methodName: method.initialSnapshot.methodName,
      title: method.initialSnapshot.title,
      description: method.initialSnapshot.description,
      parameters: method.initialSnapshot.parameters,
      code: method.initialSnapshot.code,
    })
    showStatus('已重置为打开时的代码与形参设置')
  }

  function handleResetDefaultCode() {
    const builtin = SVG_LAYER_BUILTIN_METHODS.find((m) => m.name === method.originalMethodName)
    if (builtin) {
      setCurrent({ ...method, code: builtin.implementation })
      showStatus('已恢复默认出厂实现代码')
    }
  }

  function handleGenerateAiCode(customPrompt?: string) {
    const targetPrompt = (customPrompt ?? aiPrompt).trim()
    if (!targetPrompt) return
    setIsAiGenerating(true)
    setAiPrompt('')
    setTimeout(() => {
      const res = generateAiCode(targetPrompt, method.methodName, method.parameters)
      setCurrent((prev) => (prev ? { ...prev, code: res.code } : null))
      setAiResult(res)
      setIsAiGenerating(false)
      showStatus('✓ 已根据需求直接重构代码')
    }, 450)
  }

  async function handleRunInsideModal() {
    if (running) return
    setRunning(true)
    try {
      const result = await onRunTest(method)
      setCurrent((prev) => (prev ? { ...prev, lastRunResult: result } : null))
    } finally {
      setRunning(false)
    }
  }

  function handleCodeKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Tab') {
      event.preventDefault()
      const target = event.currentTarget
      const start = target.selectionStart
      const end = target.selectionEnd
      const newVal = target.value.substring(0, start) + '  ' + target.value.substring(end)
      setCurrent((prev) => (prev ? { ...prev, code: newVal } : null))
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 2
      }, 0)
    }
  }

  function handleCodeScroll(event: React.UIEvent<HTMLTextAreaElement>) {
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = event.currentTarget.scrollTop
    }
    if (highlightPreRef.current) {
      highlightPreRef.current.scrollTop = event.currentTarget.scrollTop
      highlightPreRef.current.scrollLeft = event.currentTarget.scrollLeft
    }
  }

  const themeMeta = liveCurrentTheme ? THEME_PRESET_META[liveCurrentTheme] : null

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
                {method.isNew ? '新建函数实现' : '函数实现编辑器'}
              </DialogTitle>
              <span className="component-method-dialog-divider">/</span>
              <span className="component-method-dialog-subtitle">
                受控沙箱 · Form 驱动形参 · 左右布局 · 统一控制台
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
            value={method.methodName}
            placeholder="setRunState"
            title="函数标识名 (如 setRunState)"
            aria-label="函数标识名"
            disabled={readOnly}
            onChange={(e) => handleMethodNameChange(e.target.value)}
          />
          <Input
            className="component-method-meta-desc-input"
            value={method.title}
            placeholder="设置运行状态"
            title="函数简介说明 (如 设置运行状态)"
            aria-label="函数简介说明"
            disabled={readOnly}
            onChange={(e) => setCurrent((prev) => (prev ? { ...prev, title: e.target.value } : prev))}
          />
        </div>

        <div className="component-method-editor-preview-split">
          {/* Left Column: parameters + code editor + local assistant */}
          <div className="component-method-code-editor-box">
            <div className="component-method-params-section">
              <div className="component-method-params-header">
                <div className="component-method-params-title-wrap">
                  <span className="component-method-params-title">📋 形参列表 (Form 驱动契约)</span>
                  <span className="component-method-params-count">
                    共 {method.parameters.length} 个自定义入参
                  </span>
                </div>
                {!readOnly && (
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={handleAddParameter}
                    title="向当前函数添加新形参"
                  >
                    + 添加形参
                  </Button>
                )}
              </div>

              {method.parameters.length > 0 ? (
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
                      {method.parameters.map((param, pIdx) => (
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
                                const newKind = val as SvgLayerMethodParameter['kind']
                                const update: Partial<SvgLayerMethodParameter> = { kind: newKind }
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
                  <span>暂无自定义形参。点击右上角「+ 添加形参」可声明业务入参并自动同步代码签名。</span>
                </div>
              )}
            </div>

            {/* Code Editor */}
            <div className="component-method-code-editor">
              <div className="component-method-code-toolbar">
                <span className="component-method-file-name">
                  📄 {method.methodName || 'untitled'}.js
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
                    value={method.code}
                    disabled={readOnly}
                    spellCheck={false}
                    onChange={(e) =>
                      setCurrent((prev) => (prev ? { ...prev, code: e.target.value } : null))
                    }
                    onKeyDown={handleCodeKeyDown}
                    onScroll={handleCodeScroll}
                  />
                </div>
              </div>
            </div>

            {/* Local code assistant */}
            <div className="component-method-ai-pane">
              <div className="component-method-ai-header">
                <span className="component-method-ai-title">✨ 代码助手 (上下文已就绪)</span>
                <span className="component-method-ai-status-badge">
                  ● 本地模板生成
                </span>
              </div>

              <div className="component-method-ai-chips">
                {AI_QUICK_PRESETS.map((preset) => (
                  <Button
                    key={preset.label}
                    variant="ghost"
                    size="small"
                    className="component-method-ai-chip"
                    disabled={readOnly}
                    onClick={() => handleGenerateAiCode(preset.prompt)}
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
                  disabled={isAiGenerating || readOnly}
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
                  disabled={isAiGenerating || !aiPrompt.trim() || readOnly}
                  onClick={() => handleGenerateAiCode()}
                  title="发送提示词 (Ctrl + Enter)，结合当前代码上下文直接修改代码"
                >
                  {isAiGenerating ? '生成中...' : '发送 (Ctrl+↵)'}
                </Button>
              </div>

              {aiResult && (
                <div className="component-method-ai-result-strip">
                  <div className="component-method-ai-result-header">
                    <span className="component-method-ai-result-tag">💡 已直接修改代码</span>
                    <span className="component-method-ai-result-desc" title={aiResult.explanation}>
                      {aiResult.explanation}
                    </span>
                    <Button
                      variant="ghost"
                      size="small"
                      onClick={() => {
                        navigator.clipboard?.writeText(aiResult.code)
                        showStatus('✓ 已复制代码到剪贴板')
                      }}
                    >
                      复制
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: live preview + test panel */}
          <div className="component-method-right-pane">
            <div className="component-method-live-preview-box">
              <div className="component-method-preview-header">
                <span className="component-method-preview-title">🖥️ 实时渲染画面</span>
                {themeMeta ? (
                  <span
                    className="component-method-preview-badge"
                    style={{ color: themeMeta.color, borderColor: themeMeta.color }}
                  >
                    {themeMeta.icon} {themeMeta.label}
                  </span>
                ) : (
                  <span className="component-method-preview-badge">⚙️ 当前图层状态</span>
                )}
              </div>
              <div className="component-method-preview-viewport">
                {livePreviewAssetRef || svgLayer.assetRef ? (
                  <img
                    src={livePreviewAssetRef || svgLayer.assetRef}
                    alt={svgLayer.name}
                    className="component-method-preview-image"
                  />
                ) : (
                  <div className="component-method-preview-empty">
                    <span>暂无图层矢量图形预览</span>
                  </div>
                )}
              </div>
            </div>

            <div className="component-method-test-panel">
              <div className="component-method-test-header">
                <span className="component-method-test-title">⚙️ 试运行参数测试</span>
                <span className="component-method-test-subtitle">Form 形参实时绑定</span>
              </div>

              <div className="component-method-test-fields-body">
                {method.parameters.length > 0 ? (
                  method.parameters.map((param) => {
                    const currentVal = method.testParamValues[param.name]
                    return (
                      <div key={param.name} className="component-method-test-field-item">
                        <span
                          className="component-method-test-field-label"
                          title={`${param.title || param.name} (${param.kind})`}
                        >
                          {param.title || param.name} <code className="component-method-test-field-kind">({param.kind})</code>:
                        </span>
                        <div className="component-method-test-field-control">
                          {param.kind === 'select' ? (
                            <Select
                              value={String(currentVal ?? '')}
                              ariaLabel={param.title || param.name}
                              options={(param.options ?? SVG_THEME_PRESET_OPTIONS).map((opt) => ({
                                value: String(opt.value),
                                label: opt.label,
                              }))}
                              onValueChange={(nextVal) => {
                                setCurrent((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        testParamValues: { ...prev.testParamValues, [param.name]: nextVal },
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
                                setCurrent((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        testParamValues: { ...prev.testParamValues, [param.name]: checked },
                                      }
                                    : null,
                                )
                              }}
                            />
                          ) : (
                            <Input
                              value={String(currentVal ?? '')}
                              aria-label={param.title || param.name}
                              placeholder={param.kind === 'number' ? '0' : '测试值'}
                              onChange={(e) => {
                                setCurrent((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        testParamValues: {
                                          ...prev.testParamValues,
                                          [param.name]:
                                            param.kind === 'number' && e.target.value !== ''
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
                    <span>当前函数无自定义形参，直接以内置 <code>$self</code> 图层驱动上下文执行。</span>
                  </div>
                )}
              </div>

              <div className="component-method-test-status-box">
                {method.lastRunResult ? (
                  <div
                    className={`component-method-test-result-msg ${
                      method.lastRunResult.ok ? 'is-success' : 'is-error'
                    }`}
                  >
                    <span className="component-method-test-result-icon">
                      {method.lastRunResult.ok ? '✓' : '❌'}
                    </span>
                    <span className="component-method-test-result-text">
                      {method.lastRunResult.ok
                        ? `执行成功 (${method.lastRunResult.elapsedMs}ms) · ${method.lastRunResult.message}`
                        : `执行出错: ${method.lastRunResult.message}`}
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
            {method.isBuiltin && (
              <Button
                variant="ghost"
                size="normal"
                disabled={readOnly}
                onClick={handleResetDefaultCode}
                title="恢复此函数的出厂默认实现"
              >
                恢复出厂默认
              </Button>
            )}
          </div>

          <div className="component-method-dialog-actions-right">
            <Button
              variant="secondary"
              size="normal"
              disabled={readOnly}
              onClick={handleResetToInitial}
              title="重置为打开本弹窗时的初始状态"
            >
              重置
            </Button>
            <Button variant="secondary" size="normal" onClick={onClose}>
              取消
            </Button>
            <Button
              variant="secondary"
              size="normal"
              disabled={readOnly || running}
              onClick={() => void handleRunInsideModal()}
              title="执行当前代码以测试运行效果并更新画面"
            >
              {running ? '运行中…' : '▶ 预览 / 试运行'}
            </Button>
            <Button
              variant="primary"
              size="normal"
              disabled={readOnly || !method.methodName.trim() || !method.title.trim() || !method.code.trim()}
              onClick={() => onSave(method)}
            >
              保存方法实现
            </Button>
          </div>
        </div>
      </DialogContent>
    </DialogRoot>
  )
}
