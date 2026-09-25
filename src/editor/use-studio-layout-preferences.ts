import { useEffect, useState } from 'react'
import {
  browserPersistence,
  ensureBrowserPersistenceReady,
} from '../storage/browser-persistence'

const STUDIO_LAYOUT_META_KEY = 'studio-layout-v3'

export type StudioLayoutPreferences = {
  leftVisible: boolean
  rightVisible: boolean
  leftWidth: number
  rightWidth: number
}

const DEFAULT_STUDIO_LAYOUT: StudioLayoutPreferences = {
  leftVisible: true,
  rightVisible: true,
  leftWidth: 360,
  rightWidth: 360,
}

const LEFT_WIDTH_MIN = 260
const LEFT_WIDTH_MAX = 500
const RIGHT_WIDTH_MIN = 300
const RIGHT_WIDTH_MAX = 500

function clampPanelWidth(side: 'left' | 'right', value: number) {
  return side === 'left'
    ? Math.min(LEFT_WIDTH_MAX, Math.max(LEFT_WIDTH_MIN, value))
    : Math.min(RIGHT_WIDTH_MAX, Math.max(RIGHT_WIDTH_MIN, value))
}

function parseLayout(value: unknown): StudioLayoutPreferences | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<StudioLayoutPreferences>
  if (
    typeof candidate.leftVisible !== 'boolean' ||
    typeof candidate.rightVisible !== 'boolean' ||
    typeof candidate.leftWidth !== 'number' ||
    !Number.isFinite(candidate.leftWidth) ||
    typeof candidate.rightWidth !== 'number' ||
    !Number.isFinite(candidate.rightWidth)
  ) {
    return null
  }

  return {
    leftVisible: candidate.leftVisible,
    rightVisible: candidate.rightVisible,
    leftWidth: clampPanelWidth('left', candidate.leftWidth),
    rightWidth: clampPanelWidth('right', candidate.rightWidth),
  }
}

function reportPreferenceError(error: unknown) {
  window.dispatchEvent(new CustomEvent('scada-storage-error', {
    detail: error instanceof Error ? error : new Error('Studio 布局偏好保存失败'),
  }))
}

export function useStudioLayoutPreferences() {
  const [layout, setLayout] = useState<StudioLayoutPreferences>(DEFAULT_STUDIO_LAYOUT)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    let active = true
    void ensureBrowserPersistenceReady()
      .then(() => browserPersistence.getMeta(STUDIO_LAYOUT_META_KEY))
      .then((stored) => {
        if (!active) return
        const parsed = parseLayout(stored)
        if (parsed) setLayout(parsed)
        setHydrated(true)
      })
      .catch((error: unknown) => {
        if (!active) return
        setHydrated(true)
        reportPreferenceError(error)
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!hydrated) return
    void browserPersistence
      .setMeta(STUDIO_LAYOUT_META_KEY, layout)
      .catch(reportPreferenceError)
  }, [hydrated, layout])

  function updateLayout(
    update: StudioLayoutPreferences | ((current: StudioLayoutPreferences) => StudioLayoutPreferences),
  ) {
    setLayout((current) => {
      const next = typeof update === 'function' ? update(current) : update
      return {
        leftVisible: next.leftVisible,
        rightVisible: next.rightVisible,
        leftWidth: clampPanelWidth('left', next.leftWidth),
        rightWidth: clampPanelWidth('right', next.rightWidth),
      }
    })
  }

  return {
    layout,
    setLayout: updateLayout,
  }
}
