import type {
  ComponentActionDefinition,
  ComponentDefinition,
  ComponentPropertyDefinition,
} from './definition'
import type {
  ManagedSvgAttribute,
  ManagedSvgDocument,
  ManagedSvgElement,
  ManagedSvgNode,
} from './managedSvg'
import type { ComponentVisualDefinition } from './visual'
import type { VisualRule } from './visualRules'

export type SvgThemePresetKey =
  | 'default'
  | 'running'
  | 'alarm'
  | 'warning'
  | 'standby'
  | 'offline'

export type SvgThemePreset = {
  id: SvgThemePresetKey
  label: string
  color: string
  h: number
  s: number
}

export const SVG_THEME_PRESETS: Record<SvgThemePresetKey, SvgThemePreset> = {
  default: {
    id: 'default',
    label: '默认原色',
    color: '#808080',
    h: 0,
    s: 0,
  },
  running: {
    id: 'running',
    label: '运行态 (绿)',
    color: '#11bf62',
    h: 152,
    s: 0.88,
  },
  alarm: {
    id: 'alarm',
    label: '报警态 (红)',
    color: '#dc2626',
    h: 0,
    s: 0.88,
  },
  warning: {
    id: 'warning',
    label: '预警态 (黄)',
    color: '#eab308',
    h: 45,
    s: 0.95,
  },
  standby: {
    id: 'standby',
    label: '待机态 (蓝)',
    color: '#2563eb',
    h: 217,
    s: 0.88,
  },
  offline: {
    id: 'offline',
    label: '离线态 (灰)',
    color: '#9ca3af',
    h: 215,
    s: 0.15,
  },
}

export type ThemeTierColors = {
  highlight: string
  light: string
  base: string
  dark: string
  deep: string
  generic: string
  h: number
  s: number
}

export const PRESET_TIER_MAP: Record<SvgThemePresetKey, ThemeTierColors> = {
  running: {
    highlight: '#52ec96',
    light: '#23dc79',
    base: '#11bf62',
    dark: '#0c8444',
    deep: '#04331a',
    generic: '#11bf62',
    h: 152,
    s: 0.88,
  },
  alarm: {
    highlight: '#f87171',
    light: '#ef4444',
    base: '#dc2626',
    dark: '#991b1b',
    deep: '#450a0a',
    generic: '#dc2626',
    h: 0,
    s: 0.88,
  },
  warning: {
    highlight: '#fef08a',
    light: '#fde047',
    base: '#eab308',
    dark: '#a16207',
    deep: '#422006',
    generic: '#eab308',
    h: 45,
    s: 0.95,
  },
  offline: {
    highlight: '#e5e7eb',
    light: '#d1d5db',
    base: '#9ca3af',
    dark: '#4b5563',
    deep: '#1f2937',
    generic: '#9ca3af',
    h: 215,
    s: 0.15,
  },
  standby: {
    highlight: '#93c5fd',
    light: '#60a5fa',
    base: '#2563eb',
    dark: '#1e40af',
    deep: '#172554',
    generic: '#2563eb',
    h: 217,
    s: 0.88,
  },
  default: {
    highlight: '',
    light: '',
    base: '',
    dark: '',
    deep: '',
    generic: '',
    h: 0,
    s: 0,
  },
}

export function parseCssColorToRgb(input: string): { r: number; g: number; b: number } | null {
  if (!input) return null
  const str = input.trim().toLowerCase()
  if (str.startsWith('#')) {
    const hex = str.slice(1)
    if (hex.length === 3 || hex.length === 4) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
      }
    }
    if (hex.length === 6 || hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
      }
    }
  }
  const rgbMatch = str.match(/rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)/)
  if (rgbMatch) {
    return {
      r: Math.min(255, Math.max(0, parseFloat(rgbMatch[1]))),
      g: Math.min(255, Math.max(0, parseFloat(rgbMatch[2]))),
      b: Math.min(255, Math.max(0, parseFloat(rgbMatch[3]))),
    }
  }
  return null
}

