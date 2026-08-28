import { builtInComponentRegistry } from '../../component-system/builtins'
import { createEmptyCompositeVisual, createNativeVisual } from '../../component-system/visual'
import { browserPersistence, ensureBrowserPersistenceReady } from '../../storage/browser-persistence'
import {
  COMPONENT_PACKAGE_VERSION,
  cloneComponentDefinition,
  cloneComponentLibraryEntry,
  parseComponentLibraryDocument,
  serializeComponentLibraryDocument,
  type ComponentLibraryEntry,
} from './component-document'

export {
  COMPONENT_PACKAGE_VERSION,
  type ComponentLibraryEntry,
  type ComponentStatus,
} from './component-document'

const BUILT_IN_UPDATED_AT = '2026-08-09T00:00:00.000Z'
const customCache = new Map<string, ComponentLibraryEntry>()
let customCacheReady = false

function getBuiltInComponentId(type: string) {
  return `builtin-${type.replace(/[^a-zA-Z0-9_-]+/g, '-')}`
}

const BUILT_IN_COMPONENTS: ComponentLibraryEntry[] =
  builtInComponentRegistry.list().map(({ definition }) => ({
    version: COMPONENT_PACKAGE_VERSION,
    id: getBuiltInComponentId(definition.type),
    definition: cloneComponentDefinition(definition),
    visual: createNativeVisual(),
    status: 'ready',
    implementationDraft: `// Built-in runtime registration: ${definition.type}`,
    updatedAt: BUILT_IN_UPDATED_AT,
    builtIn: true,
  }))

function createComponentId() {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
  return `component-${suffix}`
}

function sortComponents(entries: ComponentLibraryEntry[]) {
  return entries.sort((left, right) =>
    left.builtIn === right.builtIn
      ? right.updatedAt.localeCompare(left.updatedAt)
      : left.builtIn
        ? -1
        : 1,
  )
}

export async function prepareComponentLibrary() {
  await ensureBrowserPersistenceReady()
  const records = await browserPersistence.components.list()
  customCache.clear()

  for (const record of records) {
    const entry = parseComponentLibraryDocument(record.document)
    if (entry) customCache.set(entry.id, entry)
  }

  customCacheReady = true
}

export async function prepareComponentDefinition(componentId: string) {
  if (BUILT_IN_COMPONENTS.some((component) => component.id === componentId)) {
    return
  }
  if (!customCacheReady) await prepareComponentLibrary()
}

export async function listComponentDefinitions() {
  await prepareComponentLibrary()
  return sortComponents([
    ...BUILT_IN_COMPONENTS.map(cloneComponentLibraryEntry),
    ...[...customCache.values()].map(cloneComponentLibraryEntry),
  ])
}

/** Synchronous read after ComponentEditorLoader has completed hydration. */
export function getComponentDefinition(componentId: string) {
  const builtIn = BUILT_IN_COMPONENTS.find((component) => component.id === componentId)
  if (builtIn) return cloneComponentLibraryEntry(builtIn)

  const entry = customCache.get(componentId)
  return entry ? cloneComponentLibraryEntry(entry) : null
}

export function createComponentDraft(): ComponentLibraryEntry {
  const suffix = Date.now().toString(36)

  return {
    version: COMPONENT_PACKAGE_VERSION,
    id: createComponentId(),
    definition: {
      type: `custom.component.${suffix}`,
      title: '新组件',
      category: '自定义',
      description: '',
      size: {
        defaultWidth: 96,
        defaultHeight: 72,
        minWidth: 32,
        minHeight: 24,
      },
      properties: {},
      actions: {},
      events: {},
      anchors: [],
    },
    visual: createEmptyCompositeVisual(),
    status: 'draft',
    implementationDraft: `// M6.1 只保存实现草稿，不执行用户代码。\n// 后续 Controlled Script Runtime 会提供受控 API。\n`,
    updatedAt: new Date().toISOString(),
    builtIn: false,
  }
}

function prepareSavedComponent(component: ComponentLibraryEntry) {
  if (component.builtIn) {
    throw new Error('内置组件当前不允许覆盖保存')
  }

  const duplicate = [
    ...BUILT_IN_COMPONENTS,
    ...customCache.values(),
  ].find(
    (item) =>
      item.id !== component.id &&
      item.definition.type === component.definition.type,
  )

  if (duplicate) {
    throw new Error(`组件类型已存在：${component.definition.type}`)
  }

  const next: ComponentLibraryEntry = {
    ...cloneComponentLibraryEntry(component),
    version: COMPONENT_PACKAGE_VERSION,
    updatedAt: new Date().toISOString(),
    builtIn: false,
  }
  // Validate before the optimistic cache is changed.
  serializeComponentLibraryDocument(next)
  return next
}

async function persistPreparedComponent(next: ComponentLibraryEntry) {
  await ensureBrowserPersistenceReady()
  const document = serializeComponentLibraryDocument(next)
  await browserPersistence.components.put({
    id: next.id,
    document,
    updatedAt: next.updatedAt,
  })
  customCache.set(next.id, cloneComponentLibraryEntry(next))
  customCacheReady = true
  return cloneComponentLibraryEntry(next)
}

export async function saveComponentDefinitionAsync(
  component: ComponentLibraryEntry,
) {
  if (!customCacheReady) await prepareComponentLibrary()
  const next = prepareSavedComponent(component)
  return persistPreparedComponent(next)
}

/**
 * Compatibility adapter for the current synchronous Component Editor Save
 * button. New integrations should await saveComponentDefinitionAsync.
 */
export function saveComponentDefinition(component: ComponentLibraryEntry) {
  const next = prepareSavedComponent(component)
  customCache.set(next.id, cloneComponentLibraryEntry(next))
  customCacheReady = true
  void persistPreparedComponent(next).catch((error: unknown) => {
    window.dispatchEvent(new CustomEvent('scada-storage-error', { detail: error }))
  })
  return cloneComponentLibraryEntry(next)
}
