import {
  type ManagedSvgDocument,
  type ManagedSvgElement,
  type ManagedSvgNode,
} from '../../component-system/managedSvg'
import { parseManagedSvgSourceWithCompatibility } from '../../component-system/managedSvgImportCompatibility'
import { parseCssColorToRgb, rgbToHsl } from '../../component-system/managedSvgTheme'
import type { SvgVisualLayer } from '../../component-system/visual'

export function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function escapeText(value: string): string {
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

export function extractSvgCodeFromLayer(layer: SvgVisualLayer): string {
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

export function countElements(node: ManagedSvgNode): number {
  if (node.kind === 'text') return 0
  let count = 1
  for (const child of node.children) {
    count += countElements(child)
  }
  return count
}

export function isGenericNoiseId(id: string): boolean {
  if (!id) return true
  const lower = id.trim().toLowerCase()
  return /^(?:svg|rect|path|g|shape|layer|cls|st|id)[-_]?[0-9]+$/i.test(lower)
}

export function refactorSvgCode(rawCode: string): { refactored: string; summary: string } {
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') {
    throw new Error('当前环境不支持 SVG DOM 解析')
  }

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
    candidateSlots.sort((a, b) => b.lightness - a.lightness)

    candidateSlots.forEach((slot, index) => {
      const { el, existingId, existingDesc } = slot
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

  // 3. ID Pruning
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
          const isWarm = hsl.h <= 35 || hsl.h >= 340
          const minS = isWarm ? 0.12 : 0.20
          if (hsl.s >= minS && hsl.l >= 0.05 && hsl.l <= 0.95) {
            chromaticShapes.push({ el, fill, ...hsl })
          }
        }
      }
    }

    if (chromaticShapes.length >= 3) {
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
        const uniqueFills = Array.from(new Set(clusterMembers.map((item) => item.fill.toLowerCase())))
        const fillStats = uniqueFills
          .map((fill) => {
            const members = clusterMembers.filter((m) => m.fill.toLowerCase() === fill)
            const avgL = members.reduce((sum, m) => sum + m.l, 0) / members.length
            return { fill, avgL, count: members.length }
          })
          .sort((a, b) => a.avgL - b.avgL)

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

  // 6. Dominant Fill Hoisting
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

export type SelectedElementTagInfo = {
  tagId: string
  tagName: string
  existingId: string
  existingClass: string
  existingDescription?: string
}
