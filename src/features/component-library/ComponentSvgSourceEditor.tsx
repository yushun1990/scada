import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CollapsibleInspectorGroup } from '../../components/CollapsibleInspectorGroup'
import {
  serializeManagedSvgDataUrl,
  serializeManagedSvgDocument,
  type ManagedSvgDocument,
  type ManagedSvgElement,
  type ManagedSvgNode,
} from '../../component-system/managedSvg'
import { parseManagedSvgSourceWithCompatibility } from '../../component-system/managedSvgImportCompatibility'
import type { SvgVisualLayer } from '../../component-system/visual'
import {
  Button,
  DialogContent,
  DialogRoot,
  DialogTitle,
  Input,
  SegmentedControl,
  type SegmentedControlItem,
  Textarea,
} from '../../ui'
import './component-svg-source-editor.css'

type ComponentSvgSourceEditorProps = {
  layer: SvgVisualLayer
  readOnly: boolean
  onChange: (layer: SvgVisualLayer) => void
}

function escapeAttr(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeText(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function formatManagedSvgDocument(document: ManagedSvgDocument, indent = '  '): string {
  function serializeNode(node: ManagedSvgNode, depth: number, isRoot: boolean): string {
    const spaces = indent.repeat(depth)
    if (node.kind === 'text') {
      const text = node.text.trim()
      return text ? `${spaces}${escapeText(text)}` : ''
    }

    const attrs: string[] = []
    if (isRoot) {
      attrs.push('xmlns="http://www.w3.org/2000/svg"')
    }
    for (const attr of node.attributes) {
      attrs.push(`${attr.name}="${escapeAttr(attr.value)}"`)
    }

    const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : ''

    if (node.children.length === 0) {
      return `${spaces}<${node.tagName}${attrStr} />`
    }

    if (node.children.length === 1 && node.children[0].kind === 'text') {
      const text = escapeText(node.children[0].text.trim())
      return `${spaces}<${node.tagName}${attrStr}>${text}</${node.tagName}>`
    }

    const childLines = node.children
      .map((child) => serializeNode(child, depth + 1, false))
      .filter((line) => line.trim().length > 0)
      .join('\n')

    return `${spaces}<${node.tagName}${attrStr}>\n${childLines}\n${spaces}</${node.tagName}>`
  }

  return serializeNode(document.root, 0, true)
}

function extractSvgCodeFromLayer(layer: SvgVisualLayer): string {
  if (layer.document) {
    try {
      return formatManagedSvgDocument(layer.document)
    } catch {
      // Fallback below
    }
  }

  if (layer.assetRef && layer.assetRef.startsWith('data:image/svg+xml')) {
    try {
      const commaIndex = layer.assetRef.indexOf(',')
      if (commaIndex !== -1) {
        const payload = layer.assetRef.slice(commaIndex + 1)
        const decoded = decodeURIComponent(payload)
        const parsed = parseManagedSvgSourceWithCompatibility(decoded)
        return formatManagedSvgDocument(parsed.document)
      }
    } catch {
      // Fallback below
    }
  }

  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">\n  <rect width="100" height="100" rx="8" fill="#1769aa" />\n</svg>'
}

function countElements(node: ManagedSvgNode): number {
  if (node.kind === 'text') return 0
  let count = 1
  for (const child of node.children) {
    count += countElements(child)
  }
  return count
}

function parseCssColorToRgb(input: string): { r: number; g: number; b: number } | null {
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

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
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

function hslToHex(h: number, s: number, l: number): string {
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

function isGenericNoiseId(id: string): boolean {
  if (!id) return true
  const lower = id.trim().toLowerCase()
  return /^(?:svg|rect|path|g|shape|layer|cls|st|id)[-_]?[0-9]+$/i.test(lower)
}

export function refactorSvgCode(rawCode: string): { refactored: string; summary: string } {
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') {
    throw new Error('当前环境不支持 SVG DOM 解析')
  }

  // Pre-process through compatibility parser to strip dangerous doctypes and inline stylesheet metadata safely
  const compatParsed = parseManagedSvgSourceWithCompatibility(rawCode)
  const cleanXml = formatManagedSvgDocument(compatParsed.document)

  const parser = new DOMParser()
  const doc = parser.parseFromString(cleanXml, 'image/svg+xml')
  const parserError = doc.querySelector('parsererror')
  if (parserError) {
    throw new Error('SVG XML 语法解析失败')
  }

  const svg = doc.querySelector('svg')
  if (!svg) {
    throw new Error('未找到根 <svg> 元素')
  }

  let strippedAttrsCount = 0
  let strippedIdsCount = 0
  let unnestedGroupsCount = 0

  // 1. Remove redundant root attributes
  const rootAttrsToRemove = ['x', 'y', 'version', 'xml:space', 'xmlns:xlink']
  for (const attr of rootAttrsToRemove) {
    if (svg.hasAttribute(attr)) {
      svg.removeAttribute(attr)
      strippedAttrsCount++
    }
  }

  // Strip enable-background from style
  const svgStyle = svg.getAttribute('style')
  if (svgStyle && /enable-background/i.test(svgStyle)) {
    const nextStyle = svgStyle.replace(/enable-background:\s*new\s*[^;]+;?/gi, '').trim()
    if (nextStyle) {
      svg.setAttribute('style', nextStyle)
    } else {
      svg.removeAttribute('style')
    }
    strippedAttrsCount++
  }

  const allElements = Array.from(svg.querySelectorAll('*'))

  // 2. Scheme-1 Detection: Identify elements with mask or clip-path and fill color (Dynamic Color Slots)
  const scheme1SlotElements = new Set<Element>()
  const candidateSlots: {
    el: Element
    fill: string
    lightness: number
    existingId: string | null
    existingDesc: string | null
  }[] = []

  for (const el of allElements) {
    const isInsideDefs = Boolean(el.closest('defs'))
    if (isInsideDefs) continue

    const maskAttr = el.getAttribute('mask') || el.getAttribute('clip-path')
    const fillAttr = el.getAttribute('fill')?.trim()
    const isMaskUrl = Boolean(maskAttr && /url\(#.+?\)/i.test(maskAttr))

    if (isMaskUrl && fillAttr && fillAttr !== 'none' && fillAttr !== 'transparent') {
      const rgb = parseCssColorToRgb(fillAttr)
      const lightness = rgb ? rgbToHsl(rgb.r, rgb.g, rgb.b).l : 0.5
      const existingId = el.getAttribute('id')
      const existingDesc = el.getAttribute('description') || el.getAttribute('data-description')
      candidateSlots.push({
        el,
        fill: fillAttr,
        lightness,
        existingId,
        existingDesc,
      })
      scheme1SlotElements.add(el)
    }
  }

  if (candidateSlots.length > 0) {
    // Sort candidate slots by lightness descending (lighter = primary/highlight slot, darker = shadow/secondary slot)
    candidateSlots.sort((a, b) => b.lightness - a.lightness)

    candidateSlots.forEach((slot, index) => {
      const { el, existingId, existingDesc } = slot
      // If element has no ID or has generic noisy machine ID, assign semantic colorSlot ID
      if (!existingId || isGenericNoiseId(existingId)) {
        const nextId = candidateSlots.length === 1
          ? 'colorSlot'
          : index === 0
            ? 'colorSlot1'
            : index === 1
              ? 'colorSlot2'
              : `colorSlot${index + 1}`
        el.setAttribute('id', nextId)
      }

      // If element doesn't have description, inject helpful default description
      if (!existingDesc) {
        const desc = candidateSlots.length === 1
          ? '动态色槽（基于蒙版）'
          : index === 0
            ? '动态主受光色槽（基于蒙版）'
            : index === 1
              ? '动态背光阴影色槽（基于蒙版）'
              : `动态色槽 ${index + 1}（基于蒙版）`
        el.setAttribute('description', desc)
      }
    })
  }

  // 3. ID Pruning:
  // - Protect <g>, root <svg>, and resource tags in <defs>
  // - Protect Scheme-1 dynamic color slots (MUST NOT be stripped!)
  // - Protect elements that already have explicit user descriptions
  // - Strip IDs from all other leaf shapes (paths, rects, text, etc.)
  const RESOURCE_TAGS = new Set([
    'lineargradient',
    'radialgradient',
    'clippath',
    'pattern',
    'mask',
    'filter',
    'marker',
    'symbol',
  ])

  for (const el of allElements) {
    const tagName = el.tagName.toLowerCase()
    const isInsideDefs = Boolean(el.closest('defs'))
    const isResource = RESOURCE_TAGS.has(tagName) || isInsideDefs
    const isScheme1Slot = scheme1SlotElements.has(el)
    const hasExplicitDesc = el.hasAttribute('description') || el.hasAttribute('data-description')

    if (tagName !== 'g' && !isResource && !isScheme1Slot && !hasExplicitDesc) {
      if (el.hasAttribute('id')) {
        el.removeAttribute('id')
        strippedIdsCount++
      }
    }

    const style = el.getAttribute('style')
    if (style && /enable-background/i.test(style)) {
      const nextStyle = style.replace(/enable-background:\s*new\s*[^;]+;?/gi, '').trim()
      if (nextStyle) {
        el.setAttribute('style', nextStyle)
      } else {
        el.removeAttribute('style')
      }
      strippedAttrsCount++
    }
  }

  // 4. Flatten/unwrap single-child empty <g> elements repeatedly
  let changed = true
  let passes = 0
  while (changed && passes < 10) {
    changed = false
    passes++
    const groups = Array.from(svg.querySelectorAll('g'))
    for (const g of groups) {
      const hasMeaningfulAttrs = Array.from(g.attributes).some(
        (a) => !a.name.startsWith('data-scada-')
      )
      if (!hasMeaningfulAttrs) {
        if (g.children.length === 0 && !g.textContent?.trim()) {
          g.remove()
          unnestedGroupsCount++
          changed = true
        } else if (g.children.length === 1 && !g.textContent?.trim()) {
          const child = g.children[0]
          g.replaceWith(child)
          unnestedGroupsCount++
          changed = true
        }
      }
    }
  }

  // 5. Multi-path HSL Color Clustering (for vector SVGs without masks)
  let clusteredClassesCount = 0
  if (candidateSlots.length === 0) {
    const chromaticShapes: { el: Element; fill: string; h: number; s: number; l: number }[] = []
    for (const el of allElements) {
      const tagName = el.tagName.toLowerCase()
      if (el.closest('defs')) continue
      if (!['path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline'].includes(tagName)) continue

      const fill = el.getAttribute('fill')?.trim()
      if (
        fill &&
        fill !== 'none' &&
        fill !== 'transparent' &&
        fill !== 'inherit' &&
        fill !== 'currentColor' &&
        !fill.startsWith('url(')
      ) {
        const rgb = parseCssColorToRgb(fill)
        if (rgb) {
          const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b)
          // Filter out neutral/achromatic (shadows/highlights: very low saturation or near-black/near-white)
          // Adaptive threshold cleanly isolates painted body and anti-aliased edge transitions:
          // Warm body tones (H <= 35 or H >= 340) use S >= 0.12 to capture feathered edge transitions without touching steel (S <= 0.05).
          const isWarm = hsl.h <= 35 || hsl.h >= 340
          const minS = isWarm ? 0.12 : 0.20
          if (hsl.s >= minS && hsl.l >= 0.05 && hsl.l <= 0.95) {
            chromaticShapes.push({ el, fill, ...hsl })
          }
        }
      }
    }

    if (chromaticShapes.length >= 3) {
      // Find dominant hue bucket
      const hueBuckets = [0, 0, 0, 0, 0, 0, 0, 0]
      for (const item of chromaticShapes) {
        const bucket = Math.floor(item.h / 45) % 8
        hueBuckets[bucket]++
      }
      let dominantBucket = 0
      let maxBucketCount = 0
      for (let i = 0; i < 8; i++) {
        if (hueBuckets[i] > maxBucketCount) {
          maxBucketCount = hueBuckets[i]
          dominantBucket = i
        }
      }
      const centerHue = dominantBucket * 45 + 22.5

      const clusterMembers = chromaticShapes.filter((item) => {
        let diff = Math.abs(item.h - centerHue)
        if (diff > 180) diff = 360 - diff
        return diff <= 45
      })

      if (clusterMembers.length >= 3) {
        // Group cluster members by distinct fill colors to preserve the exact tonal ladder (shadow, midtone, highlight)
        const uniqueFills = Array.from(new Set(clusterMembers.map((item) => item.fill.toLowerCase())))
        const fillStats = uniqueFills
          .map((fill) => {
            const members = clusterMembers.filter((m) => m.fill.toLowerCase() === fill)
            const avgL = members.reduce((sum, m) => sum + m.l, 0) / members.length
            return { fill, avgL, count: members.length }
          })
          .sort((a, b) => a.avgL - b.avgL)

        // Determine class map by distinct tonal levels:
        const fillToClassMap = new Map<string, { className: string; description: string }>()
        if (fillStats.length === 1) {
          fillToClassMap.set(fillStats[0].fill, {
            className: 'scada-theme-base',
            description: '动态主体固有色槽',
          })
        } else if (fillStats.length === 2) {
          fillToClassMap.set(fillStats[0].fill, {
            className: 'scada-theme-dark',
            description: '动态背光阴影色槽',
          })
          fillToClassMap.set(fillStats[1].fill, {
            className: 'scada-theme-light',
            description: '动态主受光色槽',
          })
        } else if (fillStats.length === 3) {
          fillToClassMap.set(fillStats[0].fill, {
            className: 'scada-theme-dark',
            description: '动态背光阴影色槽 (暗部)',
          })
          fillToClassMap.set(fillStats[1].fill, {
            className: 'scada-theme-base',
            description: '动态主体固有色槽 (中间调)',
          })
          fillToClassMap.set(fillStats[2].fill, {
            className: 'scada-theme-light',
            description: '动态受光高光色槽 (亮部)',
          })
        } else {
          // >= 4 distinct tonal steps: 5-tier balanced tonal hierarchy
          for (const stat of fillStats) {
            let className = 'scada-theme-base'
            let description = '动态主体固有色槽 (基准面)'
            const l = stat.avgL
            if (l < 0.20) {
              className = 'scada-theme-deep'
              description = '动态深影色槽 (底面与深凹阴影)'
            } else if (l < 0.35) {
              className = 'scada-theme-dark'
              description = '动态暗部色槽 (肋片凹槽与阴影)'
            } else if (l < 0.46) {
              className = 'scada-theme-base'
              description = '动态主体固有色槽 (曲面主色)'
            } else if (l < 0.54) {
              className = 'scada-theme-light'
              description = '动态受光色槽 (受光过渡面)'
            } else {
              className = 'scada-theme-highlight'
              description = '动态高光色槽 (反光与凸出棱线)'
            }
            fillToClassMap.set(stat.fill, { className, description })
          }
        }

        for (const item of clusterMembers) {
          const mapping = fillToClassMap.get(item.fill.toLowerCase())
          if (!mapping) continue
          const currentClass = item.el.getAttribute('class') || ''
          const classes = currentClass
            .split(/\s+/)
            .filter((c) => Boolean(c) && !c.startsWith('scada-theme-'))
          classes.push(mapping.className)
          item.el.setAttribute('class', classes.join(' '))
          if (!item.el.hasAttribute('description')) {
            item.el.setAttribute('description', mapping.description)
          }
          clusteredClassesCount++
        }
      }
    }
  }

  // 6. Dominant Fill Hoisting (only when not Scheme-1 slot architecture)
  let hoistedCount = 0
  let dominantFill: string | null = null
  if (candidateSlots.length === 0) {
    const shapeElements = Array.from(
      svg.querySelectorAll('path, rect, circle, ellipse, polygon, polyline')
    )
    const fillCounts = new Map<string, number>()
    for (const shape of shapeElements) {
      const fill = shape.getAttribute('fill')?.trim()
      if (
        fill &&
        fill !== 'none' &&
        fill !== 'transparent' &&
        fill !== 'inherit' &&
        fill !== 'currentColor' &&
        !fill.startsWith('url(')
      ) {
        const normalized = fill.toLowerCase()
        fillCounts.set(normalized, (fillCounts.get(normalized) ?? 0) + 1)
      }
    }

    let maxCount = 0
    for (const [fill, count] of fillCounts.entries()) {
      if (count > maxCount) {
        maxCount = count
        dominantFill = fill
      }
    }

    if (dominantFill && (maxCount >= 2 || (shapeElements.length === 1 && maxCount === 1))) {
      svg.setAttribute('fill', dominantFill)
      for (const shape of shapeElements) {
        const fill = shape.getAttribute('fill')?.trim().toLowerCase()
        if (fill === dominantFill) {
          shape.removeAttribute('fill')
          hoistedCount++
        }
      }
    }
  }

  // 7. Serialize and format cleanly
  const serializer = new XMLSerializer()
  const serialized = serializer.serializeToString(svg)
  const finalParsed = parseManagedSvgSourceWithCompatibility(serialized)
  const formatted = formatManagedSvgDocument(finalParsed.document)

  const summaryParts: string[] = []
  if (candidateSlots.length > 0) {
    summaryParts.push(`已自动提炼与规范化 ${candidateSlots.length} 个方案一动态色槽（蒙版关联并注入说明）`)
  }
  if (clusteredClassesCount > 0) {
    summaryParts.push(
      `已按 HSL 色彩明度聚类 ${clusteredClassesCount} 处矢量路径并建立多阶光影色槽`,
    )
  }
  if (dominantFill && hoistedCount > 0) {
    summaryParts.push(`提取主色 ${dominantFill} 至根节点（优化 ${hoistedCount} 处填色继承）`)
  }
  if (strippedIdsCount > 0) {
    summaryParts.push(`擦除 ${strippedIdsCount} 个非分组冗余子零件 ID`)
  }
  if (strippedAttrsCount > 0) {
    summaryParts.push(`清除 ${strippedAttrsCount} 项冗余元数据与样式`)
  }
  if (unnestedGroupsCount > 0) {
    summaryParts.push(`扁平化 ${unnestedGroupsCount} 个冗余分组`)
  }
  const summary = summaryParts.length > 0 ? summaryParts.join('，') : '代码结构已规范排版'

  return {
    refactored: formatted,
    summary,
  }
}

export type SvgTagInfo = {
  name: string
  type: 'id' | 'class'
  tagName: string
  count: number
  tagId?: string
  classes?: string[]
  description?: string
}

export function findNodeByTagId(node: ManagedSvgNode, tagId: string): ManagedSvgElement | null {
  if (node.kind === 'text') return null
  if (node.tagId === tagId) return node
  for (const child of node.children) {
    const found = findNodeByTagId(child, tagId)
    if (found) return found
  }
  return null
}

export function extractSvgTagsFromDocument(document: ManagedSvgDocument): SvgTagInfo[] {
  const idMap = new Map<
    string,
    { tagName: string; tagId: string; classes: string[]; description?: string }
  >()
  const classMap = new Map<
    string,
    { tagName: string; tagId: string; count: number; description?: string }
  >()

  function visit(node: ManagedSvgNode, isRoot: boolean) {
    if (node.kind === 'text') return

    const idAttr = node.attributes.find((a) => a.name === 'id')?.value || node.authorRef
    const classAttr = node.attributes.find((a) => a.name === 'class')?.value
    const descAttr =
      node.attributes.find((a) => a.name === 'description' || a.name === 'data-description')?.value ||
      undefined
    const classes = classAttr ? classAttr.trim().split(/\s+/).filter(Boolean) : []

    if (idAttr) {
      idMap.set(idAttr, {
        tagName: node.tagName,
        tagId: node.tagId,
        classes,
        description: descAttr,
      })
    }

    if (!isRoot && classAttr) {
      for (const cls of classes) {
        if (!classMap.has(cls)) {
          classMap.set(cls, {
            tagName: node.tagName,
            tagId: node.tagId,
            count: 1,
            description: descAttr,
          })
        } else {
          const entry = classMap.get(cls)!
          entry.count++
          if (!entry.description && descAttr) {
            entry.description = descAttr
          }
        }
      }
    }

    for (const child of node.children) {
      visit(child, false)
    }
  }

  visit(document.root, true)

  const tags: SvgTagInfo[] = []
  for (const [name, info] of idMap.entries()) {
    tags.push({
      name,
      type: 'id',
      tagName: info.tagName,
      count: 1,
      tagId: info.tagId,
      classes: info.classes,
      description: info.description,
    })
  }
  for (const [name, info] of classMap.entries()) {
    tags.push({
      name,
      type: 'class',
      tagName: info.tagName,
      count: info.count,
      tagId: info.tagId,
      description: info.description,
    })
  }

  return tags.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'id' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

export type SvgCodeLocation = {
  tagId: string
  tagName: string
  startLine: number
  endLine: number
  startIndex: number
  endIndex: number
}

export function locateSvgElementInCode(
  code: string,
  targetTagId: string,
  document: ManagedSvgDocument,
): SvgCodeLocation | null {
  if (!code || !targetTagId || !document?.root) return null

  // 1. Flatten all elements from document in depth-first pre-order traversal
  const astElements: ManagedSvgElement[] = []
  function traverse(node: ManagedSvgNode) {
    if (node.kind === 'text') return
    astElements.push(node)
    for (const child of node.children) {
      traverse(child)
    }
  }
  traverse(document.root)

  const targetIndex = astElements.findIndex((el) => el.tagId === targetTagId)
  if (targetIndex === -1) return null
  const targetAstNode = astElements[targetIndex]

  // 2. Scan XML tags in `code` in depth-first pre-order
  const ranges: { elementIndex: number; tagName: string; startIndex: number; endIndex: number }[] = []
  let elementCounter = 0
  const stack: { elementIndex: number; tagName: string; startIndex: number }[] = []

  let i = 0
  while (i < code.length) {
    if (code.startsWith('<!--', i)) {
      const end = code.indexOf('-->', i + 4)
      i = end === -1 ? code.length : end + 3
      continue
    }
    if (code.startsWith('<![CDATA[', i)) {
      const end = code.indexOf(']]>', i + 9)
      i = end === -1 ? code.length : end + 3
      continue
    }
    if (code.startsWith('<?', i)) {
      const end = code.indexOf('?>', i + 2)
      i = end === -1 ? code.length : end + 2
      continue
    }
    if (code.startsWith('<!', i)) {
      const end = code.indexOf('>', i + 2)
      i = end === -1 ? code.length : end + 1
      continue
    }

    if (code.startsWith('</', i)) {
      const closeMatch = code.slice(i).match(/^<\/([a-zA-Z0-9:-]+)\s*>/)
      if (closeMatch) {
        const closingTagEnd = i + closeMatch[0].length
        const closingTagName = closeMatch[1].toLowerCase()
        let foundIdx = -1
        for (let s = stack.length - 1; s >= 0; s--) {
          if (stack[s].tagName.toLowerCase() === closingTagName) {
            foundIdx = s
            break
          }
        }
        if (foundIdx !== -1) {
          const openTag = stack[foundIdx]
          ranges.push({
            elementIndex: openTag.elementIndex,
            tagName: openTag.tagName,
            startIndex: openTag.startIndex,
            endIndex: closingTagEnd,
          })
          stack.splice(foundIdx, 1)
        }
        i = closingTagEnd
        continue
      }
    }

    if (code[i] === '<') {
      const openMatch = code.slice(i).match(/^<([a-zA-Z][a-zA-Z0-9:-]*)/)
      if (openMatch) {
        const tagName = openMatch[1]
        const tagStartIndex = i
        let j = i + openMatch[0].length
        let inQuote: '"' | "'" | null = null
        let isSelfClosing = false
        while (j < code.length) {
          const ch = code[j]
          if (inQuote) {
            if (ch === inQuote) {
              inQuote = null
            }
          } else {
            if (ch === '"' || ch === "'") {
              inQuote = ch
            } else if (code.startsWith('/>', j)) {
              isSelfClosing = true
              j += 2
              break
            } else if (ch === '>') {
              j += 1
              break
            }
          }
          j++
        }

        const currentElementIndex = elementCounter++
        if (isSelfClosing) {
          ranges.push({
            elementIndex: currentElementIndex,
            tagName,
            startIndex: tagStartIndex,
            endIndex: j,
          })
        } else {
          stack.push({
            elementIndex: currentElementIndex,
            tagName,
            startIndex: tagStartIndex,
          })
        }

        i = j
        continue
      }
    }

    i++
  }

  for (const openTag of stack) {
    ranges.push({
      elementIndex: openTag.elementIndex,
      tagName: openTag.tagName,
      startIndex: openTag.startIndex,
      endIndex: code.length,
    })
  }

  // 3. Match by AST pre-order index
  const matchedRange = ranges.find((r) => r.elementIndex === targetIndex)
  if (matchedRange) {
    const textBefore = code.slice(0, matchedRange.startIndex)
    const matchText = code.slice(0, matchedRange.endIndex)
    const startLine = textBefore.split('\n').length
    const endLine = matchText.split('\n').length
    return {
      tagId: targetTagId,
      tagName: matchedRange.tagName,
      startLine,
      endLine,
      startIndex: matchedRange.startIndex,
      endIndex: matchedRange.endIndex,
    }
  }

  // Fallback: search by id attribute if element order shifted
  const targetId = targetAstNode.attributes.find((a) => a.name === 'id')?.value
  if (targetId) {
    const pattern = new RegExp(`<${targetAstNode.tagName}[^>]*\\bid=["']${targetId}["'][^>]*>`, 'i')
    const match = pattern.exec(code)
    if (match) {
      const startIndex = match.index
      const endIndex = match.index + match[0].length
      const startLine = code.slice(0, startIndex).split('\n').length
      const endLine = code.slice(0, endIndex).split('\n').length
      return {
        tagId: targetTagId,
        tagName: targetAstNode.tagName,
        startLine,
        endLine,
        startIndex,
        endIndex,
      }
    }
  }

  return null
}

export type SvgLayerMarker = {
  tagId: string
  id: string
  className?: string
  tagName: string
  x: number
  y: number
  description?: string
}

const TAG_TYPE_ITEMS: Array<SegmentedControlItem<'id' | 'class'>> = [
  { value: 'id', label: '# ID (单例零件)' },
  { value: 'class', label: '. Class (集合分类)' },
  ]

type SelectedElementTagInfo = {
  tagId: string
  tagName: string
  existingId: string
  existingClass: string
  existingDescription?: string
}

export function ComponentSvgSourceEditor({
  layer,
  readOnly,
  onChange,
}: ComponentSvgSourceEditorProps) {
  const [code, setCode] = useState(() => extractSvgCodeFromLayer(layer))
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isRefactoring, setIsRefactoring] = useState(false)

  // Interactive element tagging state
  const [selectedElement, setSelectedElement] = useState<SelectedElementTagInfo | null>(null)
  const [tagType, setTagType] = useState<'id' | 'class'>('id')
  const [tagNameInput, setTagNameInput] = useState('')
  const [tagDescriptionInput, setTagDescriptionInput] = useState('')
  const [tagError, setTagError] = useState<string | null>(null)
  const [copiedTag, setCopiedTag] = useState<string | null>(null)
  const [tagSearchQuery, setTagSearchQuery] = useState('')
  const [isSearchOpen, setIsSearchOpen] = useState(false)

  // On-canvas layer markers state
  const previewGraphicWrapperRef = useRef<HTMLDivElement>(null)
  const previewGraphicRef = useRef<HTMLDivElement>(null)
  const [layerMarkers, setLayerMarkers] = useState<SvgLayerMarker[]>([])
  const [showMarkers, setShowMarkers] = useState(true)
  const [hoveredTagId, setHoveredTagId] = useState<string | null>(null)

  // Class dynamic styling simulation state
  const [classStyleOverrides, setClassStyleOverrides] = useState<Record<string, string>>({})
  const [showClassStyleBar, setShowClassStyleBar] = useState(true)
  const [hoveredClassName, setHoveredClassName] = useState<string | null>(null)
  const [masterColor, setMasterColor] = useState<string>('#0bbc63')

  const lineNumbersRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [textareaScrollTop, setTextareaScrollTop] = useState(0)

  // Sync external changes
  useEffect(() => {
    const nextCode = extractSvgCodeFromLayer(layer)
    setCode(nextCode)
    setError(null)
    setMessage(null)
    setIsDirty(false)
  }, [layer.id, layer.document, layer.assetRef])

  const validationResult = useMemo(() => {
    try {
      const parsed = parseManagedSvgSourceWithCompatibility(code)
      return {
        valid: true,
        document: parsed.document,
        elementCount: countElements(parsed.document.root),
        previewUrl: serializeManagedSvgDataUrl(parsed.document),
        svgMarkup: serializeManagedSvgDocument(parsed.document),
        error: null,
      }
    } catch (err) {
      return {
        valid: false,
        document: null,
        elementCount: 0,
        previewUrl: null,
        svgMarkup: null,
        error: err instanceof Error ? err.message : 'SVG 代码解析失败',
      }
    }
  }, [code])

  const lineCount = useMemo(() => code.split('\n').length, [code])

  // Extract distinct CSS classes and their initial fill colors from the current SVG document
  const detectedClasses = useMemo(() => {
    if (!validationResult.valid || !validationResult.document) return []
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

    walk(validationResult.document.root)

    const THEME_ORDER: Record<string, number> = {
      'scada-theme-highlight': 1,
      'scada-theme-light': 2,
      'scada-theme-base': 3,
      'scada-theme-dark': 4,
      'scada-theme-deep': 5,
    }

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
  }, [validationResult])

  // Locate the exact code span and line numbers for the currently marked element
  const highlightLocation = useMemo(() => {
    if (!selectedElement || !validationResult.valid || !validationResult.document) {
      return null
    }
    return locateSvgElementInCode(code, selectedElement.tagId, validationResult.document)
  }, [code, selectedElement, validationResult])

  // Auto-scroll the code editor to bring the highlighted element into clear view
  useEffect(() => {
    if (!highlightLocation || !textareaRef.current) return

    const lineHeight = 20
    const topPadding = 8
    const targetTop = Math.max(0, topPadding + (highlightLocation.startLine - 4) * lineHeight)

    textareaRef.current.scrollTo({
      top: targetTop,
      behavior: 'smooth',
    })

    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = targetTop
    }
    setTextareaScrollTop(targetTop)

    try {
      textareaRef.current.setSelectionRange(
        highlightLocation.startIndex,
        highlightLocation.endIndex,
      )
    } catch {
      // Ignore if selection fails
    }
  }, [highlightLocation])

  // Calculate pixel coordinates for on-canvas layer ID/Class markers
  const updateLayerMarkers = useCallback(() => {
    const wrapper = previewGraphicWrapperRef.current
    const graphic = previewGraphicRef.current
    if (!wrapper || !graphic) {
      setLayerMarkers([])
      return
    }

    const svg = graphic.querySelector('svg')
    if (!svg) {
      setLayerMarkers([])
      return
    }

    const wrapperRect = wrapper.getBoundingClientRect()
    if (wrapperRect.width <= 0 || wrapperRect.height <= 0) {
      return
    }

    const elementsWithId = svg.querySelectorAll<SVGGraphicsElement>('[id]')
    const markers: SvgLayerMarker[] = []

    const IGNORED_TAGS = new Set([
      'svg',
      'defs',
      'lineargradient',
      'radialgradient',
      'clippath',
      'filter',
      'mask',
      'style',
      'script',
    ])

    for (const el of Array.from(elementsWithId)) {
      const tagName = el.tagName.toLowerCase()
      if (IGNORED_TAGS.has(tagName)) continue

      const id = el.getAttribute('id')?.trim()
      if (!id) continue

      const rawClass = el.getAttribute('class')?.trim() || ''
      const className = rawClass.replace(/\bis-active-highlight\b/g, '').trim() || undefined
      const tagId = el.getAttribute('data-scada-tag') || ''
      const description =
        el.getAttribute('description')?.trim() ||
        el.getAttribute('data-description')?.trim() ||
        undefined

      try {
        const elRect = el.getBoundingClientRect()
        if (elRect.width > 0 || elRect.height > 0) {
          markers.push({
            tagId,
            id,
            className,
            tagName,
            x: Math.round(elRect.left - wrapperRect.left),
            y: Math.max(0, Math.round(elRect.top - wrapperRect.top)),
            description,
          })
        }
      } catch {
        // Fallback for headless environments
      }
    }

    // Collision adjustment: offset overlapping tags vertically
    markers.sort((a, b) => a.y - b.y || a.x - b.x)
    for (let i = 0; i < markers.length; i++) {
      for (let j = i + 1; j < markers.length; j++) {
        const m1 = markers[i]
        const m2 = markers[j]
        if (Math.abs(m1.x - m2.x) < 48 && Math.abs(m1.y - m2.y) < 22) {
          m2.y = m1.y + 22
        }
      }
    }

    setLayerMarkers(markers)
  }, [])

  // Re-measure markers when modal opens, resizes, or SVG updates
  useEffect(() => {
    if (!isModalOpen) return

    let animationFrameId: number
    const scheduleUpdate = () => {
      cancelAnimationFrame(animationFrameId)
      animationFrameId = requestAnimationFrame(() => {
        updateLayerMarkers()
      })
    }

    scheduleUpdate()

    const wrapper = previewGraphicWrapperRef.current
    let observer: ResizeObserver | null = null
    if (wrapper && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        scheduleUpdate()
      })
      observer.observe(wrapper)
    }

    window.addEventListener('resize', scheduleUpdate)

    return () => {
      cancelAnimationFrame(animationFrameId)
      observer?.disconnect()
      window.removeEventListener('resize', scheduleUpdate)
    }
  }, [isModalOpen, isFullscreen, validationResult.svgMarkup, updateLayerMarkers])

  // Sync active hover / selection highlight on the actual SVG DOM element without mutating class
  useEffect(() => {
    const activeId = hoveredTagId || selectedElement?.tagId
    const container = previewGraphicRef.current
    if (!container) return

    const prev = container.querySelectorAll('[data-scada-active-highlight], .is-active-highlight')
    for (const el of Array.from(prev)) {
      el.removeAttribute('data-scada-active-highlight')
      el.classList.remove('is-active-highlight')
    }

    if (activeId) {
      const target = container.querySelector(`[data-scada-tag="${activeId}"]`)
      if (target) {
        target.setAttribute('data-scada-active-highlight', 'true')
      }
    }
  }, [hoveredTagId, selectedElement?.tagId])

  function handleCodeChange(newCode: string) {
    setCode(newCode)
    setIsDirty(true)
    setMessage(null)
    if (error) {
      setError(null)
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Tab') {
      event.preventDefault()
      const textarea = event.currentTarget
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const value = textarea.value
      const nextValue = value.substring(0, start) + '  ' + value.substring(end)
      handleCodeChange(nextValue)
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2
      })
    } else if ((event.ctrlKey || event.metaKey) && event.key === 's') {
      event.preventDefault()
      handleSave()
    }
  }

  function handleSave(): boolean {
    if (readOnly) return false
    try {
      const parsed = parseManagedSvgSourceWithCompatibility(code)
      const newAssetRef = serializeManagedSvgDataUrl(parsed.document)
      onChange({
        ...layer,
        document: parsed.document,
        assetRef: newAssetRef,
      })
      setError(null)
      setMessage('✓ SVG 代码已成功保存至图层')
      setIsDirty(false)
      return true
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'SVG 源码格式无效'
      setError(errorMsg)
      setMessage(null)
      return false
    }
  }

  function handleApplyAndClose() {
    if (isDirty) {
      const success = handleSave()
      if (success) {
        setIsModalOpen(false)
      }
    } else {
      setIsModalOpen(false)
    }
  }

  function handleRefactor() {
    if (readOnly || isRefactoring) return
    setIsRefactoring(true)
    setError(null)
    setTimeout(() => {
      try {
        const { refactored, summary } = refactorSvgCode(code)
        setCode(refactored)
        setIsDirty(true)
        setMessage(`✓ ${summary}`)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : '重构失败：SVG 代码无效')
      } finally {
        setIsRefactoring(false)
      }
    }, 350)
  }

  function handleReset() {
    const initial = extractSvgCodeFromLayer(layer)
    setCode(initial)
    setError(null)
    setMessage(null)
    setIsDirty(false)
    setClassStyleOverrides({})
  }

  function handleApplyPreset(preset: 'running' | 'alarm' | 'warning' | 'offline' | 'standby') {
    const nextOverrides: Record<string, string> = { ...classStyleOverrides }

    const PRESET_MAP = {
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
    }

    const config = PRESET_MAP[preset]

    for (const cls of detectedClasses) {
      const initialRgb = cls.initialColor ? parseCssColorToRgb(cls.initialColor) : null
      const initialHsl = initialRgb ? rgbToHsl(initialRgb.r, initialRgb.g, initialRgb.b) : null

      if (initialHsl) {
        // Contrast-preserving dynamic harmonic mapping: preserve the tier's original lightness
        nextOverrides[cls.name] = hslToHex(config.h, config.s, initialHsl.l)
      } else if (cls.name === 'scada-theme-highlight') {
        nextOverrides[cls.name] = config.highlight
      } else if (cls.name === 'scada-theme-light') {
        nextOverrides[cls.name] = config.light
      } else if (cls.name === 'scada-theme-base') {
        nextOverrides[cls.name] = config.base
      } else if (cls.name === 'scada-theme-dark') {
        nextOverrides[cls.name] = config.dark
      } else if (cls.name === 'scada-theme-deep') {
        nextOverrides[cls.name] = config.deep
      } else {
        nextOverrides[cls.name] = config.generic
      }
    }

    setMasterColor(config.base)
    setClassStyleOverrides(nextOverrides)
  }

  function handleMasterColorChange(newColor: string) {
    setMasterColor(newColor)
    const masterRgb = parseCssColorToRgb(newColor)
    if (!masterRgb) return
    const masterHsl = rgbToHsl(masterRgb.r, masterRgb.g, masterRgb.b)

    const nextOverrides: Record<string, string> = { ...classStyleOverrides }
    for (const cls of detectedClasses) {
      const initialRgb = cls.initialColor ? parseCssColorToRgb(cls.initialColor) : null
      if (initialRgb) {
        const initialHsl = rgbToHsl(initialRgb.r, initialRgb.g, initialRgb.b)
        nextOverrides[cls.name] = hslToHex(masterHsl.h, masterHsl.s, initialHsl.l)
      } else {
        nextOverrides[cls.name] = newColor
      }
    }
    setClassStyleOverrides(nextOverrides)
  }

  function handleResetClassStyles() {
    setClassStyleOverrides({})
    setMasterColor('#0bbc63')
  }

  function handleClassColorChange(className: string, color: string) {
    setClassStyleOverrides((prev) => ({
      ...prev,
      [className]: color,
    }))
  }

  function handleBakeClassStylesToCode() {
    if (Object.keys(classStyleOverrides).length === 0) return
    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(code, 'image/svg+xml')
      if (doc.querySelector('parsererror')) {
        setError('无法写入：SVG 源码当前存在语法错误')
        return
      }

      let modifiedCount = 0
      for (const [clsName, color] of Object.entries(classStyleOverrides)) {
        const elements = doc.querySelectorAll(`.${clsName}`)
        const clsInfo = detectedClasses.find((c) => c.name === clsName)
        const baselineColor = clsInfo?.initialColor || color
        const baseRgb = parseCssColorToRgb(baselineColor)
        const baseHsl = baseRgb ? rgbToHsl(baseRgb.r, baseRgb.g, baseRgb.b) : null
        const targetRgb = parseCssColorToRgb(color)
        const targetHsl = targetRgb ? rgbToHsl(targetRgb.r, targetRgb.g, targetRgb.b) : null

        elements.forEach((el) => {
          const currentFill = el.getAttribute('fill')?.trim() || ''
          let finalColor = color
          if (
            baseHsl &&
            targetHsl &&
            currentFill &&
            currentFill !== 'none' &&
            !currentFill.startsWith('url(')
          ) {
            const fillRgb = parseCssColorToRgb(currentFill)
            if (fillRgb) {
              const fillHsl = rgbToHsl(fillRgb.r, fillRgb.g, fillRgb.b)
              const deltaL = fillHsl.l - baseHsl.l
              const newL = Math.max(0.02, Math.min(0.98, targetHsl.l + deltaL))
              const satScale = baseHsl.s > 0.01 ? Math.min(1, fillHsl.s / baseHsl.s) : 1
              const newS = Math.max(0.02, Math.min(1, targetHsl.s * satScale))
              finalColor = hslToHex(targetHsl.h, newS, newL)
            }
          }

          el.setAttribute('fill', finalColor)
          const styleAttr = el.getAttribute('style')
          if (styleAttr && styleAttr.includes('fill:')) {
            const newStyle = styleAttr.replace(/fill:\s*[^;]+(;?)/, `fill: ${finalColor}$1`)
            el.setAttribute('style', newStyle)
          }
          modifiedCount++
        })
      }

      const serializer = new XMLSerializer()
      const newCode = serializer.serializeToString(doc)
      setCode(newCode)
      setIsDirty(true)
      setClassStyleOverrides({})
      setMessage(`✓ 已将当前模拟配色写入源码 (${modifiedCount} 个图元)，点击「保存」保存代码或「应用」更新图层`)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '写入源码失败')
    }
  }

  function handleScroll(event: React.UIEvent<HTMLTextAreaElement>) {
    const currentTop = event.currentTarget.scrollTop
    setTextareaScrollTop(currentTop)
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = currentTop
    }
  }

  function handleOpenTagInEditor(tag: SvgTagInfo) {
    setIsModalOpen(true)
    if (tag.type === 'class') {
      setShowClassStyleBar(true)
    }
    if (tag.tagId) {
      setSelectedElement({
        tagId: tag.tagId,
        tagName: tag.tagName,
        existingId: tag.type === 'id' ? tag.name : '',
        existingClass: tag.type === 'class' ? tag.name : '',
        existingDescription: tag.description || '',
      })
      setTagType(tag.type)
      setTagNameInput(tag.name)
      setTagDescriptionInput(tag.description || '')
      setTagError(null)
    }
  }

  const taggedElements = useMemo(() => {
    if (validationResult.valid && validationResult.document) {
      return extractSvgTagsFromDocument(validationResult.document)
    }
    return []
  }, [validationResult])

  const filteredTags = useMemo(() => {
    const q = tagSearchQuery.trim().toLowerCase()
    if (!q) return taggedElements
    return taggedElements.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q)) ||
        (t.classes && t.classes.some((c) => c.toLowerCase().includes(q))) ||
        t.tagName.toLowerCase().includes(q)
    )
  }, [taggedElements, tagSearchQuery])

  function handleCopyCode(codeText: string, name: string) {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(codeText).catch(() => {})
    }
    setCopiedTag(name)
    setTimeout(() => setCopiedTag(null), 1500)
  }

  function handleSelectElementByTagId(tagId: string) {
    if (readOnly) return
    const target = previewGraphicRef.current?.querySelector(`[data-scada-tag="${tagId}"]`)
    if (!target || target.tagName.toLowerCase() === 'svg') {
      setSelectedElement(null)
      return
    }

    const tagName = target.tagName.toLowerCase()
    const astNode = validationResult.document
      ? findNodeByTagId(validationResult.document.root, tagId)
      : null
    const existingId =
      (astNode
        ? astNode.attributes.find((a) => a.name === 'id')?.value || astNode.authorRef
        : target.getAttribute('id')) || ''
    const rawClass =
      (astNode
        ? astNode.attributes.find((a) => a.name === 'class')?.value
        : target.getAttribute('class')) || ''
    const existingClass = rawClass.replace(/\bis-active-highlight\b/g, '').trim()
    const existingDescription =
      (astNode
        ? astNode.attributes.find(
            (a) => a.name === 'description' || a.name === 'data-description'
          )?.value
        : target.getAttribute('description') || target.getAttribute('data-description')) || ''

    const defaultType: 'id' | 'class' = existingClass && !existingId ? 'class' : 'id'
    const defaultName =
      (defaultType === 'id' ? existingId : existingClass) || existingId || existingClass || ''

    setSelectedElement({
      tagId,
      tagName,
      existingId,
      existingClass,
      existingDescription,
    })
    setTagType(defaultType)
    setTagNameInput(defaultName)
    setTagDescriptionInput(existingDescription)
    setTagError(null)
  }

  function handlePreviewClick(event: React.MouseEvent<HTMLDivElement>) {
    if (readOnly) return
    const target = (event.target as Element).closest(
      'path, rect, circle, ellipse, polygon, polyline, g, text'
    )
    if (!target || target.tagName.toLowerCase() === 'svg') {
      setSelectedElement(null)
      return
    }

    event.stopPropagation()

    const tagId = target.getAttribute('data-scada-tag') || ''
    const tagName = target.tagName.toLowerCase()
    const astNode = validationResult.document
      ? findNodeByTagId(validationResult.document.root, tagId)
      : null
    const existingId =
      (astNode
        ? astNode.attributes.find((a) => a.name === 'id')?.value || astNode.authorRef
        : target.getAttribute('id')) || ''
    const rawClass =
      (astNode
        ? astNode.attributes.find((a) => a.name === 'class')?.value
        : target.getAttribute('class')) || ''
    const existingClass = rawClass.replace(/\bis-active-highlight\b/g, '').trim()
    const existingDescription =
      (astNode
        ? astNode.attributes.find(
            (a) => a.name === 'description' || a.name === 'data-description'
          )?.value
        : target.getAttribute('description') || target.getAttribute('data-description')) || ''

    const defaultType: 'id' | 'class' = existingClass && !existingId ? 'class' : 'id'
    const defaultName =
      (defaultType === 'id' ? existingId : existingClass) || existingId || existingClass || ''

    setSelectedElement({
      tagId,
      tagName,
      existingId,
      existingClass,
      existingDescription,
    })
    setTagType(defaultType)
    setTagNameInput(defaultName)
    setTagDescriptionInput(existingDescription)
    setTagError(null)
  }

  function handlePreviewMouseOver(event: React.MouseEvent<HTMLDivElement>) {
    const target = (event.target as Element).closest('[data-scada-tag]')
    if (target) {
      const tagId = target.getAttribute('data-scada-tag')
      setHoveredTagId(tagId)
    }
  }

  function handlePreviewMouseLeave() {
    setHoveredTagId(null)
  }

  function handleSaveTag() {
    if (!selectedElement) return
    const cleanName = tagNameInput.trim().replace(/[^a-zA-Z0-9_-]/g, '')
    if (!cleanName) {
      setTagError('请输入有效的标识符（支持字母、数字、下划线、短横线）')
      return
    }

    const cleanDesc = tagDescriptionInput.trim()

    try {
      const parsed = parseManagedSvgSourceWithCompatibility(code)
      const doc = parsed.document

      function updateNode(node: ManagedSvgNode): ManagedSvgNode {
        if (node.kind === 'text') return node
        if (node.tagId === selectedElement?.tagId) {
          const targetAttrName = tagType === 'id' ? 'id' : 'class'
          const filteredAttrs = node.attributes.filter(
            (a) =>
              a.name !== targetAttrName &&
              a.name !== 'description' &&
              a.name !== 'data-description'
          )
          const newAttrs = [...filteredAttrs, { name: targetAttrName, value: cleanName }]
          if (cleanDesc) {
            newAttrs.push({ name: 'description', value: cleanDesc })
          }
          return {
            ...node,
            ...(tagType === 'id' ? { authorRef: cleanName } : {}),
            attributes: newAttrs,
          }
        }
        return {
          ...node,
          children: node.children.map(updateNode),
        }
      }

      const updatedDoc: ManagedSvgDocument = {
        ...doc,
        root: updateNode(doc.root) as ManagedSvgElement,
      }

      const formatted = formatManagedSvgDocument(updatedDoc)
      setCode(formatted)
      setIsDirty(true)
      setMessage(
        `✓ 已为 <${selectedElement.tagName}> 设置 ${tagType === 'id' ? '#' : '.'}${cleanName}${
          cleanDesc ? ` (${cleanDesc})` : ''
        }`
      )
      setSelectedElement({
        tagId: selectedElement.tagId,
        tagName: selectedElement.tagName,
        existingId: tagType === 'id' ? cleanName : selectedElement.existingId,
        existingClass: tagType === 'class' ? cleanName : selectedElement.existingClass,
        existingDescription: cleanDesc,
      })
      setTagError(null)
    } catch (err) {
      setTagError(err instanceof Error ? err.message : '标记更新失败')
    }
  }

  function handleRemoveTag() {
    if (!selectedElement) return
    try {
      const parsed = parseManagedSvgSourceWithCompatibility(code)
      const doc = parsed.document

      function cleanNode(node: ManagedSvgNode): ManagedSvgNode {
        if (node.kind === 'text') return node
        if (node.tagId === selectedElement?.tagId) {
          const newAttrs = node.attributes.filter(
            (a) =>
              a.name !== 'id' &&
              a.name !== 'class' &&
              a.name !== 'description' &&
              a.name !== 'data-description'
          )
          const { authorRef: _ar, ...rest } = node
          return {
            ...rest,
            attributes: newAttrs,
          }
        }
        return {
          ...node,
          children: node.children.map(cleanNode),
        }
      }

      const updatedDoc: ManagedSvgDocument = {
        ...doc,
        root: cleanNode(doc.root) as ManagedSvgElement,
      }

      const formatted = formatManagedSvgDocument(updatedDoc)
      setCode(formatted)
      setIsDirty(true)
      setMessage(`✓ 已清除 <${selectedElement.tagName}> 上的标记与说明`)
      setSelectedElement({
        tagId: selectedElement.tagId,
        tagName: selectedElement.tagName,
        existingId: '',
        existingClass: '',
        existingDescription: '',
      })
      setTagNameInput('')
      setTagDescriptionInput('')
      setTagError(null)
    } catch (err) {
      setTagError(err instanceof Error ? err.message : '清除标记失败')
    }
  }

  return (
    <CollapsibleInspectorGroup
      title="SVG"
      defaultOpen={true}
      className="component-svg-inspector-group"
      extra={
        <Button
          size="small"
          variant="ghost"
          className="component-svg-header-code-btn"
          onClick={() => setIsModalOpen(true)}
          title="打开 SVG 源码与标记工作台"
          aria-label="打开 SVG 源码与标记工作台"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
        </Button>
      }
    >
      <div className="component-svg-source-editor">
        {taggedElements.length > 0 ? (
          <div className="component-svg-tag-list">
            <div className="component-svg-tag-list-header">
              <div className="component-svg-tag-list-header-left">
                <span className="component-svg-tag-list-title">已标记 DOM 标签</span>
                <span className="component-svg-tag-list-count">
                  {filteredTags.length}
                  {tagSearchQuery && `/${taggedElements.length}`} 个
                </span>
              </div>
              <Button
                size="small"
                variant="ghost"
                className={`component-svg-tag-search-btn${
                  isSearchOpen || tagSearchQuery ? ' is-active' : ''
                }`}
                onClick={() => {
                  setIsSearchOpen((prev) => !prev)
                  if (isSearchOpen && tagSearchQuery) {
                    setTagSearchQuery('')
                  }
                }}
                title={isSearchOpen ? '收起搜索' : '搜索标签'}
                aria-label="搜索标签"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </Button>
            </div>

            {(isSearchOpen || tagSearchQuery) && (
              <div className="component-svg-tag-search-bar">
                <Input
                  className="component-svg-tag-search-input"
                  value={tagSearchQuery}
                  onChange={(e) => setTagSearchQuery(e.target.value)}
                  placeholder="搜索 ID / Class / 说明..."
                  autoFocus
                />
                {tagSearchQuery && (
                  <Button
                    size="small"
                    variant="ghost"
                    className="component-svg-tag-search-clear"
                    onClick={() => setTagSearchQuery('')}
                    title="清空搜索"
                  >
                    ✕
                  </Button>
                )}
              </div>
            )}

            <div className="component-svg-tag-items">
              {filteredTags.map((tag) => {
                const accessCode = `$self.${layer.name}.${tag.name}`
                const isCopied = copiedTag === tag.name
                return (
                  <div
                    key={`${tag.type}-${tag.name}`}
                    className="component-svg-tag-card is-interactive"
                    onClick={() => handleOpenTagInEditor(tag)}
                    title="点击在编辑器中查看并高亮对应代码"
                  >
                    <div className="component-svg-tag-main">
                      <span className={`component-svg-type-pill is-${tag.type}`}>
                        {tag.type === 'id' ? '# ID' : '. Class'}
                      </span>
                      <strong className="component-svg-tag-name">{tag.name}</strong>
                      {tag.classes && tag.classes.length > 0 && (
                        <span className="component-svg-tag-associated-classes">
                          {tag.classes.map((c) => `.${c}`).join(' ')}
                        </span>
                      )}
                    </div>
                    {tag.description && (
                      <div className="component-svg-tag-description" title={tag.description}>
                        <span className="component-svg-tag-desc-icon">📝</span>
                        <span className="component-svg-tag-desc-text">{tag.description}</span>
                      </div>
                    )}
                    <div className="component-svg-tag-action-row">
                      <code className="component-svg-tag-signature">{accessCode}</code>
                      <Button
                        size="small"
                        variant="ghost"
                        className="component-svg-tag-copy-action"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleCopyCode(accessCode, tag.name)
                        }}
                        title="点击复制调用代码"
                      >
                        {isCopied ? '已复制 ✓' : '复制'}
                      </Button>
                    </div>
                  </div>
                )
              })}
              {filteredTags.length === 0 && tagSearchQuery && (
                <div className="component-svg-tag-search-empty">
                  <span>未找到匹配 "{tagSearchQuery}" 的标签</span>
                  <Button
                    size="small"
                    variant="ghost"
                    onClick={() => setTagSearchQuery('')}
                  >
                    清空搜索条件
                  </Button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="component-svg-empty-tags-box">
            <div className="component-svg-empty-icon-wrap">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                <line x1="7" y1="7" x2="7.01" y2="7" />
              </svg>
            </div>
            <p className="component-svg-empty-tags-text">
              暂无标记零件。点击右上角 <strong>&lt;&gt;</strong> 图标打开编辑器，在右侧预览图中点击零件即可直接命名标记。
            </p>
            <Button
              size="small"
              variant="secondary"
              className="component-svg-empty-tags-btn"
              onClick={() => setIsModalOpen(true)}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ marginRight: 5 }}
              >
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              打开编辑器标记零件
            </Button>
          </div>
        )}

        {message && <div className="component-svg-source-message">{message}</div>}
      </div>

      {/* Large Window Modal Dialog */}
      <DialogRoot open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent
          className={`component-svg-modal-popup${isFullscreen ? ' is-fullscreen' : ''}`}
        >
          <div className="component-svg-modal-header">
            <div className="component-svg-modal-title-area">
              <DialogTitle className="component-svg-modal-title">SVG 源码编辑器</DialogTitle>
              <span className="component-svg-modal-subtitle">
                图层：{layer.name} · {lineCount} 行 · {code.length} 字符
                {validationResult.valid && ` · ${validationResult.elementCount} 个元素`}
              </span>
            </div>
            <div className="component-svg-modal-header-actions">
              <Button
                size="small"
                variant="ghost"
                className="component-svg-icon-button"
                onClick={() => setIsFullscreen((prev) => !prev)}
                title={isFullscreen ? '还原窗口' : '全屏显示'}
                aria-label={isFullscreen ? '还原窗口' : '全屏显示'}
              >
                {isFullscreen ? (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                  </svg>
                ) : (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                  </svg>
                )}
              </Button>
              <Button
                size="small"
                variant="ghost"
                className="component-svg-icon-button"
                onClick={() => setIsModalOpen(false)}
                title="关闭"
                aria-label="关闭"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </Button>
            </div>
          </div>

          <div className="component-svg-modal-body">
            {/* Left: Code Editor Pane with Line Numbers */}
            <div className="component-svg-code-pane">
              <div className="component-svg-code-pane-header">
                <div className="component-svg-code-pane-title-wrap">
                  <span>SVG XML 源码 (支持 Tab 缩进 / Ctrl+S 保存)</span>
                  {highlightLocation && (
                    <span className="component-svg-code-highlight-badge">
                      🎯 标记中: &lt;{highlightLocation.tagName}&gt; (第 {highlightLocation.startLine}
                      {highlightLocation.endLine > highlightLocation.startLine
                        ? ` - ${highlightLocation.endLine}`
                        : ''}{' '}
                      行)
                    </span>
                  )}
                </div>
                {isDirty && (
                  <span style={{ color: 'var(--ui-color-warning)', fontSize: '12px' }}>
                    ● 未保存
                  </span>
                )}
              </div>
              <div className="component-svg-editor-container">
                <div ref={lineNumbersRef} className="component-svg-line-numbers">
                  {Array.from({ length: lineCount }, (_, i) => {
                    const lineNum = i + 1
                    const isHighlighted =
                      highlightLocation !== null &&
                      lineNum >= highlightLocation.startLine &&
                      lineNum <= highlightLocation.endLine
                    return (
                      <div
                        key={lineNum}
                        className={`component-svg-line-number ${
                          isHighlighted ? 'is-highlighted' : ''
                        }`}
                      >
                        {lineNum}
                      </div>
                    )
                  })}
                </div>
                <div className="component-svg-textarea-wrapper">
                  {highlightLocation && (
                    <div
                      className="component-svg-code-highlight-bar"
                      style={{
                        top: `${8 + (highlightLocation.startLine - 1) * 20 - textareaScrollTop}px`,
                        height: `${
                          (highlightLocation.endLine - highlightLocation.startLine + 1) * 20
                        }px`,
                      }}
                    />
                  )}
                  <Textarea
                    ref={textareaRef}
                    className="component-svg-modal-textarea"
                    value={code}
                    disabled={readOnly || isRefactoring}
                    spellCheck={false}
                    onChange={(event) => handleCodeChange(event.target.value)}
                    onKeyDown={handleKeyDown}
                    onScroll={handleScroll}
                    placeholder="<svg ...>...</svg>"
                  />
                </div>
              </div>
              <div className="component-svg-code-pane-footer">
                <Button
                  size="small"
                  variant="secondary"
                  className="component-svg-refactor-button"
                  onClick={handleRefactor}
                  disabled={readOnly || isRefactoring || !validationResult.valid}
                  title="智能重构：自动提炼方案一动态遮罩色槽、按 HSL 聚类矢量路径色彩、清除子零件冗余 ID（保留 <g>、色槽及带说明元素）与元数据"
                >
                  {isRefactoring ? (
                    <>
                      <span className="component-svg-spinner" />
                      <span>正在重构...</span>
                    </>
                  ) : (
                    <>
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ marginRight: 6 }}
                      >
                        <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z" />
                      </svg>
                      <span>智能重构 (Refactor)</span>
                    </>
                  )}
                </Button>
                <span className="component-svg-code-pane-hint">
                  算法优化：仅保留 &lt;g&gt; 与根节点 ID（自动擦除子零件冗余 ID）· 提取主色继承 · 规范排版
                </span>
              </div>
            </div>

            {/* Right: Live Preview Pane */}
            <div className="component-svg-preview-pane">
              <div className="component-svg-preview-pane-header">
                <div className="component-svg-preview-pane-title-wrap">
                  <span>实时渲染预览 (Live Preview)</span>
                  <span className="component-svg-preview-tip">
                    💡 点击预览图中的零件直接标记命名
                  </span>
                </div>
                <div className="component-svg-preview-pane-actions">
                  {detectedClasses.length > 0 && (
                    <Button
                      size="small"
                      variant={showClassStyleBar ? 'primary' : 'secondary'}
                      className="component-svg-toggle-markers-btn"
                      onClick={() => setShowClassStyleBar((prev) => !prev)}
                      title={showClassStyleBar ? '点击收起 Class 样式调试条' : '点击展开 Class 样式调试条'}
                    >
                      🎨 样式模拟 ({detectedClasses.length})
                    </Button>
                  )}
                  <Button
                    size="small"
                    variant={showMarkers ? 'primary' : 'secondary'}
                    className="component-svg-toggle-markers-btn"
                    onClick={() => setShowMarkers((prev) => !prev)}
                    title={showMarkers ? '点击隐藏图层标记' : '点击显示图层标记'}
                  >
                    🏷 {showMarkers ? '图层标记' : '隐藏标记'} ({layerMarkers.length})
                  </Button>
                  {validationResult.valid ? (
                    <span style={{ color: 'var(--ui-color-success)', fontSize: '12px' }}>
                      ✓ 语法有效
                    </span>
                  ) : (
                    <span style={{ color: 'var(--ui-color-danger)', fontSize: '12px' }}>
                      ✕ 格式错误
                    </span>
                  )}
                </div>
              </div>

              {showClassStyleBar && detectedClasses.length > 0 && (
                <div className="component-svg-class-style-bar">
                  <div className="component-svg-class-style-top-row">
                    <div className="component-svg-class-style-title-group">
                      <span className="component-svg-class-style-label">
                        🎨 Class 动态样式模拟:
                      </span>
                    </div>
                    <div className="component-svg-class-presets-group">
                      <Button
                        size="small"
                        variant="secondary"
                        className="component-svg-preset-btn"
                        onClick={() => handleApplyPreset('running')}
                        title="模拟运行状态（正常绿）"
                      >
                        🟢 运行态
                      </Button>
                      <Button
                        size="small"
                        variant="secondary"
                        className="component-svg-preset-btn"
                        onClick={() => handleApplyPreset('alarm')}
                        title="模拟告警状态（告警红）"
                      >
                        🔴 告警态
                      </Button>
                      <Button
                        size="small"
                        variant="secondary"
                        className="component-svg-preset-btn"
                        onClick={() => handleApplyPreset('warning')}
                        title="模拟预警状态（预警黄）"
                      >
                        🟡 预警态
                      </Button>
                      <Button
                        size="small"
                        variant="secondary"
                        className="component-svg-preset-btn"
                        onClick={() => handleApplyPreset('offline')}
                        title="模拟停机状态（离线灰）"
                      >
                        ⚪ 停机态
                      </Button>
                      <Button
                        size="small"
                        variant="secondary"
                        className="component-svg-preset-btn"
                        onClick={() => handleApplyPreset('standby')}
                        title="模拟备机状态（待机蓝）"
                      >
                        🔵 备机态
                      </Button>
                      <div className="component-svg-master-color-wrap" title="选择任意主色调，智能保留各图层明暗阶梯分层">
                        <span className="component-svg-master-color-text">自由调色:</span>
                        <Input
                          type="color"
                          className="component-svg-class-color-input"
                          value={masterColor}
                          onChange={(e) => handleMasterColorChange(e.target.value)}
                        />
                      </div>
                      {Object.keys(classStyleOverrides).length > 0 && (
                        <Button
                          size="small"
                          variant="ghost"
                          className="component-svg-preset-btn"
                          onClick={handleResetClassStyles}
                          title="清除模拟样式，恢复默认原始颜色"
                        >
                          🔄 还原
                        </Button>
                      )}
                      {Object.keys(classStyleOverrides).length > 0 && (
                        <Button
                          size="small"
                          variant="secondary"
                          className="component-svg-preset-btn is-bake"
                          onClick={handleBakeClassStylesToCode}
                          title="将当前模拟的样式真正写入左侧 SVG 源码中"
                        >
                          💾 写入源码
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="component-svg-class-items-list">
                    {detectedClasses.map((cls) => {
                      const currentColor = classStyleOverrides[cls.name] || cls.initialColor || '#34d399'
                      const isOverridden = Boolean(classStyleOverrides[cls.name])
                      return (
                        <div
                          key={cls.name}
                          className={`component-svg-class-item-chip${isOverridden ? ' is-overridden' : ''}`}
                          onMouseEnter={() => setHoveredClassName(cls.name)}
                          onMouseLeave={() => setHoveredClassName(null)}
                          title={`悬浮高亮预览图元，点击选择框调整 .${cls.name} 颜色`}
                        >
                          <span className="component-svg-class-chip-pill">.{cls.name}</span>
                          <span className="component-svg-class-chip-count">{cls.count}</span>
                          <div className="component-svg-class-color-wrap">
                            <Input
                              type="color"
                              className="component-svg-class-color-input"
                              value={currentColor}
                              onChange={(e) => handleClassColorChange(cls.name, e.target.value)}
                              title={`点击选择 .${cls.name} 颜色`}
                            />
                            <span className="component-svg-class-color-hex">{currentColor}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div
                className="component-svg-preview-viewport"
                onClick={handlePreviewClick}
                onMouseOver={handlePreviewMouseOver}
                onMouseLeave={handlePreviewMouseLeave}
              >
                {validationResult.svgMarkup ? (
                  <div
                    ref={previewGraphicWrapperRef}
                    className="component-svg-preview-graphic-wrapper"
                  >
                    {Object.keys(classStyleOverrides).length > 0 && (
                      <style>
                        {Object.entries(classStyleOverrides)
                          .map(([cls, color]) => {
                            const clsInfo = detectedClasses.find((c) => c.name === cls)
                            const baselineColor = clsInfo?.initialColor || color
                            const baseRgb = parseCssColorToRgb(baselineColor)
                            const baseHsl = baseRgb ? rgbToHsl(baseRgb.r, baseRgb.g, baseRgb.b) : null
                            const targetRgb = parseCssColorToRgb(color)
                            const targetHsl = targetRgb ? rgbToHsl(targetRgb.r, targetRgb.g, targetRgb.b) : null

                            const rules: string[] = []
                            if (clsInfo && clsInfo.uniqueFills && baseHsl && targetHsl) {
                              for (const origFill of clsInfo.uniqueFills) {
                                const fillRgb = parseCssColorToRgb(origFill)
                                if (fillRgb) {
                                  const fillHsl = rgbToHsl(fillRgb.r, fillRgb.g, fillRgb.b)
                                  const deltaL = fillHsl.l - baseHsl.l
                                  const newL = Math.max(0.02, Math.min(0.98, targetHsl.l + deltaL))
                                  const satScale = baseHsl.s > 0.01 ? Math.min(1, fillHsl.s / baseHsl.s) : 1
                                  const newS = Math.max(0.02, Math.min(1, targetHsl.s * satScale))
                                  const derivedHex = hslToHex(targetHsl.h, newS, newL)
                                  rules.push(
                                    `.component-svg-preview-graphic .${cls}[fill="${origFill}"] { fill: ${derivedHex} !important; }`,
                                    `.component-svg-preview-graphic .${cls}[fill="${origFill.toUpperCase()}"] { fill: ${derivedHex} !important; }`,
                                  )
                                }
                              }
                            }
                            rules.push(`.component-svg-preview-graphic .${cls} { fill: ${color} !important; }`)
                            return rules.join('\n')
                          })
                          .join('\n')}
                      </style>
                    )}
                    {hoveredClassName && (
                      <style>
                        {`.component-svg-preview-graphic .${hoveredClassName} { filter: drop-shadow(0 0 3px #0284c7) brightness(1.25) !important; outline: 1px dashed #0284c7 !important; }`}
                      </style>
                    )}
                    <div
                      ref={previewGraphicRef}
                      className="component-svg-preview-graphic"
                      dangerouslySetInnerHTML={{ __html: validationResult.svgMarkup }}
                    />
                    {showMarkers && layerMarkers.length > 0 && (
                      <div className="component-svg-preview-markers-layer">
                        {layerMarkers.map((marker) => {
                          const isSelected = selectedElement?.tagId === marker.tagId
                          const isHovered = hoveredTagId === marker.tagId
                          return (
                            <div
                              key={marker.tagId || marker.id}
                              className={`component-svg-preview-marker${
                                isSelected ? ' is-selected' : ''
                              }${isHovered ? ' is-hovered' : ''}`}
                              style={{
                                left: `${marker.x}px`,
                                top: `${marker.y}px`,
                              }}
                              onClick={(e) => {
                                e.stopPropagation()
                                if (marker.tagId) {
                                  handleSelectElementByTagId(marker.tagId)
                                }
                              }}
                              onMouseEnter={() => setHoveredTagId(marker.tagId)}
                              onMouseLeave={() => setHoveredTagId(null)}
                              title={`零件: <${marker.tagName}> ID: #${marker.id}${
                                marker.className ? ` Class: .${marker.className}` : ''
                              }${marker.description ? ` (${marker.description})` : ''}`}
                            >
                              <span className="component-svg-marker-id">#{marker.id}</span>
                              {marker.className && (
                                <span className="component-svg-marker-class">
                                  .{marker.className}
                                </span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="component-svg-preview-error">
                    <strong>XML 语法错误</strong>
                    <span>{validationResult.error ?? '请检查标签闭合与属性规范'}</span>
                  </div>
                )}

                {/* Floating Tagging Card when an element is clicked */}
                {selectedElement && (
                  <div
                    className="component-svg-tag-floating-card"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="component-svg-tag-floating-header">
                      <div className="component-svg-tag-floating-title">
                        <span>标记零件</span>
                        <code className="component-svg-tag-floating-tagname">
                          &lt;{selectedElement.tagName}&gt;
                        </code>
                        {selectedElement.existingId && (
                          <span className="component-svg-tag-existing-badge is-id">
                            #{selectedElement.existingId}
                          </span>
                        )}
                        {selectedElement.existingClass && (
                          <span className="component-svg-tag-existing-badge is-class">
                            .{selectedElement.existingClass}
                          </span>
                        )}
                        {selectedElement.existingDescription && (
                          <span
                            className="component-svg-tag-existing-badge is-desc"
                            title={`说明: ${selectedElement.existingDescription}`}
                          >
                            📝 {selectedElement.existingDescription}
                          </span>
                        )}
                      </div>
                      <Button
                        size="small"
                        variant="ghost"
                        className="component-svg-tag-floating-close"
                        onClick={() => setSelectedElement(null)}
                      >
                        ✕
                      </Button>
                    </div>

                    <div className="component-svg-tag-floating-body">
                      <div className="component-svg-tag-field">
                        <label className="component-svg-tag-label">标记类型</label>
                        <SegmentedControl
                          ariaLabel="选择标记类型"
                          value={tagType}
                          items={TAG_TYPE_ITEMS}
                          onValueChange={setTagType}
                        />
                      </div>

                      <div className="component-svg-tag-field">
                        <label className="component-svg-tag-label">
                          属性名称 ({tagType === 'id' ? '唯一变量名' : '类名'})
                        </label>
                        <Input
                          value={tagNameInput}
                          onChange={(e) => {
                            setTagNameInput(e.target.value)
                            if (tagError) setTagError(null)
                          }}
                          placeholder={tagType === 'id' ? '如 fan, alarmLed' : '如 blade, indicator'}
                          autoFocus
                        />
                        {tagError && (
                          <span className="component-svg-tag-floating-error">{tagError}</span>
                        )}
                      </div>

                      <div className="component-svg-tag-field">
                        <label className="component-svg-tag-label">
                          标签说明 (Description)
                        </label>
                        <Input
                          value={tagDescriptionInput}
                          onChange={(e) => setTagDescriptionInput(e.target.value)}
                          placeholder="说明此零件的作用，如：主电机散热风扇"
                        />
                      </div>

                      <div className="component-svg-tag-floating-actions">
                        <Button size="small" variant="primary" onClick={handleSaveTag}>
                          确定标记
                        </Button>
                        {(selectedElement.existingId ||
                          selectedElement.existingClass ||
                          selectedElement.existingDescription) && (
                          <Button size="small" variant="ghost" onClick={handleRemoveTag}>
                            清除标记
                          </Button>
                        )}
                        <Button
                          size="small"
                          variant="secondary"
                          onClick={() => setSelectedElement(null)}
                        >
                          取消
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="component-svg-modal-footer">
            <div className="component-svg-modal-status-info">
              {message ? (
                <span className="component-svg-modal-status-message">{message}</span>
              ) : validationResult.valid ? (
                <span className="component-svg-modal-status-valid">
                  ✓ SVG 语法验证通过 ({validationResult.elementCount} 个元素)
                </span>
              ) : (
                <span className="component-svg-modal-status-invalid">
                  ✕ {validationResult.error}
                </span>
              )}
            </div>

            <div className="component-svg-modal-footer-actions">
              <Button
                size="normal"
                variant="secondary"
                onClick={handleReset}
                disabled={!isDirty || isRefactoring}
              >
                重置
              </Button>
              <Button size="normal" variant="secondary" onClick={() => setIsModalOpen(false)}>
                取消
              </Button>
              <Button
                size="normal"
                variant="secondary"
                onClick={handleSave}
                disabled={readOnly || isRefactoring || !validationResult.valid || !isDirty}
                title="保存当前修改至图层（保持代码编辑器打开，Ctrl+S）"
              >
                保存
              </Button>
              <Button
                size="normal"
                variant="primary"
                onClick={handleApplyAndClose}
                disabled={readOnly || isRefactoring || !validationResult.valid}
                title="应用修改至图层并关闭代码编辑器"
              >
                应用
              </Button>
            </div>
          </div>
        </DialogContent>
      </DialogRoot>
    </CollapsibleInspectorGroup>
  )
}
