import type { SceneDocument } from '../../scene/model'
import { createDefaultScene } from '../../scene/default-scene'
import {
  parseSceneDocument,
  serializeSceneDocument,
} from '../../scene/validation'

const WORKS_STORAGE_KEY = 'scada-editor-lab.works.v1'
const SCENE_STORAGE_PREFIX = 'scada-editor-lab.work.'
const LEGACY_SCENE_KEYS = [
  'scada-editor-lab.scene.v4',
  'scada-editor-lab.scene.v3',
  'scada-editor-lab.scene.v2',
  'scada-editor-lab.scene.v1',
]

export type ScadaWorkSummary = {
  id: string
  name: string
  width: number
  height: number
  nodeCount: number
  connectionCount: number
  updatedAt: string
}

function createWorkId() {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
  return `work-${suffix}`
}

export function getScadaSceneStorageKey(workId: string) {
  return `${SCENE_STORAGE_PREFIX}${workId}.scene.v4`
}

function readWorks(): ScadaWorkSummary[] {
  const raw = window.localStorage.getItem(WORKS_STORAGE_KEY)

  if (!raw) {
    return []
  }

  try {
    const value = JSON.parse(raw)
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

function writeWorks(works: ScadaWorkSummary[]) {
  window.localStorage.setItem(WORKS_STORAGE_KEY, JSON.stringify(works))
}

function summarizeScene(
  workId: string,
  scene: SceneDocument,
  updatedAt = new Date().toISOString(),
): ScadaWorkSummary {
  return {
    id: workId,
    name: scene.name,
    width: scene.width,
    height: scene.height,
    nodeCount: scene.nodes.length,
    connectionCount: scene.connections.length,
    updatedAt,
  }
}

function loadLegacyScene() {
  for (const key of LEGACY_SCENE_KEYS) {
    const raw = window.localStorage.getItem(key)

    if (!raw) {
      continue
    }

    try {
      return parseSceneDocument(raw)
    } catch {
      // Try the next historical key.
    }
  }

  return null
}

function ensureInitialWork() {
  const existing = readWorks()

  if (existing.length > 0) {
    return existing
  }

  const scene = loadLegacyScene() ?? createDefaultScene()
  const workId = 'legacy'
  window.localStorage.setItem(
    getScadaSceneStorageKey(workId),
    serializeSceneDocument(scene),
  )
  const seeded = [summarizeScene(workId, scene)]
  writeWorks(seeded)
  return seeded
}

export function listScadaWorks() {
  return [...ensureInitialWork()].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  )
}

export function loadScadaScene(workId: string): SceneDocument {
  const raw = window.localStorage.getItem(getScadaSceneStorageKey(workId))

  if (raw) {
    try {
      return parseSceneDocument(raw)
    } catch {
      // Fall through to a valid default scene.
    }
  }

  if (workId === 'legacy') {
    const legacy = loadLegacyScene()
    if (legacy) {
      return legacy
    }
  }

  const scene = createDefaultScene()
  scene.name = '未命名 SCADA'
  return scene
}

export function saveScadaScene(workId: string, scene: SceneDocument) {
  window.localStorage.setItem(
    getScadaSceneStorageKey(workId),
    serializeSceneDocument(scene),
  )

  const works = readWorks()
  const summary = summarizeScene(workId, scene)
  const index = works.findIndex((work) => work.id === workId)

  if (index >= 0) {
    works[index] = summary
  } else {
    works.push(summary)
  }

  writeWorks(works)
  return summary
}

export function createScadaWork() {
  const workId = createWorkId()
  const scene = createDefaultScene()
  scene.name = `SCADA 作品 ${listScadaWorks().length + 1}`
  return saveScadaScene(workId, scene)
}
