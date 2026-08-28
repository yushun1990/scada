import { browserPersistence, ensureBrowserPersistenceReady } from '../../storage/browser-persistence'
import { createDefaultScene, type SceneDocument } from '../../scene/model'
import {
  parseSceneDocument,
  serializeSceneDocument,
} from '../../scene/validation'

export type ScadaWorkSummary = {
  id: string
  name: string
  width: number
  height: number
  nodeCount: number
  connectionCount: number
  updatedAt: string
}

const sceneCache = new Map<string, SceneDocument>()

function createWorkId() {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
  return `work-${suffix}`
}

function summarizeScene(
  workId: string,
  scene: SceneDocument,
  updatedAt: string,
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

function cloneScene(scene: SceneDocument) {
  return parseSceneDocument(serializeSceneDocument(scene))
}

function parseRecord(workId: string, document: string, updatedAt: string) {
  try {
    const scene = parseSceneDocument(document)
    sceneCache.set(workId, scene)
    return summarizeScene(workId, scene, updatedAt)
  } catch {
    return null
  }
}

async function ensureInitialWork() {
  await ensureBrowserPersistenceReady()
  const records = await browserPersistence.scenes.list()
  if (records.length > 0) return records

  const scene = createDefaultScene()
  const document = serializeSceneDocument(scene)
  const updatedAt = new Date().toISOString()
  await browserPersistence.scenes.put({
    id: 'legacy',
    document,
    updatedAt,
  })
  sceneCache.set('legacy', scene)
  return [{ id: 'legacy', document, updatedAt }]
}

export async function listScadaWorks(): Promise<ScadaWorkSummary[]> {
  const records = await ensureInitialWork()
  return records
    .map((record) => parseRecord(record.id, record.document, record.updatedAt))
    .filter((work): work is ScadaWorkSummary => Boolean(work))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

export async function prepareScadaScene(workId: string) {
  await ensureBrowserPersistenceReady()
  const record = await browserPersistence.scenes.get(workId)

  if (record) {
    try {
      sceneCache.set(workId, parseSceneDocument(record.document))
      return
    } catch {
      // Keep the corrupt IndexedDB row intact for diagnostics and open fallback.
    }
  }

  const scene = createDefaultScene()
  scene.name = '未命名 SCADA'
  sceneCache.set(workId, scene)
}

/**
 * Synchronous read used by the existing editor state initializer only after
 * ScadaEditorLoader has awaited prepareScadaScene().
 */
export function loadScadaScene(workId: string): SceneDocument {
  const cached = sceneCache.get(workId)
  if (cached) return cloneScene(cached)

  const fallback = createDefaultScene()
  fallback.name = '未命名 SCADA'
  return fallback
}

export async function saveScadaSceneAsync(
  workId: string,
  scene: SceneDocument,
): Promise<ScadaWorkSummary> {
  await ensureBrowserPersistenceReady()
  const document = serializeSceneDocument(scene)
  const normalized = parseSceneDocument(document)
  const updatedAt = new Date().toISOString()

  await browserPersistence.scenes.put({
    id: workId,
    document,
    updatedAt,
  })
  sceneCache.set(workId, normalized)
  return summarizeScene(workId, normalized, updatedAt)
}

export async function createScadaWork(): Promise<ScadaWorkSummary> {
  const workId = createWorkId()
  const scene = createDefaultScene()
  const works = await listScadaWorks()
  scene.name = `SCADA 作品 ${works.length + 1}`
  return saveScadaSceneAsync(workId, scene)
}
