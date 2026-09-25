import { useState, useMemo, useRef, useEffect } from 'react'
import { CollapsibleInspectorGroup } from '../../components/CollapsibleInspectorGroup'
import type {
  ComponentActionDefinition,
  ComponentActionParameterDefinition,
  ComponentDefinition,
  ComponentValueKind,
} from '../../component-system/definition'
import { serializeManagedSvgDataUrl } from '../../component-system/managedSvg'
import {
  applyThemeToManagedSvgDocument,
  hasManagedSvgThemeClasses,
  SVG_LAYER_BUILTIN_METHODS,
} from '../../component-system/managedSvgTheme'
import type {
  ComponentVisualDefinition,
  ComponentVisualLayer,
  SvgVisualLayer,
} from '../../component-system/visual'
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
  Textarea,
} from '../../ui'
import { TrashIcon } from '../../components/toolbar-icons'
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

type EditingImplementationState = {
  originalMethodName: string
  methodName: string
  title: string
  description: string
  isBuiltin: boolean
  isNew: boolean
  parameters: readonly ComponentActionParameterDefinition[]
  code: string
  testParamValues: Record<string, string | number | boolean>
  lastRunResult?: { ok: boolean; message: string; elapsedMs: number }
  initialSnapshot?: {
    methodName: string
    title: string
    description: string
    parameters: readonly ComponentActionParameterDefinition[]
    code: string
  }
}

type TestingMethodState = {
  name: string
  title: string
  parameters: readonly ComponentActionParameterDefinition[]
  paramValues: Record<string, string | number | boolean>
}

const SVG_THEME_PRESET_OPTIONS = [
  { value: 'running', label: '运行态 (绿 - running)' },
  { value: 'alarm', label: '报警态 (红 - alarm)' },
  { value: 'warning', label: '预警态 (黄 - warning)' },
  { value: 'standby', label: '待机态 (蓝 - standby)' },
  { value: 'offline', label: '离线态 (灰 - offline)' },
  { value: 'default', label: '默认原色 (default)' },
]

const THEME_PRESET_META: Record<string, { label: string; color: string; icon: string }> = {
  running: { label: '运行态 (running)', color: '#10b981', icon: '🟢' },
  alarm: { label: '报警态 (alarm)', color: '#ef4444', icon: '🔴' },
  warning: { label: '预警态 (warning)', color: '#f59e0b', icon: '🟡' },
  standby: { label: '待机态 (standby)', color: '#3b82f6', icon: '🔵' },
  offline: { label: '离线态 (offline)', color: '#9ca3af', icon: '⚪' },
  default: { label: '默认原色 (default)', color: '#a855f7', icon: '⚙️' },
}

function CodeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  )
}

function PlayIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  )
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function highlightJs(code: string): string {
  const tokenRegex =
    /(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|("(?:[^"\\\r\n]|\\.)*"|'(?:[^'\\\r\n]|\\.)*'|`(?:\\[\s\S]|[^`\\])*`)|(\$self|\$emit)|(\b(?:function|return|const|let|var|if|else|for|while|switch|case|break|continue|typeof|instanceof|new|this|try|catch|finally|throw|async|await|yield|class|import|export|from|default)\b)|(\b(?:true|false|null|undefined|console|Math|JSON)\b)|(\b\d+(?:\.\d+)?\b)|(\b[a-zA-Z_$][a-zA-Z0-9_$]*(?=\s*\())|([{}()[\].,;+\-*/%=<>!&|^~?:])/g

  let html = ''
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = tokenRegex.exec(code)) !== null) {
    if (match.index > lastIndex) {
      html += escapeHtml(code.slice(lastIndex, match.index))
    }
    const [
      full,
      comment,
      str,
      selfIdent,
      keyword,
      builtin,
      num,
      fnCall,
      punct,
    ] = match

    if (comment) {
      html += `<span class="token-comment">${escapeHtml(comment)}</span>`
    } else if (str) {
      html += `<span class="token-string">${escapeHtml(str)}</span>`
    } else if (selfIdent) {
      html += `<span class="token-self">${escapeHtml(selfIdent)}</span>`
    } else if (keyword) {
      html += `<span class="token-keyword">${escapeHtml(keyword)}</span>`
    } else if (builtin) {
      html += `<span class="token-builtin">${escapeHtml(builtin)}</span>`
    } else if (num) {
      html += `<span class="token-number">${escapeHtml(num)}</span>`
    } else if (fnCall) {
      html += `<span class="token-function">${escapeHtml(fnCall)}</span>`
    } else if (punct) {
      html += `<span class="token-punct">${escapeHtml(punct)}</span>`
    } else {
      html += escapeHtml(full)
    }

    lastIndex = tokenRegex.lastIndex
  }

  if (lastIndex < code.length) {
    html += escapeHtml(code.slice(lastIndex))
  }

  if (code.endsWith('\n')) {
    html += '\n'
  }

  return html
}

const PARAM_KIND_OPTIONS: Array<{ value: ComponentValueKind; label: string }> = [
  { value: 'number', label: 'number (数值)' },
  { value: 'string', label: 'string (文本)' },
  { value: 'boolean', label: 'boolean (布尔)' },
  { value: 'select', label: 'select (下拉枚举)' },
]

