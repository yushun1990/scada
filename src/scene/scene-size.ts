import { getRootNodes, getSelectionBounds } from './geometry'
import type { SceneDocument } from './model'

export type SceneSizePreset = {
  id: string
  label: string
  width: number
  height: number
}

// Keep the document model on a small set of explicit display-oriented artboard sizes.
export const SCENE_SIZE_PRESETS: readonly SceneSizePreset[] = [
  { id: 'xga', label: 'XGA · 1024 × 768', width: 1024, height: 768 },
  { id: 'hd', label: 'HD · 1280 × 720', width: 1280, height: 720 },
  { id: 'fhd', label: 'Full HD · 1920 × 1080', width: 1920, height: 1080 },
  { id: 'qhd', label: 'QHD · 2560 × 1440', width: 2560, height: 1440 },
  { id: 'uhd', label: '4K · 3840 × 2160', width: 3840, height: 2160 },
]

export function getSceneSizePresetId(scene: SceneDocument) {
  return SCENE_SIZE_PRESETS.find(
    (preset) => preset.width === scene.width && preset.height === scene.height,
  )?.id ?? null
}

export function resizeSceneToPreset(
  scene: SceneDocument,
  preset: SceneSizePreset,
): SceneDocument | null {
  const rootIds = getRootNodes(scene).map((node) => node.id)
  const bounds = getSelectionBounds(scene, rootIds)

  if (
    bounds &&
    (bounds.left < 0 ||
      bounds.top < 0 ||
      bounds.right > preset.width ||
      bounds.bottom > preset.height)
  ) {
    return null
  }

  return {
    ...scene,
    width: preset.width,
    height: preset.height,
  }
}
