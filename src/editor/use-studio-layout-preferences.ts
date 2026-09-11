import { useEffect, useState } from 'react'
import {
  browserPersistence,
  ensureBrowserPersistenceReady,
} from '../storage/browser-persistence'

const STUDIO_LAYOUT_META_KEY = 'studio-layout-v1'

export type StudioLayoutPreferences = {
  leftVisible: boolean
  rightVisible: boolean
  leftWidth: number
  rightWidth: number
}

const DEFAULT_STUDIO_LAYOUT: StudioLayoutPreferences = {
  leftVisible: true,
  rightVisible: true,
  leftWidth: 248,
  rightWidth: 320,
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
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
    leftWidth: clamp(candidate.leftWidth, 208, 360),
    rightWidth: clamp(candidate.rightWidth, 280, 440),
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
        leftWidth: clamp(next.leftWidth, 208, 360),
        rightWidth: clamp(next.rightWidth, 280, 440),
      }
    })
  }

  return {
    layout,
    setLayout: updateLayout,
    resetLayout: () => setLayout(DEFAULT_STUDIO_LAYOUT),
  }
}