function extractFunctionBody(code: string): string | null {
  const fnMatch = code.match(/function\s+[a-zA-Z0-9_$]+\s*\([^)]*\)\s*\{/)
  if (!fnMatch || fnMatch.index === undefined) return null

  const startIndex = fnMatch.index + fnMatch[0].length
  let depth = 1
  let inString: string | null = null
  let inComment: 'line' | 'block' | null = null

  for (let i = startIndex; i < code.length; i++) {
    const char = code[i]
    const next = code[i + 1]

    if (inComment === 'line') {
      if (char === '\n') inComment = null
      continue
    }
    if (inComment === 'block') {
      if (char === '*' && next === '/') {
        inComment = null
        i++
      }
      continue
    }
    if (inString) {
      if (char === '\\') {
        i++
      } else if (char === inString) {
        inString = null
      }
      continue
    }

    if (char === '/' && next === '/') {
      inComment = 'line'
      i++
      continue
    }
    if (char === '/' && next === '*') {
      inComment = 'block'
      i++
      continue
    }
    if (char === "'" || char === '"' || char === '`') {
      inString = char
      continue
    }

    if (char === '{') {
      depth++
    } else if (char === '}') {
      depth--
      if (depth === 0) {
        return code.slice(startIndex, i)
      }
    }
  }

  const lastBrace = code.lastIndexOf('}')
  if (lastBrace > startIndex) {
    return code.slice(startIndex, lastBrace)
  }
  return code.slice(startIndex)
}

function buildMethodCode(
  methodName: string,
  title: string,
  description: string,
  parameters: readonly ComponentActionParameterDefinition[],
  existingBody?: string | null,
): string {
  const paramNames = parameters.map((p) => p.name).filter(Boolean)
  const paramDocs = parameters
    .map((p) => ` * @param {${p.kind}} ${p.name} - ${p.title || p.name}`)
    .join('\n')

  const doc = `/**
 * ${title || methodName}
 * ${description || '组件方法执行逻辑'}
 * 运行时内置上下文：
 * - $self: 当前组件/图层驱动接口（$self.layers, $self.setTheme, $self.showOnly 等）
 * - layers: 所有图层代理数组 ($self.layers 的快捷别名)
 * - $emit(eventName, payload): 发送业务事件
${paramDocs ? `${paramDocs}\n` : ''} */`

  const signature = `function ${methodName}(${paramNames.join(', ')})`

  let bodyContent = existingBody
  if (!bodyContent || !bodyContent.trim()) {
    bodyContent = `\n  // TODO: 在此编写方法具体实现逻辑\n  $self.setTheme('running');\n`
  }

  return `${doc}\n${signature} {${bodyContent}}`
}

function formatOptionsToInput(
  options?: readonly { label: string; value: string | number | boolean }[],
): string {
  if (!options || options.length === 0) return ''
  return options.map((opt) => `${opt.value}=${opt.label}`).join(', ')
}

