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
import { hslToHex, parseCssColorToRgb, rgbToHsl } from '../../component-system/managedSvgTheme'
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
import { ComponentSvgColorPalette } from './ComponentSvgColorPalette'
import {
  countElements,
  extractSvgCodeFromLayer,
  extractSvgTagsFromDocument,
  findNodeByTagId,
  formatManagedSvgDocument,
  locateSvgElementInCode,
  refactorSvgCode,
  type SelectedElementTagInfo,
  type SvgCodeLocation,
  type SvgLayerMarker,
  type SvgTagInfo,
} from './component-svg-source-utils'
import './component-svg-source-editor.css'

export {
  formatManagedSvgDocument,
  refactorSvgCode,
  findNodeByTagId,
  extractSvgTagsFromDocument,
  locateSvgElementInCode,
  type SvgTagInfo,
  type SvgCodeLocation,
  type SvgLayerMarker,
  type SelectedElementTagInfo,
}

type ComponentSvgSourceEditorProps = {
  layer: SvgVisualLayer
  readOnly: boolean
  onChange: (layer: SvgVisualLayer) => void
}

const TAG_TYPE_ITEMS: Array<SegmentedControlItem<'id' | 'class'>> = [
  { value: 'id', label: '# ID (单例零件)' },
  { value: 'class', label: '. Class (集合分类)' },
]


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

              {showClassStyleBar && (
                <ComponentSvgColorPalette
                  detectedClasses={detectedClasses}
                  classStyleOverrides={classStyleOverrides}
                  showClassStyleBar={showClassStyleBar}
                  masterColor={masterColor}
                  onToggleShow={() => setShowClassStyleBar((prev) => !prev)}
                  onApplyPreset={handleApplyPreset}
                  onMasterColorChange={handleMasterColorChange}
                  onResetClassStyles={handleResetClassStyles}
                  onBakeClassStylesToCode={handleBakeClassStylesToCode}
                  onClassColorChange={handleClassColorChange}
                  onHoverClass={setHoveredClassName}
                />
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
