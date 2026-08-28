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

function parseRecord(workId: string, document: string, updatedAt: string) {
  try {
    return summarizeScene(workId, parseSceneDocument(document), updatedAt)
  } catch {
    return null
  }
}

async function ensureInitialWork() {
  await ensureBrowserPersistenceReady()
  const records = await browserPersistence.scenes.list()
  if (records.length > 0) return records

  const scene = createDefaultScene()
  const updatedAt = new Date().toISOString()
  await browserPersistence.scenes.put({
    id: 'legacy',
    document: serializeSceneDocument(scene),
    updatedAt,
  })
  return [{ id: 'legacy', document: serializeSceneDocument(scene), updatedAt }]
}

export async function listScadaWorks(): Promise<ScadaWorkSummary[]> {
  const records = await ensureInitialWork()
  return records
    .map((record) => parseRecord(record.id, record.document, record.updatedAt))
    .filter((work): work is ScadaWorkSummary => Boolean(work))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

export async function loadScadaScene(workId: string): Promise<SceneDocument> {
  await ensureBrowserPersistenceReady()
  const record = await browserPersistence.scenes.get(workId)

  if (record) {
    try {
      return parseSceneDocument(record.document)
    } catch {
      // Fall through to a valid default scene without mutating the corrupt row.
    }
  }

  const scene = createDefaultScene()
  scene.name = '未命名 SCADA'
  return scene
}

export async function saveScadaScene(
  workId: string,
  scene: SceneDocument,
): Promise<ScadaWorkSummary> {
  await ensureBrowserPersistenceReady()
  const document = serializeSceneDocument(scene)
  const normalized = parseSceneDocument(document)
  const updatedAt = new Date().toISOString()

  await browserPersistence.scenes.put({ workId, id: workId, document, updatedAt } as never)
  return summarizeScene(workId, normalized, updatedAt)
}

export async function createScadaWork(): Promise<ScadaWorkSummary> {
  const workId = createWorkId()
  const scene = createDefaultScene()
  const works = await listScadaWorks()
  scene.name = `SCADA 作品 ${works.length + 1}`
  return saveScadaScene(workId, scene)
}