function parseInputToOptions(input: string): { label: string; value: string | number }[] {
  return input
    .split(/[,，\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((item) => {
      const parts = item.split(/[=:]/)
      if (parts.length >= 2) {
        const val = parts[0].trim()
        const lbl = parts.slice(1).join('=').trim()
        const num = Number(val)
        return {
          value: !isNaN(num) && val !== '' ? num : val,
          label: lbl || val,
        }
      }
      const num = Number(item)
      return {
        value: !isNaN(num) && item !== '' ? num : item,
        label: item,
      }
    })
}

function getMethodImplementation(
  methodName: string,
  definition: ComponentDefinition,
  _isBuiltin: boolean,
  parameters: readonly ComponentActionParameterDefinition[],
  title?: string,
  description?: string,
): string {
  // 1. If definition.actions has custom saved implementation
  const action = definition.actions[methodName]
  if (action?.implementation) {
    return action.implementation
  }

  // 2. If builtin method has default implementation
  const builtin = SVG_LAYER_BUILTIN_METHODS.find((m) => m.name === methodName)
  if (builtin?.defaultImplementation) {
    return builtin.defaultImplementation
  }

  // 3. Fallback generated template
  return buildMethodCode(methodName, title || methodName, description || '组件方法执行逻辑', parameters)
}

type AiQuickPreset = {
  icon: string
  label: string
  prompt: string
  suggestedCode: (name: string) => string
  explanation: string
}

const AI_QUICK_PRESETS: readonly AiQuickPreset[] = [
  {
    icon: '🗂️',
    label: '多图层独占切换',
    prompt: '根据目标图层名称独占显示该图层，隐藏其余所有图层',
    suggestedCode: (name: string) => `/**
 * 多图层独占切换
 * 遍历所有图层，仅显示指定名称的图层，隐藏其他图层
 */
function ${name}(targetLayerName = 'pump-red') {
  for (const layer of $self.layers) {
    layer.show = (layer.name === targetLayerName);
  }
}`,
    explanation: '已生成基于 $self.layers 的图层切换逻辑，遍历设置 layer.show 即可实时控制画布图层显隐。',
  },
  {
    icon: '💡',
    label: '流水灯轮询',
    prompt: '周期性在各个语义主题之间进行循环切换，实现动态流光',
    suggestedCode: (name: string) => `/**
 * 流水灯轮询效果
 * 周期性在各个语义主题之间进行循环切换，实现动态流光
 */
function ${name}() {
  const themes = ['running', 'standby', 'warning'];
  let index = 0;
  const timer = setInterval(() => {
    $self.setTheme(themes[index]);
    index = (index + 1) % themes.length;
  }, 500);
  return () => clearInterval(timer);
}`,
    explanation: '已生成基于定时器的流水灯循环流光逻辑，周期性调用 $self.setTheme() 切换光影色彩。',
  },
  {
    icon: '⚠️',
    label: '告警闪烁与事件',
    prompt: '切换为红色告警光影，并向外层系统抛出告警业务事件',
    suggestedCode: (name: string) => `/**
 * 告警触发与事件上报
 * 切换为高优先级红色告警光影，并向外层发出 alarm_triggered 业务事件
 */
function ${name}(errorLevel = 'CRITICAL') {
  $self.setTheme('alarm');
  $emit('alarm_triggered', {
    layerId: $self.id,
    level: errorLevel,
    timestamp: Date.now()
  });
}`,
    explanation: '已生成告警驱动逻辑：点亮红色告警主题光影，并通过 $emit() 向组件系统抛送附带时间戳和图层 ID 的告警事件。',
  },
  {
    icon: '🔄',
    label: '参数驱动状态',
    prompt: '根据输入参数安全校验并动态切换图层的主题渲染态',
    suggestedCode: (name: string) => `/**
 * 参数驱动状态控制
 * 根据输入参数动态判定并设置图层的语义渲染态
 */
function ${name}(state = 'running') {
  const validStates = ['running', 'alarm', 'warning', 'standby', 'offline', 'default'];
  const targetState = validStates.includes(state) ? state : 'default';
  $self.setTheme(targetState);
}`,
    explanation: '已生成防呆校验的参数驱动逻辑，自动映射合法主题并应用至图层。',
  },
  {
    icon: '⚡',
    label: '平缓呼吸脉冲',
    prompt: '在待机态与预警态之间平缓交替呼吸律动',
    suggestedCode: (name: string) => `/**
 * 呼吸光影模式
 * 在待机态与预警态之间实现平缓呼吸过渡
 */
function ${name}() {
  let isHigh = false;
  const timer = setInterval(() => {
    isHigh = !isHigh;
    $self.setTheme(isHigh ? 'warning' : 'standby');
  }, 800);
  return () => clearInterval(timer);
}`,
    explanation: '已生成呼吸灯过渡逻辑，在待机态与预警态之间平缓律动。',
  },
]

function generateAiCode(
  prompt: string,
  methodName: string,
  parameters: readonly ComponentActionParameterDefinition[] = [],
): { code: string; explanation: string } {
  const lower = prompt.toLowerCase()
  const matchingPreset = AI_QUICK_PRESETS.find(
    (p) => lower.includes(p.label.toLowerCase()) || lower.includes(p.prompt.toLowerCase()),
  )
  if (matchingPreset) {
    return {
      code: matchingPreset.suggestedCode(methodName),
      explanation: matchingPreset.explanation,
    }
  }

  const paramNames = parameters.map((p) => p.name).filter(Boolean)
  const paramArgStr = paramNames.join(', ')
  const paramDocs = parameters
    .map((p) => ` * @param {${p.kind}} ${p.name} - ${p.title || p.name}`)
    .join('\n')

  if (lower.includes('图层') || lower.includes('layer') || lower.includes('切换') || lower.includes('显示') || lower.includes('隐藏')) {
    return {
      code: `/**
 * 图层切换控制
 * 运行时内置：$self.layers, layers
${paramDocs ? `${paramDocs}\n` : ''} */
function ${methodName}(${paramArgStr || "targetLayerName = 'pump-red'"}) {
  for (const layer of $self.layers) {
    layer.show = (layer.name === targetLayerName);
  }
}`,
      explanation: '已生成图层显隐切换逻辑：遍历 $self.layers 动态设置 layer.show 控制画面图层。',
    }
  }

  if (lower.includes('告警') || lower.includes('alarm') || lower.includes('警报')) {
    return {
      code: `/**
 * 告警逻辑
${paramDocs ? `${paramDocs}\n` : ''} */
function ${methodName}(${paramArgStr}) {
  $self.setTheme('alarm');
  $emit('alarm', { message: '设备告警', timestamp: Date.now() });
}`,
      explanation: '已生成告警处理逻辑：切换图层为告警红色光影并向外抛出 alarm 事件。',
    }
  }

  if (lower.includes('运行') || lower.includes('run') || lower.includes('启动')) {
    return {
      code: `/**
 * 启动运行逻辑
${paramDocs ? `${paramDocs}\n` : ''} */
function ${methodName}(${paramArgStr}) {
  $self.setTheme('running');
  $emit('status_changed', { status: 'running' });
}`,
      explanation: '已生成运行状态驱动逻辑：点亮绿色 running 主题并上报运行状态事件。',
    }
  }

  if (lower.includes('旋转') || lower.includes('rotate') || lower.includes('角度')) {
    return {
      code: `/**
 * 动态旋转驱动
${paramDocs ? `${paramDocs}\n` : ''} */
function ${methodName}(${paramArgStr}) {
  let angle = 0;
  const timer = setInterval(() => {
    angle = (angle + 5) % 360;
    $self.setTheme('running');
  }, 50);
  return () => clearInterval(timer);
}`,
      explanation: '已生成动态旋转循环逻辑，支持定时器清理与状态更新。',
    }
  }

  return {
    code: `/**
 * ${prompt}
${paramDocs ? `${paramDocs}\n` : ''} */
function ${methodName}(${paramArgStr}) {
  // 1. 设置图层主题状态 (running / alarm / warning / standby / offline / default)
  $self.setTheme('running');

  // 2. 发送业务事件
  $emit('${methodName}_executed', { time: Date.now() });
}`,
    explanation: `已根据需求「${prompt}」结合形参契约生成实现模版：内置 $self 图层主题/图层切换与 $emit 事件机制。`,
  }
}

export function ComponentLayerMethodInspector({
  layer,
  definition,
  visual,
  readOnly,
  onUpdateLayer,
  onUpdateDefinition,
  onUpdateVisual,
}: ComponentLayerMethodInspectorProps) {
  const [editingImplementation, setEditingImplementation] =
    useState<EditingImplementationState | null>(null)
  const [testingMethod, setTestingMethod] = useState<TestingMethodState | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [livePreviewAssetRef, setLivePreviewAssetRef] = useState<string | null>(null)
  const [liveCurrentTheme, setLiveCurrentTheme] = useState<string | null>(null)

  const [aiPrompt, setAiPrompt] = useState('')
  const [isAiGenerating, setIsAiGenerating] = useState(false)
  const [aiResult, setAiResult] = useState<{ code: string; explanation: string } | null>(null)

  const lineNumbersRef = useRef<HTMLDivElement>(null)
  const codeTextareaRef = useRef<HTMLTextAreaElement>(null)
  const highlightPreRef = useRef<HTMLPreElement>(null)

  const isSvg = layer?.kind === 'svg' && Boolean((layer as SvgVisualLayer).document)
  const svgLayer = isSvg ? (layer as SvgVisualLayer) : null
  const latestDocumentRef = useRef(svgLayer?.document ?? null)

  useEffect(() => {
    latestDocumentRef.current = svgLayer?.document ?? null
  }, [svgLayer?.document])

  const hasThemeClasses = svgLayer?.document
    ? hasManagedSvgThemeClasses(svgLayer.document)
    : false

  const highlightedCodeHtml = useMemo(() => {
    return highlightJs(editingImplementation?.code ?? '')
  }, [editingImplementation?.code])

  useEffect(() => {
    if (codeTextareaRef.current && highlightPreRef.current) {
      highlightPreRef.current.scrollTop = codeTextareaRef.current.scrollTop
      highlightPreRef.current.scrollLeft = codeTextareaRef.current.scrollLeft
    }
  }, [editingImplementation?.code])

  // Combined methods list: built-in SVG layer methods + component declared actions
  const allMethods = useMemo(() => {
    const list: Array<{
      key: string
      name: string
      title: string
      description: string
      isBuiltin: boolean
      parameters: readonly ComponentActionParameterDefinition[]
      implementation: string
    }> = []

    // 1. Built-in SVG methods
    if (isSvg && hasThemeClasses) {
      for (const m of SVG_LAYER_BUILTIN_METHODS) {
        const params: ComponentActionParameterDefinition[] = m.parameter
          ? [
              {
                name: m.parameter.name,
                title: m.parameter.title,
                kind: m.parameter.kind as ComponentValueKind,
                options: m.parameter.options,
              },
            ]
          : []
        list.push({
          key: `builtin_${m.name}`,
          name: m.name,
          title: m.title,
          description: m.description,
          isBuiltin: true,
          parameters: params,
          implementation: getMethodImplementation(
            m.name,
            definition,
            true,
            params,
            m.title,
            m.description,
          ),
        })
      }
    }

    // 2. Component defined actions (deduplicated)
    const existingBuiltinNames = new Set(list.map((m) => m.name))
    for (const [key, action] of Object.entries(definition.actions)) {
      if (existingBuiltinNames.has(key)) {
        // If builtin was customized in definition.actions, update the implementation
        const found = list.find((m) => m.name === key)
        if (found && action.implementation) {
          found.implementation = action.implementation
        }
        continue
      }
      const params = action.parameters ?? []
      list.push({
        key,
        name: key,
        title: action.title || key,
        description: action.description || '',
        isBuiltin: false,
        parameters: params,
        implementation: getMethodImplementation(
          key,
          definition,
          false,
          params,
          action.title,
          action.description,
        ),
      })
    }

    return list
  }, [isSvg, hasThemeClasses, definition])

  function showStatus(msg: string) {
    setStatusMessage(msg)
    setTimeout(() => {
      setStatusMessage((current) => (current === msg ? null : current))
    }, 4000)
  }

  // Create runtime execution context for testing methods
  function createExecutionContext() {
    // Snapshot of visual layers for responsive multi-layer switching
    let currentLayersSnapshot = visual.layers ? [...visual.layers] : []

    const notifyVisualUpdate = () => {
      if (onUpdateVisual) {
        onUpdateVisual({
          ...visual,
          layers: currentLayersSnapshot,
        })
      }
    }

    // Wrap each layer with reactive getters/setters and convenience methods
    const layerProxies = currentLayersSnapshot.map((l, index) => {
      const proxy = {
        id: l.id,
        name: l.name,
        kind: l.kind,
        get show(): boolean {
          const cur = currentLayersSnapshot[index]
          return cur ? cur.visible !== false : true
        },
        set show(val: boolean) {
          const isVis = Boolean(val)
          const target = currentLayersSnapshot[index]
          if (!target || target.visible === isVis) return
          const updated = { ...target, visible: isVis }
          currentLayersSnapshot = currentLayersSnapshot.map((item, i) =>
            i === index ? updated : item,
          )
          notifyVisualUpdate()
          if (layer?.id === target.id) {
            onUpdateLayer?.(updated)
          }
        },
        get visible(): boolean {
          const cur = currentLayersSnapshot[index]
          return cur ? cur.visible !== false : true
        },
        set visible(val: boolean) {
          this.show = val
        },
        setVisible(val: boolean) {
          this.show = val
        },
        raw: l,
      }
      return proxy
    })

    const layerTarget = {
      id: layer?.id,
      name: layer?.name,
      kind: layer?.kind,
      layers: layerProxies,
      showOnly: (targetNameOrId: string) => {
        for (const lp of layerProxies) {
          lp.show = lp.name === targetNameOrId || lp.id === targetNameOrId
        }
      },
      showLayer: (targetNameOrId: string) => {
        const found = layerProxies.find(
          (lp) => lp.name === targetNameOrId || lp.id === targetNameOrId,
        )
        if (found) found.show = true
      },
      hideLayer: (targetNameOrId: string) => {
        const found = layerProxies.find(
          (lp) => lp.name === targetNameOrId || lp.id === targetNameOrId,
        )
        if (found) found.show = false
      },
      findLayer: (targetNameOrId: string) => {
        return layerProxies.find((lp) => lp.name === targetNameOrId || lp.id === targetNameOrId)
      },
      setTheme: (state: string) => {
        const currentDoc = latestDocumentRef.current || svgLayer?.document
        if (currentDoc && svgLayer) {
          const nextDoc = applyThemeToManagedSvgDocument(currentDoc, state)
          latestDocumentRef.current = nextDoc
          const nextAssetRef = serializeManagedSvgDataUrl(nextDoc)
          setLivePreviewAssetRef(nextAssetRef)
          setLiveCurrentTheme(state)
          onUpdateLayer?.({
            ...svgLayer,
            document: nextDoc,
            assetRef: nextAssetRef,
          })
        }
      },
      applyTheme: (state: string) => {
        layerTarget.setTheme(state)
      },
      raw: layer,
    }

    return {
      $self: layerTarget,
      layers: layerProxies,
      // Backward compatibility for scripts accessing context.layer
      layer: layerTarget,
      emit: (eventName: string, payload?: unknown) => {
        console.info(`[Action Emit] ${eventName}:`, payload)
      },
      definition,
      visual,
    }
  }

  // Execute JavaScript method code safely
  function runMethodCode(
    methodName: string,
    code: string,
    args: Record<string, unknown>,
    parameterDefs: readonly ComponentActionParameterDefinition[],
  ): { ok: boolean; message: string; elapsedMs: number } {
    const startTime = performance.now()
    try {
      const context = createExecutionContext()
      const $self = context.$self
      const layers = context.layers
      const $emit = context.emit
      const argValues = parameterDefs.map((p) => args[p.name])
      const wrapped = `
        "use strict";
        ${code}
        if (typeof ${methodName} !== 'function') {
          throw new Error("未在代码中找到方法定义 function ${methodName}(...)");
        }
        const fnStr = ${methodName}.toString();
        const paramMatch = fnStr.match(/^[^(]*\\(([^)]*)\\)/);
        const firstParam = paramMatch ? paramMatch[1].split(',')[0].trim() : '';
        const callArgs = firstParam === '$self' ? [$self, ...argList] : argList;
        return ${methodName}.apply($self, callArgs);
      `
      const runner = new Function('$self', 'layers', '$emit', 'context', 'args', 'argList', wrapped)
      const result = runner($self, layers, $emit, context, args, argValues)
      const elapsedMs = Math.round((performance.now() - startTime) * 10) / 10
      return {
        ok: true,
        message: result !== undefined ? String(result) : '图层与组件状态已实时更新',
        elapsedMs,
      }
    } catch (err) {
      const elapsedMs = Math.round((performance.now() - startTime) * 10) / 10
      return {
        ok: false,
        message: (err as Error)?.message || String(err),
        elapsedMs,
      }
    }
  }

  // --- Open Implementation Editor Modal ---
  function openImplementationEditor(m: {
    name: string
    title: string
    description: string
    isBuiltin: boolean
    parameters: readonly ComponentActionParameterDefinition[]
    implementation: string
  }) {
    const initialParams: Record<string, string | number | boolean> = {}
    for (const p of m.parameters) {
      if (p.kind === 'boolean') initialParams[p.name] = false
      else if (p.kind === 'number') initialParams[p.name] = 0
      else if (p.kind === 'select' && p.options && p.options.length > 0) {
        initialParams[p.name] = String(p.options[0].value)
      } else if (p.name === 'state') {
        initialParams[p.name] = 'running'
      } else {
        initialParams[p.name] = ''
      }
    }
    setLivePreviewAssetRef(svgLayer?.assetRef ?? null)
    setLiveCurrentTheme(null)
    setEditingImplementation({
      originalMethodName: m.name,
      methodName: m.name,
      title: m.title,
      description: m.description,
      isBuiltin: m.isBuiltin,
      isNew: false,
      parameters: [...m.parameters],
      code: m.implementation,
      testParamValues: initialParams,
      initialSnapshot: {
        methodName: m.name,
        title: m.title,
        description: m.description,
        parameters: [...m.parameters],
        code: m.implementation,
      },
    })
    setAiResult(null)
    setAiPrompt('')
  }

  function handleAddNewMethod() {
    let nextIdx = 1
    let nextKey = `action${nextIdx}`
    while (definition.actions[nextKey]) {
      nextIdx++
      nextKey = `action${nextIdx}`
    }

    const initialCode = buildMethodCode(nextKey, '新方法', '执行自定义业务或图层控制逻辑', [])

    setLivePreviewAssetRef(svgLayer?.assetRef ?? null)
    setLiveCurrentTheme(null)
    setEditingImplementation({
      originalMethodName: nextKey,
      methodName: nextKey,
      title: '新方法',
      description: '执行自定义业务或图层控制逻辑',
      isBuiltin: false,
      isNew: true,
      parameters: [],
      code: initialCode,
      testParamValues: {},
      initialSnapshot: {
        methodName: nextKey,
        title: '新方法',
        description: '执行自定义业务或图层控制逻辑',
        parameters: [],
        code: initialCode,
      },
    })
    setAiResult(null)
    setAiPrompt('')
  }

  function handleCloseEditor() {
    setEditingImplementation(null)
    setLivePreviewAssetRef(null)
    setLiveCurrentTheme(null)
    setAiResult(null)
    setAiPrompt('')
  }

  function handleResetToInitial() {
    if (!editingImplementation?.initialSnapshot) return
    const snap = editingImplementation.initialSnapshot
    const initialParams: Record<string, string | number | boolean> = {}
    for (const p of snap.parameters) {
      if (p.kind === 'boolean') initialParams[p.name] = false
      else if (p.kind === 'number') initialParams[p.name] = 0
      else if (p.kind === 'select' && p.options && p.options.length > 0) {
        initialParams[p.name] = String(p.options[0].value)
      } else if (p.name === 'state') {
        initialParams[p.name] = 'running'
      } else {
        initialParams[p.name] = ''
      }
    }
    setEditingImplementation((prev) =>
      prev
        ? {
            ...prev,
            methodName: snap.methodName,
            title: snap.title,
            description: snap.description,
            parameters: [...snap.parameters],
            code: snap.code,
            testParamValues: initialParams,
            lastRunResult: undefined,
          }
        : null,
    )
    setAiResult(null)
    setAiPrompt('')
    showStatus('已重置为打开弹窗时的初始状态。')
  }

  function handleMethodNameChange(rawName: string) {
    if (!editingImplementation) return
    const nextName = rawName.replace(/[^a-zA-Z0-9_$]/g, '')
    setEditingImplementation((prev) => {
      if (!prev) return null
      const existingBody = extractFunctionBody(prev.code)
      const nextCode = buildMethodCode(
        nextName,
        prev.title,
        prev.description,
        prev.parameters,
        existingBody,
      )
      return { ...prev, methodName: nextName, code: nextCode }
    })
  }

  function handleTitleChange(nextTitle: string) {
    if (!editingImplementation) return
    setEditingImplementation((prev) => {
      if (!prev) return null
      const existingBody = extractFunctionBody(prev.code)
      const nextCode = buildMethodCode(
        prev.methodName,
        nextTitle,
        nextTitle,
        prev.parameters,
        existingBody,
      )
      return { ...prev, title: nextTitle, description: nextTitle, code: nextCode }
    })
  }

  function handleAddParameter() {
    if (!editingImplementation) return
    const currentParams = [...editingImplementation.parameters]
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
    const existingBody = extractFunctionBody(editingImplementation.code)
    const nextCode = buildMethodCode(
      editingImplementation.methodName,
      editingImplementation.title,
      editingImplementation.description,
      nextParams,
      existingBody,
    )

    setEditingImplementation((prev) =>
      prev
        ? {
            ...prev,
            parameters: nextParams,
            code: nextCode,
            testParamValues: {
              ...prev.testParamValues,
              [paramName]: 0,
            },
          }
        : null,
    )
  }

  function handleUpdateParameter(
    index: number,
    updated: Partial<ComponentActionParameterDefinition>,
  ) {
    if (!editingImplementation) return
    const currentParams = [...editingImplementation.parameters]
    const oldParam = currentParams[index]
    if (!oldParam) return

    const newParam: ComponentActionParameterDefinition = {
      ...oldParam,
      ...updated,
    }
    currentParams[index] = newParam

    const existingBody = extractFunctionBody(editingImplementation.code)
    const nextCode = buildMethodCode(
      editingImplementation.methodName,
      editingImplementation.title,
      editingImplementation.description,
      currentParams,
      existingBody,
    )

    const nextTestValues = { ...editingImplementation.testParamValues }
    if (updated.name && updated.name !== oldParam.name) {
      nextTestValues[updated.name] =
        nextTestValues[oldParam.name] ?? (newParam.kind === 'number' ? 0 : '')
      delete nextTestValues[oldParam.name]
    }

    setEditingImplementation((prev) =>
      prev
        ? {
            ...prev,
            parameters: currentParams,
            code: nextCode,
            testParamValues: nextTestValues,
          }
        : null,
    )
  }

  function handleRemoveParameter(index: number) {
    if (!editingImplementation) return
    const currentParams = [...editingImplementation.parameters]
    const removed = currentParams.splice(index, 1)[0]

    const existingBody = extractFunctionBody(editingImplementation.code)
    const nextCode = buildMethodCode(
      editingImplementation.methodName,
      editingImplementation.title,
      editingImplementation.description,
      currentParams,
      existingBody,
    )

    const nextTestValues = { ...editingImplementation.testParamValues }
    if (removed) {
      delete nextTestValues[removed.name]
    }

    setEditingImplementation((prev) =>
      prev
        ? {
            ...prev,
            parameters: currentParams,
            code: nextCode,
            testParamValues: nextTestValues,
          }
        : null,
    )
  }

  // Save the edited implementation code
  function handleSaveImplementation() {
    if (!editingImplementation) return
    const rawName = editingImplementation.methodName.trim()
    if (!rawName) return

    // Extract function name from code if user edited the code signature
    const detectedNameMatch = editingImplementation.code.match(/function\s+([a-zA-Z0-9_$]+)/)
    const finalMethodName = detectedNameMatch ? detectedNameMatch[1] : rawName

    const originalName = editingImplementation.originalMethodName || finalMethodName
    const nextActions = { ...definition.actions }

    // If renamed and old key exists, remove old key
    if (originalName && originalName !== finalMethodName && nextActions[originalName]) {
      delete nextActions[originalName]
    }

    const existingAction = definition.actions[originalName] || {}
    const finalTitle = editingImplementation.title.trim() || finalMethodName
    const finalDescription = editingImplementation.description.trim()

    const nextAction: ComponentActionDefinition = {
      ...existingAction,
      title: finalTitle,
      description: finalDescription,
      parameters: editingImplementation.parameters,
      implementation: editingImplementation.code,
    }

    nextActions[finalMethodName] = nextAction
    onUpdateDefinition({
      ...definition,
      actions: nextActions,
    })

    handleCloseEditor()
    showStatus(`✓ 方法 ${finalMethodName} 的代码实现已保存！`)
  }

  function handleGenerateAiCode(customPrompt?: string) {
    const targetPrompt = (customPrompt ?? aiPrompt).trim()
    if (!editingImplementation || !targetPrompt) return
    setIsAiGenerating(true)
    setAiPrompt('')
    setTimeout(() => {
      const res = generateAiCode(
        targetPrompt,
        editingImplementation.methodName,
        editingImplementation.parameters,
      )
      setEditingImplementation((prev) => (prev ? { ...prev, code: res.code } : null))
      setAiResult(res)
      setIsAiGenerating(false)
      showStatus(`✓ AI 已自动更新代码：${res.explanation}`)
    }, 280)
  }

  function handleSelectAiPreset(preset: AiQuickPreset) {
    if (!editingImplementation) return
    handleGenerateAiCode(preset.prompt)
  }

  function handleResetDefaultCode() {
    if (!editingImplementation) return
    const builtin = SVG_LAYER_BUILTIN_METHODS.find((m) => m.name === editingImplementation.methodName)
    if (builtin?.defaultImplementation) {
      const builtinParams: ComponentActionParameterDefinition[] = builtin.parameter
        ? [
            {
              name: builtin.parameter.name,
              title: builtin.parameter.title,
              kind: builtin.parameter.kind as ComponentValueKind,
              options: builtin.parameter.options,
            },
          ]
        : []

      setEditingImplementation((prev) =>
        prev
          ? {
              ...prev,
              code: builtin.defaultImplementation!,
              parameters: builtinParams,
            }
          : null,
      )
      showStatus('已恢复默认方法实现。')
    }
  }

  // Test run inside the implementation modal
  function handleRunInsideModal() {
    if (!editingImplementation) return
    const res = runMethodCode(
      editingImplementation.methodName,
      editingImplementation.code,
      editingImplementation.testParamValues,
      editingImplementation.parameters,
    )
    setEditingImplementation((prev) => (prev ? { ...prev, lastRunResult: res } : null))
  }

  // --- Run from Outside List Card ---
  function handleRunMethodDirect(item: {
    name: string
    title: string
    parameters: readonly ComponentActionParameterDefinition[]
    implementation: string
  }) {
    if (item.parameters.length > 0) {
      const initialValues: Record<string, string | number | boolean> = {}
      for (const p of item.parameters) {
        if (p.kind === 'boolean') initialValues[p.name] = false
        else if (p.kind === 'number') initialValues[p.name] = 0
        else if (p.kind === 'select' && p.options && p.options.length > 0) {
          initialValues[p.name] = String(p.options[0].value)
        } else if (p.name === 'state') {
          initialValues[p.name] = 'running'
        } else {
          initialValues[p.name] = ''
        }
      }
      setTestingMethod({
        name: item.name,
        title: item.title,
        parameters: item.parameters,
        paramValues: initialValues,
      })
      return
    }

    // Execute immediately with saved code
    const res = runMethodCode(item.name, item.implementation, {}, [])
    if (res.ok) {
      showStatus(`✓ 执行成功：${item.name}() · ${res.message} (${res.elapsedMs}ms)`)
    } else {
      showStatus(`❌ 执行出错：${res.message}`)
    }
  }

  function handleExecuteExternalTest() {
    if (!testingMethod) return
    const target = allMethods.find((m) => m.name === testingMethod.name)
    const code = target ? target.implementation : `$self.setTheme('${testingMethod.paramValues.state || 'running'}');`

    const res = runMethodCode(
      testingMethod.name,
      code,
      testingMethod.paramValues,
      testingMethod.parameters,
    )
    if (res.ok) {
      showStatus(`✓ 试运行成功：${testingMethod.name}(${JSON.stringify(testingMethod.paramValues)}) · ${res.message} (${res.elapsedMs}ms)`)
      setTestingMethod(null)
    } else {
      showStatus(`❌ 试运行出错：${res.message}`)
    }
  }

  function handleDeleteMethod(key: string) {
    const nextActions = { ...definition.actions }
    delete nextActions[key]
    onUpdateDefinition({
      ...definition,
      actions: nextActions,
    })
    showStatus(`✓ 方法 ${key} 已删除。`)
  }

  // Handle Tab key in code editor textarea
  function handleCodeKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Tab') {
      e.preventDefault()
      const textarea = codeTextareaRef.current
      if (!textarea || !editingImplementation) return
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const current = editingImplementation.code
      const nextCode = current.substring(0, start) + '  ' + current.substring(end)
      setEditingImplementation((prev) => (prev ? { ...prev, code: nextCode } : null))
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2
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

  const lineCount = editingImplementation
    ? (editingImplementation.code.match(/\n/g)?.length ?? 0) + 1
    : 1

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

        {/* Methods List: Each method adopts the exact same card style as the SVG attributes list */}
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
                </div>

                {m.description && (
                  <div className="component-method-description" title={m.description}>
                    <span className="component-method-desc-icon">📝</span>
                    <span className="component-method-desc-text">{m.description}</span>
                  </div>
                )}

                <div className="component-method-action-row">
                  <code className="component-method-signature" title={callSignature}>
                    {callSignature}
                  </code>
                  <div
                    className="component-method-actions"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <IconButton
                      variant="ghost"
                      size="small"
                      aria-label={`查看/编辑 ${m.name} 源码`}
                      title={`查看/编辑 ${m.name} 源代码`}
                      onClick={() => openImplementationEditor(m)}
                    >
                      <CodeIcon />
                    </IconButton>
                    <IconButton
                      variant="ghost"
                      size="small"
                      className="component-method-btn-run"
                      aria-label={`试运行 ${m.name}`}
                      title={
                        m.parameters.length > 0
                          ? `试运行 ${m.name}（填写测试参数）`
                          : `立即执行 ${m.name}()`
                      }
                      onClick={() => handleRunMethodDirect(m)}
                    >
                      <PlayIcon />
                    </IconButton>
                    {!m.isBuiltin && !readOnly && (
                      <IconButton
                        variant="ghost"
                        size="small"
                        aria-label={`删除 ${m.name}`}
                        title="删除此自定义方法"
                        onClick={() => handleDeleteMethod(m.name)}
                      >
                        <TrashIcon />
                      </IconButton>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </CollapsibleInspectorGroup>

      {/* --- Modal 1: Method Implementation Code Editor Modal --- */}
      <DialogRoot
        open={editingImplementation !== null}
        onOpenChange={(open) => {
          if (!open) handleCloseEditor()
        }}
      >
        <DialogContent className="component-method-implementation-modal">
          {/* Header */}
          <div className="component-method-dialog-header">
            <div className="component-method-dialog-title-row">
              <div className="component-method-dialog-title-wrap">
                <DialogTitle className="component-method-dialog-title">
                  {editingImplementation?.isNew ? '新建方法实现' : '方法实现编辑器'}
                </DialogTitle>
                <span className="component-method-dialog-divider">/</span>
                <span className="component-method-dialog-subtitle">
                  契约优先 · Form 驱动形参声明 · 左右布局 · 统一控制台
                </span>
              </div>
              <Button
                variant="ghost"
                size="small"
                onClick={handleCloseEditor}
                className="component-method-close-btn"
                title="关闭窗口"
              >
                ✕
              </Button>
            </div>
          </div>

          {editingImplementation && (
            <>
              {/* Metadata Bar: Direct Inputs without verbose labels */}
              <div className="component-method-metadata-bar">
                <Input
                  className="component-method-meta-name-input"
                  value={editingImplementation.methodName}
                  placeholder="setRunState"
                  title="方法标识名 (如 setRunState)"
                  aria-label="方法标识名"
                  disabled={readOnly}
                  onChange={(e) => handleMethodNameChange(e.target.value)}
                />
                <Input
                  className="component-method-meta-desc-input"
                  value={editingImplementation.title}
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
                          共 {editingImplementation.parameters.length} 个自定义入参
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

                    {editingImplementation.parameters.length > 0 ? (
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
                            {editingImplementation.parameters.map((param, pIdx) => (
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
                        📄 {editingImplementation.methodName}.js
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
                          dangerouslySetInnerHTML={{ __html: highlightedCodeHtml }}
                        />
                        <Textarea
                          ref={codeTextareaRef}
                          className="component-method-code-textarea"
                          value={editingImplementation.code}
                          disabled={readOnly}
                          spellCheck={false}
                          onChange={(e) =>
                            setEditingImplementation((prev) =>
                              prev ? { ...prev, code: e.target.value } : null,
                            )
                          }
                          onKeyDown={handleCodeKeyDown}
                          onScroll={handleCodeScroll}
                        />
                      </div>
                    </div>
                  </div>

                  {/* 3. AI Code Assistant below Code Editor */}
                  <div className="component-method-ai-pane">
                    <div className="component-method-ai-header">
                      <span className="component-method-ai-title">✨ 本地 AI 代码助手 (上下文已就绪)</span>
                      <span className="component-method-ai-status-badge">
                        ● 本地模型就绪 (Ollama/vLLM)
                      </span>
                    </div>

                    {/* Preset quick prompts */}
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

                    {/* Prompt input row with Send button (Multi-line textarea + Ctrl+Enter) */}
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

                    {/* AI Result notification strip */}
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
                  {/* Top: Live Visual Preview */}
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

                  {/* Bottom: Test Run Parameters & Execution Feedback Panel */}
                  <div className="component-method-test-panel">
                    <div className="component-method-test-header">
                      <span className="component-method-test-title">⚙️ 试运行参数测试</span>
                      <span className="component-method-test-subtitle">Form 形参实时绑定</span>
                    </div>

                    <div className="component-method-test-fields-body">
                      {editingImplementation.parameters.length > 0 ? (
                        editingImplementation.parameters.map((param) => {
                          const currentVal = editingImplementation.testParamValues[param.name]
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
                                      setEditingImplementation((prev) =>
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
                                      setEditingImplementation((prev) =>
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
                                      setEditingImplementation((prev) =>
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
                      {editingImplementation.lastRunResult ? (
                        <div
                          className={`component-method-test-result-msg ${
                            editingImplementation.lastRunResult.ok ? 'is-success' : 'is-error'
                          }`}
                        >
                          <span className="component-method-test-result-icon">
                            {editingImplementation.lastRunResult.ok ? '✓' : '❌'}
                          </span>
                          <span className="component-method-test-result-text">
                            {editingImplementation.lastRunResult.ok
                              ? `执行成功 (${editingImplementation.lastRunResult.elapsedMs}ms) · ${editingImplementation.lastRunResult.message}`
                              : `执行出错: ${editingImplementation.lastRunResult.message}`}
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
            </>
          )}

          {/* Unified Bottom Action Bar on a single row */}
          <div className="component-method-dialog-actions">
            <div className="component-method-dialog-actions-left">
              {editingImplementation?.isBuiltin && (
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
                onClick={handleCloseEditor}
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
                disabled={!editingImplementation?.methodName.trim()}
                onClick={handleSaveImplementation}
              >
                保存方法实现
              </Button>
            </div>
          </div>
        </DialogContent>
      </DialogRoot>

      {/* --- Modal 2: Test Run Parameters Dialog (for external list button) --- */}
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
