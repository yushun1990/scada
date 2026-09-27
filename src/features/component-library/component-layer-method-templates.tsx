import type { ReactNode } from 'react'
import type { SvgLayerMethodParameter } from '../../component-system/visual'

export function CodeIcon(props: React.SVGProps<SVGSVGElement>) {
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

export function PlayIcon(props: React.SVGProps<SVGSVGElement>) {
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

export const PARAM_KIND_OPTIONS: Array<{ value: SvgLayerMethodParameter['kind']; label: string }> = [
  { value: 'number', label: 'number (数值)' },
  { value: 'string', label: 'string (文本)' },
  { value: 'boolean', label: 'boolean (布尔)' },
  { value: 'select', label: 'select (下拉枚举)' },
]

export function buildMethodCode(
  methodName: string,
  title: string,
  description: string,
  parameters: readonly SvgLayerMethodParameter[],
  existingBody?: string | null,
): string {
  const paramNames = parameters.map((p) => p.name).filter(Boolean)
  const paramDocs = parameters
    .map((p) => ` * @param {${p.kind}} ${p.name} - ${p.title || p.name}`)
    .join('\n')

  const doc = `/**
 * ${title || methodName}
 * ${description || 'SVG 图层函数'}
 * 运行沙箱内置上下文（受控执行，无 DOM/网络/定时器）：
 * - $self: 当前图层驱动接口（$self.layers, $self.setTheme, $self.showOnly 等）
 * - $emit(eventName, payload): 记录一次业务事件
${paramDocs ? `${paramDocs}\n` : ''} */`

  const signature = `function ${methodName}(${paramNames.join(', ')})`

  let bodyContent = existingBody
  if (!bodyContent || !bodyContent.trim()) {
    bodyContent = `\n  // TODO: 在此编写函数具体实现逻辑\n  $self.setTheme('running');\n`
  }

  return `${doc}\n${signature} {${bodyContent}}`
}

export function extractFunctionBody(code: string): string | null {
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

export function formatOptionsToInput(
  options?: readonly { label: string; value: string | number | boolean }[],
): string {
  if (!options || options.length === 0) return ''
  return options.map((opt) => `${opt.value}=${opt.label}`).join(', ')
}

export function parseInputToOptions(
  input: string,
): { label: string; value: string | number }[] {
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

export type AiQuickPreset = {
  icon: string
  label: string
  prompt: string
  suggestedCode: (name: string) => string
  explanation: string
}

export const AI_QUICK_PRESETS: readonly AiQuickPreset[] = [
  {
    icon: '🗂️',
    label: '多图层独占切换',
    prompt: '根据目标图层名称独占显示该图层，隐藏其余所有图层',
    suggestedCode: (name) => `/**
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
    icon: '⚠️',
    label: '告警闪烁与事件',
    prompt: '切换为红色告警光影，并向外层系统抛出告警业务事件',
    suggestedCode: (name) => `/**
 * 告警触发与业务事件抛送
 * 切换状态并触发业务告警事件通知外部 SCADA 宿主
 */
function ${name}(errorLevel = 'CRITICAL') {
  $self.setTheme('alarm');
  $emit('ALARM_TRIGGERED', {
    level: errorLevel,
    message: '设备检测到异常告警，已切换红色预警态'
  });
}`,
    explanation: '已生成 $emit 业务事件逻辑，事件随试运行结果一起展示。',
  },
  {
    icon: '⚙️',
    label: '多态切换 (运行/待机)',
    prompt: '根据传入的运行状态名称，动态切换主题色',
    suggestedCode: (name) => `/**
 * 状态机主题驱动
 * 根据状态动态切换主题：running / alarm / warning / standby / offline
 */
function ${name}(state = 'running') {
  const validThemes = ['running', 'alarm', 'warning', 'standby', 'offline', 'default'];
  if (validThemes.includes(state)) {
    return $self.setTheme(state);
  }
  return $self.setTheme('default');
}`,
    explanation: '已生成安全校验主题切换逻辑，支持六种工业标准语义状态。',
  },
  {
    icon: '🔄',
    label: '反转/复位当前状态',
    prompt: '复位为 default 原色，并恢复所有图层显示',
    suggestedCode: (name) => `/**
 * 复位组件状态
 * 恢复默认主题并显示所有图层
 */
function ${name}() {
  $self.setTheme('default');
  for (const layer of $self.layers) {
    layer.show = true;
  }
}`,
    explanation: '已生成一键状态归一化代码，恢复默认主题并展示所有图层。',
  },
]

export function generateAiCode(
  prompt: string,
  methodName: string,
  parameters: readonly SvgLayerMethodParameter[],
): { code: string; explanation: string } {
  const p = prompt.toLowerCase()
  const paramArgStr = parameters.map((item) => item.name).join(', ')
  const preset = AI_QUICK_PRESETS.find((candidate) => candidate.prompt === prompt.trim())
  if (preset) {
    return {
      code: preset.suggestedCode(methodName || 'myMethod'),
      explanation: preset.explanation,
    }
  }

  if (p.includes('独占') || p.includes('切换') || p.includes('显示') || p.includes('显隐') || p.includes('layer')) {
    return {
      code: `/**
 * ${prompt}
 * 基于图层显隐与独占驱动逻辑
 */
function ${methodName || 'myMethod'}(${paramArgStr || "targetLayerName = 'pump-red'"}) {
  const target = targetLayerName || 'pump-red';
  for (const layer of $self.layers) {
    layer.show = (layer.name === target);
  }
}`,
      explanation: `已针对“${prompt}”生成基于 $self.layers 驱动的多图层独占/显隐控制代码。`,
    }
  }

  if (p.includes('报警') || p.includes('告警') || p.includes('alarm') || p.includes('危险') || p.includes('红')) {
    return {
      code: `/**
 * ${prompt}
 * 告警联动与事件触发逻辑
 */
function ${methodName || 'myMethod'}(${paramArgStr || "errorLevel = 'CRITICAL'"}) {
  $self.setTheme('alarm');
  $emit('ALARM_TRIGGERED', {
    level: errorLevel,
    message: ${JSON.stringify(prompt)}
  });
}`,
      explanation: `已针对“${prompt}”生成告警主题切换与 $emit 事件代码。`,
    }
  }

  if (p.includes('复位') || p.includes('恢复') || p.includes('重置') || p.includes('default')) {
    return {
      code: `/**
 * ${prompt}
 * 状态归一化逻辑
 */
function ${methodName || 'myMethod'}(${paramArgStr}) {
  $self.setTheme('default');
  for (const layer of $self.layers) {
    layer.show = true;
  }
}`,
      explanation: `已针对“${prompt}”生成默认主题恢复与图层全显代码。`,
    }
  }

  return {
    code: `/**
 * ${prompt}
 * 主题状态驱动逻辑
 */
function ${methodName || 'myMethod'}(${paramArgStr || "state = 'running'"}) {
  const validThemes = ['running', 'alarm', 'warning', 'standby', 'offline', 'default'];
  return $self.setTheme(validThemes.includes(state) ? state : 'default');
}`,
    explanation: `已针对“${prompt}”生成主题状态切换代码；沙箱内可用能力：$self.setTheme / $self.layers 显隐 / $emit。`,
  }
}

export const SVG_THEME_PRESET_OPTIONS = [
  { value: 'running', label: '运行态 (绿 - running)' },
  { value: 'alarm', label: '报警态 (红 - alarm)' },
  { value: 'warning', label: '预警态 (黄 - warning)' },
  { value: 'standby', label: '待机态 (蓝 - standby)' },
  { value: 'offline', label: '离线态 (灰 - offline)' },
  { value: 'default', label: '默认原色 (default)' },
]

export const THEME_PRESET_META: Record<string, { label: string; color: string; icon: string }> = {
  running: { label: '运行态 (running)', color: '#10b981', icon: '🟢' },
  alarm: { label: '报警态 (alarm)', color: '#ef4444', icon: '🔴' },
  warning: { label: '预警态 (warning)', color: '#f59e0b', icon: '🟡' },
  standby: { label: '待机态 (standby)', color: '#3b82f6', icon: '🔵' },
  offline: { label: '离线态 (offline)', color: '#9ca3af', icon: '⚪' },
  default: { label: '默认原色 (default)', color: '#a855f7', icon: '⚙️' },
}

const JS_TOKEN_PATTERN =
  /(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|("(?:[^"\\\r\n]|\\.)*"|'(?:[^'\\\r\n]|\\.)*'|`(?:\\[\s\S]|[^`\\])*`)|(\$self|\$emit)|(\b(?:function|return|const|let|var|if|else|for|while|switch|case|break|continue|typeof|instanceof|new|this|try|catch|finally|throw|async|await|class|default)\b)|(\b(?:true|false|null|undefined|Math|JSON)\b)|(\b\d+(?:\.\d+)?\b)|(\b[a-zA-Z_$][a-zA-Z0-9_$]*(?=\s*\())|([{}()[\].,;+\-*/%=<>!&|^~?:])/g

export function highlightJsToNodes(code: string): ReactNode[] {
  const tokenRegex = new RegExp(JS_TOKEN_PATTERN.source, 'g')
  const nodes: ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0

  while ((match = tokenRegex.exec(code)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(code.slice(lastIndex, match.index))
    }
    const [full, comment, str, selfIdent, keyword, builtin, num, fnCall, punct] = match

    if (comment) {
      nodes.push(<span key={key++} className="token-comment">{comment}</span>)
    } else if (str) {
      nodes.push(<span key={key++} className="token-string">{str}</span>)
    } else if (selfIdent) {
      nodes.push(<span key={key++} className="token-self">{selfIdent}</span>)
    } else if (keyword) {
      nodes.push(<span key={key++} className="token-keyword">{keyword}</span>)
    } else if (builtin) {
      nodes.push(<span key={key++} className="token-builtin">{builtin}</span>)
    } else if (num) {
      nodes.push(<span key={key++} className="token-number">{num}</span>)
    } else if (fnCall) {
      nodes.push(<span key={key++} className="token-function">{fnCall}</span>)
    } else if (punct) {
      nodes.push(<span key={key++} className="token-punct">{punct}</span>)
    } else {
      nodes.push(full)
    }

    lastIndex = tokenRegex.lastIndex
  }

  if (lastIndex < code.length) {
    nodes.push(code.slice(lastIndex))
  }

  if (code.endsWith('\n')) {
    nodes.push('\n')
  }

  return nodes
}
