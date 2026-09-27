import { useEffect, useMemo, useRef, useState } from 'react'
import type { SvgLayerMethodParameter } from '../../component-system/visual'
import type { LayerMethodRunResult } from '../../runtime/controlled-layer-method-engine'
import { Button, DialogContent, DialogRoot, DialogTitle, Input, Select, Textarea } from '../../ui'
import {
  buildMethodCode,
  extractFunctionBody,
  formatOptionsToInput,
  METHOD_QUICK_PRESETS,
  PARAM_KIND_OPTIONS,
  parseInputToOptions,
} from './component-layer-method-templates'

export type LayerMethodEditState = {
  originalName: string
  name: string
  title: string
  description: string
  isBuiltin: boolean
  isNew: boolean
  parameters: SvgLayerMethodParameter[]
  code: string
  testParamValues: Record<string, string | number | boolean>
}

type ComponentLayerMethodCodeModalProps = {
  editState: LayerMethodEditState | null
  readOnly: boolean
  onClose: () => void
  onSave: (state: LayerMethodEditState) => void
  onRunTest: (state: LayerMethodEditState) => Promise<LayerMethodRunResult>
}

export function ComponentLayerMethodCodeModal({
  editState,
  readOnly,
  onClose,
  onSave,
  onRunTest,
}: ComponentLayerMethodCodeModalProps) {
  const [current, setCurrent] = useState<LayerMethodEditState | null>(editState)
  const [codeDraft, setCodeDraft] = useState<string>(editState?.code ?? '')
  const [runResult, setRunResult] = useState<LayerMethodRunResult | null>(null)
  const [running, setRunning] = useState(false)
  const codeTextareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setCurrent(editState)
    setCodeDraft(editState?.code ?? '')
    setRunResult(null)
  }, [editState])

  const lineCount = useMemo(() => codeDraft.split('\n').length, [codeDraft])

  if (!current) return null

  const method = current

  function patchState(patch: Partial<LayerMethodEditState>) {
    setCurrent((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  function handleNameChange(rawName: string) {
    const nextName = rawName.replace(/[^a-zA-Z0-9_$]/g, '')
    patchState({ name: nextName })
  }

  function applyPreset(suggestedCode: (name: string) => string) {
    setCodeDraft(suggestedCode(method.name || 'myMethod'))
  }

  function syncParameters(next: SvgLayerMethodParameter[]) {
    const existingBody = extractFunctionBody(codeDraft)
    const nextCode = buildMethodCode(
      method.name,
      method.title,
      method.description,
      next,
      existingBody,
    )
    setCodeDraft(nextCode)
    patchState({ parameters: next })
  }

  async function handleRunTest() {
    if (running) return
    setRunning(true)
    try {
      const result = await onRunTest({ ...method, code: codeDraft })
      setRunResult(result)
    } finally {
      setRunning(false)
    }
  }

  function handleSave() {
    onSave({ ...method, code: codeDraft })
  }

  return (
    <DialogRoot open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="component-layer-method-modal-popup">
        <div className="component-layer-method-modal-header">
          <div>
            <DialogTitle className="component-layer-method-modal-title">
              {current.isNew ? '新增 SVG 图层函数' : `编辑函数 · ${current.originalName}`}
            </DialogTitle>
            <span className="component-layer-method-modal-subtitle">
              受控沙箱执行 · 无 DOM / 网络 / 定时器 · 仅限 $self 结构化操作
            </span>
          </div>
        </div>

        <div className="component-layer-method-modal-body">
          <div className="component-layer-method-form">
            <div className="property-grid">
              <label className="property-field compact">
                <span>函数名</span>
                <Input
                  value={current.name}
                  disabled={readOnly}
                  placeholder="如 setThemeState"
                  onChange={(event) => handleNameChange(event.target.value)}
                />
              </label>
              <label className="property-field compact">
                <span>显示标题</span>
                <Input
                  value={current.title}
                  disabled={readOnly}
                  placeholder="如 设置运行状态"
                  onChange={(event) => patchState({ title: event.target.value })}
                />
              </label>
            </div>
            <label className="property-field compact">
              <span>说明</span>
              <Input
                value={current.description}
                disabled={readOnly}
                placeholder="函数用途说明"
                onChange={(event) => patchState({ description: event.target.value })}
              />
            </label>

            <div className="component-layer-method-params">
              <div className="component-layer-method-params-header">
                <span>参数（{current.parameters.length}）</span>
                <Button
                  size="small"
                  variant="secondary"
                  disabled={readOnly || current.parameters.length >= 8}
                  onClick={() =>
                    syncParameters([
                      ...current.parameters,
                      { name: `arg${current.parameters.length + 1}`, title: '参数', kind: 'string' },
                    ])}
                >
                  + 添加参数
                </Button>
              </div>
              {current.parameters.map((parameter, index) => (
                <div key={index} className="component-layer-method-param-row">
                  <Input
                    value={parameter.name}
                    disabled={readOnly}
                    placeholder="参数名"
                    onChange={(event) => {
                      const next = [...current.parameters]
                      next[index] = { ...parameter, name: event.target.value.replace(/[^a-zA-Z0-9_$]/g, '') }
                      patchState({ parameters: next })
                    }}
                  />
                  <Input
                    value={parameter.title}
                    disabled={readOnly}
                    placeholder="标题"
                    onChange={(event) => {
                      const next = [...current.parameters]
                      next[index] = { ...parameter, title: event.target.value }
                      patchState({ parameters: next })
                    }}
                  />
                  <Select
                    value={parameter.kind}
                    disabled={readOnly}
                    ariaLabel={`${parameter.name || `参数${index + 1}`} 类型`}
                    options={PARAM_KIND_OPTIONS}
                    onValueChange={(kind) => {
                      const next = [...current.parameters]
                      next[index] = {
                        ...parameter,
                        kind: kind as SvgLayerMethodParameter['kind'],
                        options: kind === 'select' ? parameter.options ?? [] : undefined,
                      }
                      patchState({ parameters: next })
                    }}
                  />
                  {parameter.kind === 'select' && (
                    <Input
                      value={formatOptionsToInput(parameter.options)}
                      disabled={readOnly}
                      placeholder="如 running=运行态, alarm=报警态"
                      onChange={(event) => {
                        const next = [...current.parameters]
                        next[index] = {
                          ...parameter,
                          options: parseInputToOptions(event.target.value),
                        }
                        patchState({ parameters: next })
                      }}
                    />
                  )}
                  <Button
                    size="small"
                    variant="ghost"
                    disabled={readOnly}
                    aria-label={`删除参数 ${parameter.name}`}
                    onClick={() => {
                      const next = current.parameters.filter((_, i) => i !== index)
                      syncParameters(next)
                    }}
                  >
                    ✕
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="component-layer-method-code-area">
            <div className="component-layer-method-code-toolbar">
              <span className="component-layer-method-code-title">
                函数源码 · {lineCount} 行
              </span>
              <div className="component-layer-method-presets">
                {METHOD_QUICK_PRESETS.map((preset) => (
                  <Button
                    key={preset.label}
                    size="small"
                    variant="ghost"
                    disabled={readOnly}
                    title={preset.explanation}
                    onClick={() => applyPreset(preset.suggestedCode)}
                  >
                    {preset.icon} {preset.label}
                  </Button>
                ))}
              </div>
            </div>
            <Textarea
              ref={codeTextareaRef}
              rows={18}
              className="component-layer-method-code-input"
              spellCheck={false}
              value={codeDraft}
              disabled={readOnly}
              onChange={(event) => setCodeDraft(event.target.value)}
            />
          </div>

          <div className="component-layer-method-test">
            <div className="component-layer-method-test-header">
              <span>试运行（▶ 在受控沙箱执行并应用到当前画布）</span>
              <Button
                size="small"
                variant="primary"
                disabled={readOnly || running}
                onClick={() => void handleRunTest()}
              >
                {running ? '运行中…' : '▶ 预览 / 试运行'}
              </Button>
            </div>
            {current.parameters.length > 0 && (
              <div className="property-grid">
                {current.parameters.map((parameter) => (
                  <label key={parameter.name} className="property-field compact">
                    <span>{parameter.title || parameter.name}</span>
                    {parameter.kind === 'boolean' ? (
                      <Select
                        value={String(current.testParamValues[parameter.name] ?? 'false')}
                        disabled={readOnly}
                        ariaLabel={`${current.name} ${parameter.name}`}
                        options={[
                          { value: 'false', label: 'false' },
                          { value: 'true', label: 'true' },
                        ]}
                        onValueChange={(value) =>
                          patchState({
                            testParamValues: {
                              ...current.testParamValues,
                              [parameter.name]: value === 'true',
                            },
                          })}
                      />
                    ) : parameter.kind === 'select' ? (
                      <Select
                        value={String(current.testParamValues[parameter.name] ?? parameter.options?.[0]?.value ?? '')}
                        disabled={readOnly}
                        ariaLabel={`${current.name} ${parameter.name}`}
                        options={(parameter.options ?? []).map((option) => ({
                          value: String(option.value),
                          label: option.label,
                        }))}
                        onValueChange={(value) =>
                          patchState({
                            testParamValues: {
                              ...current.testParamValues,
                              [parameter.name]: value,
                            },
                          })}
                      />
                    ) : (
                      <Input
                        value={String(current.testParamValues[parameter.name] ?? '')}
                        disabled={readOnly}
                        placeholder={parameter.kind === 'number' ? '数值' : '文本'}
                        onChange={(event) =>
                          patchState({
                            testParamValues: {
                              ...current.testParamValues,
                              [parameter.name]: event.target.value,
                            },
                          })}
                      />
                    )}
                  </label>
                ))}
              </div>
            )}
            {runResult && (
              <div
                className={`component-layer-method-run-result ${runResult.ok ? 'is-ok' : 'is-error'}`}
                role="status"
              >
                <div className="component-layer-method-run-summary">
                  {runResult.ok ? '✓' : '✕'} {runResult.message}
                  {runResult.elapsedMs > 0 && ` · ${runResult.elapsedMs}ms`}
                </div>
                {runResult.ops.filter((op) => op.kind === 'log').map((op, index) =>
                  op.kind === 'log' ? (
                    <div key={index} className="component-layer-method-run-log">
                      [{op.level}] {op.message}
                    </div>
                  ) : null,
                )}
                {runResult.ops.filter((op) => op.kind === 'emit').map((op, index) =>
                  op.kind === 'emit' ? (
                    <div key={index} className="component-layer-method-run-log">
                      [emit] {op.eventName} {JSON.stringify(op.payload)}
                    </div>
                  ) : null,
                )}
              </div>
            )}
          </div>
        </div>

        <div className="component-layer-method-modal-footer">
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            disabled={readOnly || !current.name.trim() || !current.title.trim() || !codeDraft.trim()}
            onClick={handleSave}
          >
            保存函数
          </Button>
        </div>
      </DialogContent>
    </DialogRoot>
  )
}
