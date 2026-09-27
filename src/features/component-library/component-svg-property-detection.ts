import type { ManagedSvgDocument, ManagedSvgNode } from '../../component-system/managedSvg'
import { parseCssColorToRgb, rgbToHsl } from '../../component-system/managedSvgTheme'

export type DetectedSvgClassInfo = {
  name: string
  count: number
  initialColor: string
  uniqueFills: string[]
}

const THEME_ORDER: Record<string, number> = {
  'scada-theme-highlight': 1,
  'scada-theme-light': 2,
  'scada-theme-base': 3,
  'scada-theme-dark': 4,
  'scada-theme-deep': 5,
}

// Auto-detect the CSS classes an SVG carries (with usage counts and the
// lightness-median initial fill) so the inspector group can list what the
// document itself declares without authoring anything first.
export function detectSvgClasses(
  document: ManagedSvgDocument | null | undefined,
): DetectedSvgClassInfo[] {
  if (!document) return []
  const map = new Map<string, { count: number; fills: string[] }>()

  function walk(node: ManagedSvgNode) {
    if (node.kind === 'text') return
    const classAttr = node.attributes.find((a) => a.name === 'class')?.value
    const fillAttr = node.attributes.find((a) => a.name === 'fill')?.value
    if (classAttr) {
      const classes = classAttr.trim().split(/\s+/).filter(Boolean)
      for (const cls of classes) {
        const existing = map.get(cls)
        if (!existing) {
          map.set(cls, {
            count: 1,
            fills:
              fillAttr && fillAttr !== 'none' && !fillAttr.startsWith('url(') ? [fillAttr] : [],
          })
        } else {
          existing.count++
          if (fillAttr && fillAttr !== 'none' && !fillAttr.startsWith('url(')) {
            existing.fills.push(fillAttr)
          }
        }
      }
    }
    for (const child of node.children) {
      walk(child)
    }
  }

  walk(document.root)

  return Array.from(map.entries())
    .map(([name, info]) => {
      let initialColor = '#34d399'
      const uniqueFills = Array.from(new Set(info.fills.map((f) => f.toLowerCase())))
      if (info.fills.length > 0) {
        const sorted = uniqueFills
          .map((f) => ({ f, rgb: parseCssColorToRgb(f) }))
          .filter((x): x is { f: string; rgb: { r: number; g: number; b: number } } => Boolean(x.rgb))
          .map((x) => ({ f: x.f, hsl: rgbToHsl(x.rgb.r, x.rgb.g, x.rgb.b) }))
          .sort((a, b) => a.hsl.l - b.hsl.l)
        if (sorted.length > 0) {
          const mid = Math.floor(sorted.length / 2)
          initialColor = sorted[mid].f
        }
      }
      return {
        name,
        count: info.count,
        initialColor,
        uniqueFills,
      }
    })
    .sort((a, b) => {
      const orderA = THEME_ORDER[a.name] ?? 10
      const orderB = THEME_ORDER[b.name] ?? 10
      if (orderA !== orderB) return orderA - orderB
      return a.name.localeCompare(b.name)
    })
}

export function isSvgThemeClassName(name: string) {
  return name in THEME_ORDER
}
