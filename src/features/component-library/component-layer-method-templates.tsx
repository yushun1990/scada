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

export type QuickPreset = {
  icon: string
  label: string
  suggestedCode: (name: string) => string
  explanation: string
}

export const METHOD_QUICK_PRESETS: readonly QuickPreset[] = [
  {
    icon: '⚙️',
    label: '多态切换 (运行/待机)',
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
    icon: '🗂️',
    label: '多图层独占切换',
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
    label: '告警与事件',
    suggestedCode: (name) => `/**
 * 告警触发与业务事件记录
 * 切换状态并记录业务告警事件
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
    icon: '🔄',
    label: '复位当前状态',
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
