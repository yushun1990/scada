import { builtInComponentRegistrations } from '../../component-system/builtins'
import { ComponentRegistry } from '../../component-system/registry'
import { browserPersistence, ensureBrowserPersistenceReady } from '../../storage/browser-persistence'
import { createDefaultScene, type SceneDocument } from '../../scene/model'
import {
  parseSceneDocument,
  serializeSceneDocument,
} from '../../scene/validation'
import { serializeComponentLibraryDocument } from '../component-library/component-document'
import {
  distributableComponentPackageToLibraryEntry,
} from '../component-library/distributable-component-package'
import {
  listComponentDefinitions,
  listInstalledRemoteComponents,
  prepareComponentRuntimeRegistry,
} from '../component-library/storage'
import {
  createScadaWorkPackage,
  parseScadaWorkPackage,
  parseScadaWorkPackageDocument,
  serializeScadaWorkPackage,
  type ScadaWorkPackage,
} from './scada-work-package'
import {
  planScadaWorkPackageImport,
  resolveScadaWorkDependencies,
  type ScadaWorkPackageImportPlan,
  type ScadaWorkTransferInventory,
} from './scada-work-transfer'

export type ScadaWorkSummary = {
  id: string
  name: string
  width: number
  height: number
  nodeCount: number
  connectionCount: number
  updatedAt: string
}

export type InspectedScadaWorkPackageImport = Readonly<{
  workPackage: ScadaWorkPackage
  plan: ScadaWorkPackageImportPlan
}>

const sceneCache = new Map<string, SceneDocument>()

function createLocalId(prefix: string) {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
  return `${prefix}-${suffix}`
}

function createWorkId() {
  return createLocalId('work')
}

function createImportedComponentId() {
  return createLocalId('component')
}

function createWorkPackageHostCapabilities() {
  return new ComponentRegistry(builtInComponentRegistrations)
}

async function loadWorkTransferInventory(): Promise<ScadaWorkTransferInventory> {
  const [components, installedRemoteComponents] = await Promise.all([
    listComponentDefinitions(),
    listInstalledRemoteComponents(),
  ])
  return { components, installedRemoteComponents }
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
  await prepareComponentRuntimeRegistry()
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
  await prepareComponentRuntimeRegistry()
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

/** Export the exact persisted work, never an unsaved editor-memory snapshot. */
export async function exportScadaWorkPackageDocument(workId: string) {
  await prepareComponentRuntimeRegistry()
  await ensureBrowserPersistenceReady()
  const record = await browserPersistence.scenes.get(workId)
  if (!record) {
    throw new Error(`SCADA 作品不存在：${workId}`)
  }

  const scene = parseSceneDocument(record.document)
  const inventory = await loadWorkTransferInventory()
  const dependencies = resolveScadaWorkDependencies(scene, inventory)
  const hostCapabilities = createWorkPackageHostCapabilities()
  const workPackage = createScadaWorkPackage(
    scene,
    dependencies,
    hostCapabilities,
  )

  return {
    workPackage,
    document: serializeScadaWorkPackage(workPackage, hostCapabilities),
  }
}

/** File-selection preflight. No repository write or registry mutation occurs here. */
export async function inspectScadaWorkPackageImportDocument(
  raw: string,
): Promise<InspectedScadaWorkPackageImport> {
  const hostCapabilities = createWorkPackageHostCapabilities()
  const workPackage = parseScadaWorkPackageDocument(raw, hostCapabilities)
  if (!workPackage) {
    throw new Error('SCADA 作品包无效、依赖不完整或版本不受支持')
  }

  const plan = planScadaWorkPackageImport(
    workPackage,
    await loadWorkTransferInventory(),
  )
  return { workPackage, plan }
}

/**
 * Persist one validated package as a fresh local work. The complete package is
 * revalidated and collision-planned immediately before the write so UI
 * inspection cannot become persistence authority.
 */
export async function importScadaWorkPackage(
  candidate: ScadaWorkPackage,
): Promise<ScadaWorkSummary> {
  const hostCapabilities = createWorkPackageHostCapabilities()
  const workPackage = parseScadaWorkPackage(candidate, hostCapabilities)
  if (!workPackage) {
    throw new Error('SCADA 作品包无效、依赖不完整或版本不受支持')
  }

  const plan = planScadaWorkPackageImport(
    workPackage,
    await loadWorkTransferInventory(),
  )
  if (plan.kind === 'collision') {
    throw new Error(plan.message)
  }

  await ensureBrowserPersistenceReady()
  const updatedAt = new Date().toISOString()
  const componentRecords = plan.dependenciesToImport.map((dependency) => {
    const entry = distributableComponentPackageToLibraryEntry(dependency, {
      id: createImportedComponentId(),
      updatedAt,
    })
    return {
      id: entry.id,
      document: serializeComponentLibraryDocument(entry),
      updatedAt,
    }
  })
  const workId = createWorkId()
  const sceneRecord = {
    id: workId,
    // parseScadaWorkPackage() already normalized/migrated this through the
    // M8A1 scoped codec, so it is safe to persist before live activation.
    document: JSON.stringify(workPackage.scene),
    updatedAt,
  }

  await browserPersistence.addWorkImportAtomically(
    sceneRecord,
    componentRecords,
  )

  // Activation happens only after the complete browser transaction commits.
  await prepareComponentRuntimeRegistry()
  const normalizedScene = parseSceneDocument(sceneRecord.document)
  sceneCache.set(workId, normalizedScene)
  return summarizeScene(workId, normalizedScene, updatedAt)
}