export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const normR = r / 255
  const normG = g / 255
  const normB = b / 255
  const max = Math.max(normR, normG, normB)
  const min = Math.min(normR, normG, normB)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case normR:
        h = (normG - normB) / d + (normG < normB ? 6 : 0)
        break
      case normG:
        h = (normB - normR) / d + 2
        break
      case normB:
        h = (normR - normG) / d + 4
        break
    }
    h *= 60
  }
  return { h, s, l }
}

export function hslToHex(h: number, s: number, l: number): string {
  const normS = Math.min(1, Math.max(0, s))
  const normL = Math.min(1, Math.max(0, l))
  const a = normS * Math.min(normL, 1 - normL)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const color = normL - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

export function hasManagedSvgThemeClasses(document: ManagedSvgDocument): boolean {
  let found = false
  function walk(node: ManagedSvgNode) {
    if (found || node.kind === 'text') return
    for (const attr of node.attributes) {
      if (attr.name === 'class' && attr.value.includes('scada-theme-')) {
        found = true
        return
      }
    }
    for (const child of node.children) {
      walk(child)
    }
  }
  walk(document.root)
  return found
}

export function applyThemeToManagedSvgDocument(
  document: ManagedSvgDocument,
  themeStateOrColor: string,
): ManagedSvgDocument {
  const themeKey = themeStateOrColor as SvgThemePresetKey
  const isDefault = themeStateOrColor === 'default' || themeStateOrColor === 'reset'
  const tierConfig = PRESET_TIER_MAP[themeKey]

  // 1. Gather all baseline fills for each scada-theme-* class across the document
  const classBaselineFills = new Map<string, string[]>()
  function collectBaselines(node: ManagedSvgNode) {
    if (node.kind === 'text') return
    const classAttr = node.attributes.find((a) => a.name === 'class')
    if (classAttr && classAttr.value) {
      const classes = classAttr.value.split(/\s+/).filter((c) => c.startsWith('scada-theme-'))
      if (classes.length > 0) {
        const currentFill = node.attributes.find((a) => a.name === 'fill')?.value
        const origFill = node.attributes.find((a) => a.name === 'data-original-fill')?.value
        const fill = origFill || currentFill
        if (fill && fill !== 'none' && !fill.startsWith('url(')) {
          for (const cls of classes) {
            const list = classBaselineFills.get(cls) ?? []
            list.push(fill)
            classBaselineFills.set(cls, list)
          }
        }
      }
    }
    for (const child of node.children) collectBaselines(child)
  }
  collectBaselines(document.root)

  // 2. Compute median baseline fill and HSL for each class
  const classBaselineMap = new Map<string, { fill: string; hsl: { h: number; s: number; l: number } }>()
  for (const [cls, fills] of classBaselineFills.entries()) {
    const uniqueFills = Array.from(new Set(fills.map((f) => f.toLowerCase())))
    const sorted = uniqueFills
      .map((f) => ({ f, rgb: parseCssColorToRgb(f) }))
      .filter((x): x is { f: string; rgb: { r: number; g: number; b: number } } => Boolean(x.rgb))
      .map((x) => ({ f: x.f, hsl: rgbToHsl(x.rgb.r, x.rgb.g, x.rgb.b) }))
      .sort((a, b) => a.hsl.l - b.hsl.l)
    if (sorted.length > 0) {
      const mid = Math.floor(sorted.length / 2)
      classBaselineMap.set(cls, { fill: sorted[mid].f, hsl: sorted[mid].hsl })
    }
  }

  // 3. Compute target color for each class
  const classTargetColorMap = new Map<string, string>()
  for (const [cls, baseInfo] of classBaselineMap.entries()) {
    if (tierConfig && !isDefault && Boolean(tierConfig.base)) {
      if (cls === 'scada-theme-highlight') classTargetColorMap.set(cls, tierConfig.highlight)
      else if (cls === 'scada-theme-light') classTargetColorMap.set(cls, tierConfig.light)
      else if (cls === 'scada-theme-base') classTargetColorMap.set(cls, tierConfig.base)
      else if (cls === 'scada-theme-dark') classTargetColorMap.set(cls, tierConfig.dark)
      else if (cls === 'scada-theme-deep') classTargetColorMap.set(cls, tierConfig.deep)
      else classTargetColorMap.set(cls, tierConfig.generic)
    } else if (!isDefault) {
      const customRgb = parseCssColorToRgb(themeStateOrColor)
      if (customRgb) {
        const customHsl = rgbToHsl(customRgb.r, customRgb.g, customRgb.b)
        classTargetColorMap.set(cls, hslToHex(customHsl.h, customHsl.s, baseInfo.hsl.l))
      }
    }
  }

  function transformNode(node: ManagedSvgNode): ManagedSvgNode {
    if (node.kind === 'text') return { ...node }

    const classAttr = node.attributes.find((a) => a.name === 'class')
    const themeClass = classAttr?.value
      ?.split(/\s+/)
      .find((c) => c.startsWith('scada-theme-'))

    if (!themeClass) {
      return {
        ...node,
        attributes: node.attributes.map((a) => ({ ...a })),
        children: node.children.map(transformNode),
      }
    }

    const currentFillAttr = node.attributes.find((a) => a.name === 'fill')
    const originalFillAttr = node.attributes.find((a) => a.name === 'data-original-fill')

    const baselineFill = originalFillAttr?.value || currentFillAttr?.value || ''
    if (!baselineFill || baselineFill === 'none' || baselineFill.startsWith('url(')) {
      return {
        ...node,
        attributes: node.attributes.map((a) => ({ ...a })),
        children: node.children.map(transformNode),
      }
    }

    let nextFill = baselineFill
    if (!isDefault) {
      const baseInfo = classBaselineMap.get(themeClass)
      const targetColor = classTargetColorMap.get(themeClass)
      if (baseInfo && targetColor) {
        const targetRgb = parseCssColorToRgb(targetColor)
        const fillRgb = parseCssColorToRgb(baselineFill)
        if (targetRgb && fillRgb) {
          const targetHsl = rgbToHsl(targetRgb.r, targetRgb.g, targetRgb.b)
          const fillHsl = rgbToHsl(fillRgb.r, fillRgb.g, fillRgb.b)
          const deltaL = fillHsl.l - baseInfo.hsl.l
          const newL = Math.max(0.02, Math.min(0.98, targetHsl.l + deltaL))
          const satScale = baseInfo.hsl.s > 0.01 ? Math.min(1, fillHsl.s / baseInfo.hsl.s) : 1
          const newS = Math.max(0.02, Math.min(1, targetHsl.s * satScale))
          nextFill = hslToHex(targetHsl.h, newS, newL)
        }
      }
    }

    const nextAttributes: ManagedSvgAttribute[] = []
    const hasOriginalStored = Boolean(originalFillAttr)

    for (const attr of node.attributes) {
      if (attr.name === 'fill') {
        nextAttributes.push({ name: 'fill', value: nextFill })
      } else if (attr.name === 'data-original-fill') {
        nextAttributes.push({ name: 'data-original-fill', value: attr.value })
      } else {
        nextAttributes.push({ ...attr })
      }
    }

    if (!hasOriginalStored) {
      nextAttributes.push({ name: 'data-original-fill', value: baselineFill })
    }

    if (!node.attributes.some((a) => a.name === 'fill')) {
      nextAttributes.push({ name: 'fill', value: nextFill })
    }

    nextAttributes.sort((a, b) => a.name.localeCompare(b.name))

    return {
      ...node,
      attributes: nextAttributes,
      children: node.children.map(transformNode),
    }
  }

  return {
    version: document.version,
    root: transformNode(document.root) as ManagedSvgElement,
  }
}

export type SvgLayerMethodDefinition = {
  name: string
  title: string
  description: string
  parameter?: {
    name: string
    title: string
    kind: 'select' | 'color' | 'string'
    options?: readonly { label: string; value: string }[]
  }
}

export const SVG_LAYER_BUILTIN_METHODS: readonly SvgLayerMethodDefinition[] = [
  {
    name: 'setThemeState',
    title: '设置运行状态',
    description: '切换指定状态（运行/报警/预警/待机/离线）',
    parameter: {
      name: 'state',
      title: '状态',
      kind: 'select',
      options: [
        { label: '默认原色', value: 'default' },
        { label: '运行态 (绿)', value: 'running' },
        { label: '报警态 (红)', value: 'alarm' },
        { label: '预警态 (黄)', value: 'warning' },
        { label: '待机态 (蓝)', value: 'standby' },
        { label: '离线态 (灰)', value: 'offline' },
      ],
    },
  },
  {
    name: 'setRunning',
    title: '设为运行态',
    description: '切换至正常运行态 (绿色)',
  },
  {
    name: 'setAlarm',
    title: '设为报警态',
    description: '切换至故障报警态 (红色)',
  },
  {
    name: 'setWarning',
    title: '设为预警态',
    description: '切换至异常预警态 (黄色)',
  },
  {
    name: 'setStandby',
    title: '设为待机态',
    description: '切换至就绪待机态 (蓝色)',
  },
  {
    name: 'setOffline',
    title: '设为离线态',
    description: '切换至设备离线态 (灰色)',
  },
  {
    name: 'resetTheme',
    title: '恢复默认原色',
    description: '恢复出厂默认外观原色',
  },
]

export function generateComponentSvgThemeBindings(
  layerId: string,
  definition: ComponentDefinition,
  visual: ComponentVisualDefinition,
): { definition: ComponentDefinition; visual: ComponentVisualDefinition } {
  let statePropertyKey = 'state'
  if (definition.properties[statePropertyKey] && definition.properties[statePropertyKey].kind !== 'select') {
    statePropertyKey = 'themeState'
  }

  const propertyDef: ComponentPropertyDefinition = {
    title: '运行状态',
    kind: 'select',
    defaultValue: 'default',
    description: '驱动水泵/设备矢量图层的语义运行状态高保真光影',
    bindable: true,
    options: [
      { label: '默认原色', value: 'default' },
      { label: '运行态', value: 'running' },
      { label: '报警态', value: 'alarm' },
      { label: '预警态', value: 'warning' },
      { label: '待机态', value: 'standby' },
      { label: '离线态', value: 'offline' },
    ],
  }

  const nextActions: Record<string, ComponentActionDefinition> = { ...definition.actions }
  for (const method of SVG_LAYER_BUILTIN_METHODS) {
    nextActions[method.name] = {
      title: method.title,
      description: method.description,
      ...(method.parameter
        ? {
            parameters: [
              {
                name: method.parameter.name,
                title: method.parameter.title,
                kind: method.parameter.kind,
                options: method.parameter.options,
              },
            ],
          }
        : {}),
    }
  }

  const existingRules = (visual.rules ?? []).filter(
    (rule) => !(rule.layerId === layerId && rule.target === 'svg.themeState'),
  )

  const states: Array<{ state: SvgThemePresetKey; name: string }> = [
    { state: 'running', name: '运行态' },
    { state: 'alarm', name: '报警态' },
    { state: 'warning', name: '预警态' },
    { state: 'standby', name: '待机态' },
    { state: 'offline', name: '离线态' },
  ]

  let ruleIndex = 1
  const existingIds = new Set(existingRules.map((r) => r.id))
  function getUniqueRuleId(prefix: string) {
    let id = `${prefix}_${ruleIndex++}`
    while (existingIds.has(id)) {
      id = `${prefix}_${ruleIndex++}`
    }
    existingIds.add(id)
    return id
  }

  const generatedRules: VisualRule[] = states.map((item) => ({
    id: getUniqueRuleId(`rule_theme_${item.state}`),
    enabled: true,
    propertyKey: statePropertyKey,
    operator: 'equals',
    compareValue: item.state,
    layerId,
    target: 'svg.themeState' as const,
    value: item.state,
  }))

  return {
    definition: {
      ...definition,
      properties: {
        ...definition.properties,
        [statePropertyKey]: propertyDef,
      },
      actions: nextActions,
    },
    visual: {
      ...visual,
      rules: [...existingRules, ...generatedRules],
    },
  }
}
