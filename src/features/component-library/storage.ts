import { builtInComponentRegistry } from '../../component-system/builtins'
import type { ComponentDefinition } from '../../component-system/definition'
import { assertComponentDefinition } from '../../component-system/validation'
import {
  assertComponentVisualDefinition,
  cloneComponentVisual,
  createEmptyCompositeVisual,
  createNativeVisual,
  type ComponentVisualDefinition,
} from '../../component-system/visual'

const COMPONENTS_STORAGE_KEY = 'scada-editor-lab.components.v2'
const LEGACY_COMPONENTS_STORAGE_KEY = 'scada-editor-lab.components.v1'
const BUILT_IN_UPDATED_AT = '2026-08-09T00:00:00.000Z'

export const COMPONENT_PACKAGE_VERSION = 1 as const

export type ComponentStatus = 'draft' | 'ready'

export type ComponentLibraryEntry = {
  version: typeof COMPONENT_PACKAGE_VERSION
  id: string
  definition: ComponentDefinition
  visual: ComponentVisualDefinition
  status: ComponentStatus
  implementationDraft: string
  updatedAt: string
  builtIn: boolean
}

type LegacyComponentLibraryEntry = {
  id: string
  name: string
  type: string
  category: string
  description: string
  defaultWidth: number
  defaultHeight: number
  status: ComponentStatus
  renderCode: string
  updatedAt: string
  builtIn: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cloneDefinition(definition: ComponentDefinition): ComponentDefinition {
  return {
    ...definition,
    size: { ...definition.size },
    properties: Object.fromEntries(
      Object.entries(definition.properties).map(([key, property]) => [
        key,
        {
          ...property,
          options: property.options?.map((option) => ({ ...option })),
        },
      ]),
    ),
    actions: Object.fromEntries(
      Object.entries(definition.actions).map(([key, action]) => [
        key,
        { ...action },
      ]),
    ),
    events: Object.fromEntries(
      Object.entries(definition.events).map(([key, event]) => [
        key,
        { ...event },
      ]),
    ),
    anchors: definition.anchors.map((anchor) => ({
      ...anchor,
      position: { ...anchor.position },
      outward: { ...anchor.outward },
      kinds: anchor.kinds ? [...anchor.kinds] : undefined,
    })),
  }
}

function getBuiltInComponentId(type: string) {
  return `builtin-${type.replace(/[^a-zA-Z0-9_-]+/g, '-')}`
}

const BUILT_IN_COMPONENTS: ComponentLibraryEntry[] =
  builtInComponentRegistry.list().map(({ definition }) => ({
    version: COMPONENT_PACKAGE_VERSION,
    id: getBuiltInComponentId(definition.type),
    definition: cloneDefinition(definition),
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

function isComponentStatus(value: unknown): value is ComponentStatus {
  return value === 'draft' || value === 'ready'
}

function parseVisual(value: unknown): ComponentVisualDefinition | null {
  if (value === undefined) {
    return createEmptyCompositeVisual()
  }

  try {
    assertComponentVisualDefinition(value)
    return cloneComponentVisual(value)
  } catch {
    return null
  }
}

function parseStoredComponent(value: unknown): ComponentLibraryEntry | null {
  if (
    !isRecord(value) ||
    value.version !== COMPONENT_PACKAGE_VERSION ||
    typeof value.id !== 'string' ||
    !value.id.trim() ||
    !isComponentStatus(value.status) ||
    typeof value.implementationDraft !== 'string' ||
    typeof value.updatedAt !== 'string' ||
    value.builtIn !== false
  ) {
    return null
  }

  try {
    assertComponentDefinition(value.definition)
  } catch {
    return null
  }

  const visual = parseVisual(value.visual)

  if (!visual) {
    return null
  }

  return {
    version: COMPONENT_PACKAGE_VERSION,
    id: value.id,
    definition: cloneDefinition(value.definition),
    visual,
    status: value.status,
    implementationDraft: value.implementationDraft,
    updatedAt: value.updatedAt,
    builtIn: false,
  }
}

function parseLegacyComponent(value: unknown): LegacyComponentLibraryEntry | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.type !== 'string' ||
    typeof value.category !== 'string' ||
    typeof value.description !== 'string' ||
    typeof value.defaultWidth !== 'number' ||
    !Number.isFinite(value.defaultWidth) ||
    value.defaultWidth <= 0 ||
    typeof value.defaultHeight !== 'number' ||
    !Number.isFinite(value.defaultHeight) ||
    value.defaultHeight <= 0 ||
    !isComponentStatus(value.status) ||
    typeof value.renderCode !== 'string' ||
    typeof value.updatedAt !== 'string'
  ) {
    return null
  }

  return value as LegacyComponentLibraryEntry
}

function migrateLegacyComponent(
  legacy: LegacyComponentLibraryEntry,
): ComponentLibraryEntry {
  const definition: ComponentDefinition = {
    type: legacy.type.trim() || `custom.component.${Date.now().toString(36)}`,
    title: legacy.name.trim() || '未命名组件',
    category: legacy.category.trim() || '自定义',
    description: legacy.description,
    size: {
      defaultWidth: legacy.defaultWidth,
      defaultHeight: legacy.defaultHeight,
      minWidth: Math.max(1, legacy.defaultWidth / 2),
      minHeight: Math.max(1, legacy.defaultHeight / 2),
    },
    properties: {},
    actions: {},
    events: {},
    anchors: [],
  }

  assertComponentDefinition(definition)

  return {
    version: COMPONENT_PACKAGE_VERSION,
    id: legacy.id,
    definition,
    visual: createEmptyCompositeVisual(),
    status: legacy.status,
    implementationDraft: legacy.renderCode,
    updatedAt: legacy.updatedAt,
    builtIn: false,
  }
}

function writeCustomComponents(components: ComponentLibraryEntry[]) {
  window.localStorage.setItem(COMPONENTS_STORAGE_KEY, JSON.stringify(components))
}

function readCustomComponents(): ComponentLibraryEntry[] {
  const raw = window.localStorage.getItem(COMPONENTS_STORAGE_KEY)

  if (raw) {
    try {
      const value: unknown = JSON.parse(raw)
      return Array.isArray(value)
        ? value
            .map(parseStoredComponent)
            .filter((entry): entry is ComponentLibraryEntry => Boolean(entry))
        : []
    } catch {
      return []
    }
  }

  const legacyRaw = window.localStorage.getItem(LEGACY_COMPONENTS_STORAGE_KEY)

  if (!legacyRaw) {
    return []
  }

  try {
    const value: unknown = JSON.parse(legacyRaw)

    if (!Array.isArray(value)) {
      return []
    }

    const migrated = value
      .map(parseLegacyComponent)
      .filter((entry): entry is LegacyComponentLibraryEntry => Boolean(entry))
      .filter((entry) => !entry.builtIn)
      .map(migrateLegacyComponent)

    writeCustomComponents(migrated)
    return migrated
  } catch {
    return []
  }
}

export function listComponentDefinitions() {
  return [...BUILT_IN_COMPONENTS, ...readCustomComponents()].sort((left, right) =>
    left.builtIn === right.builtIn
      ? right.updatedAt.localeCompare(left.updatedAt)
      : left.builtIn
        ? -1
        : 1,
  )
}

export function getComponentDefinition(componentId: string) {
  const entry = listComponentDefinitions().find(
    (component) => component.id === componentId,
  )

  return entry
    ? {
        ...entry,
        definition: cloneDefinition(entry.definition),
        visual: cloneComponentVisual(entry.visual),
      }
    : null
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

export function saveComponentDefinition(component: ComponentLibraryEntry) {
  if (component.builtIn) {
    throw new Error('内置组件当前不允许覆盖保存')
  }

  assertComponentDefinition(component.definition)
  assertComponentVisualDefinition(component.visual)

  const components = readCustomComponents()
  const duplicate = [...BUILT_IN_COMPONENTS, ...components].find(
    (item) =>
      item.id !== component.id &&
      item.definition.type === component.definition.type,
  )

  if (duplicate) {
    throw new Error(`组件类型已存在：${component.definition.type}`)
  }

  const next: ComponentLibraryEntry = {
    ...component,
    version: COMPONENT_PACKAGE_VERSION,
    definition: cloneDefinition(component.definition),
    visual: cloneComponentVisual(component.visual),
    implementationDraft: component.implementationDraft,
    updatedAt: new Date().toISOString(),
    builtIn: false,
  }
  const index = components.findIndex((item) => item.id === next.id)

  if (index >= 0) {
    components[index] = next
  } else {
    components.push(next)
  }

  writeCustomComponents(components)
  return next
}
