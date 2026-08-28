import { assertComponentVisualAnimations } from '../../component-system/animations'
import type { ComponentDefinition } from '../../component-system/definition'
import { assertComponentDefinition } from '../../component-system/validation'
import {
  assertComponentVisualDefinition,
  cloneComponentVisual,
  createEmptyCompositeVisual,
  type ComponentVisualDefinition,
} from '../../component-system/visual'
import { normalizeStoredComponentVisual } from '../../component-system/visualMigration'
import { assertComponentVisualRules } from '../../component-system/visualRules'

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

function isComponentStatus(value: unknown): value is ComponentStatus {
  return value === 'draft' || value === 'ready'
}

export function cloneComponentDefinition(
  definition: ComponentDefinition,
): ComponentDefinition {
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
        {
          ...action,
          parameters: action.parameters?.map((parameter) => ({
            ...parameter,
            options: parameter.options?.map((option) => ({ ...option })),
          })),
        },
      ]),
    ),
    events: Object.fromEntries(
      Object.entries(definition.events).map(([key, event]) => [
        key,
        {
          ...event,
          payload: event.payload
            ? Object.fromEntries(
                Object.entries(event.payload).map(([field, definition]) => [
                  field,
                  {
                    ...definition,
                    options: definition.options?.map((option) => ({ ...option })),
                  },
                ]),
              )
            : undefined,
        },
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

export function cloneComponentLibraryEntry(
  entry: ComponentLibraryEntry,
): ComponentLibraryEntry {
  return {
    ...entry,
    definition: cloneComponentDefinition(entry.definition),
    visual: cloneComponentVisual(entry.visual),
  }
}

function parseVisual(
  value: unknown,
  definition: ComponentDefinition,
): ComponentVisualDefinition | null {
  if (value === undefined) {
    return createEmptyCompositeVisual()
  }

  const normalized = normalizeStoredComponentVisual(value, {
    width: definition.size.defaultWidth,
    height: definition.size.defaultHeight,
  })

  try {
    assertComponentVisualDefinition(normalized)
    const visual = cloneComponentVisual(normalized)
    assertComponentVisualRules(definition, visual)
    assertComponentVisualAnimations(definition, visual)
    return visual
  } catch {
    return null
  }
}

function parseCurrentComponent(value: unknown): ComponentLibraryEntry | null {
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

  const definition = cloneComponentDefinition(value.definition)
  const visual = parseVisual(value.visual, definition)
  if (!visual) return null

  return {
    version: COMPONENT_PACKAGE_VERSION,
    id: value.id,
    definition,
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
    typeof value.updatedAt !== 'string' ||
    value.builtIn === true
  ) {
    return null
  }

  return value as LegacyComponentLibraryEntry
}

function migrateLegacyComponent(
  legacy: LegacyComponentLibraryEntry,
): ComponentLibraryEntry {
  const definition: ComponentDefinition = {
    type: legacy.type.trim() || `custom.component.${legacy.id.replace(/[^a-zA-Z0-9_-]+/g, '-')}`,
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

export function parseComponentLibraryDocument(
  raw: string,
): ComponentLibraryEntry | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }

  return parseCurrentComponent(value)
    ?? (parseLegacyComponent(value)
      ? migrateLegacyComponent(parseLegacyComponent(value)!)
      : null)
}

export function serializeComponentLibraryDocument(
  entry: ComponentLibraryEntry,
): string {
  if (entry.builtIn) {
    throw new Error('Built-in components are not stored as custom package documents')
  }

  assertComponentDefinition(entry.definition)
  assertComponentVisualDefinition(entry.visual)
  assertComponentVisualRules(entry.definition, entry.visual)
  assertComponentVisualAnimations(entry.definition, entry.visual)

  return JSON.stringify({
    ...cloneComponentLibraryEntry(entry),
    version: COMPONENT_PACKAGE_VERSION,
    builtIn: false,
  })
}
