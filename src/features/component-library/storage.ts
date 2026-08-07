import { builtInComponentRegistry } from '../../component-system/builtins'

const COMPONENTS_STORAGE_KEY = 'scada-editor-lab.components.v1'
const BUILT_IN_UPDATED_AT = '2026-08-07T00:00:00.000Z'

export type ComponentStatus = 'draft' | 'ready'

export type ComponentLibraryEntry = {
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

function getBuiltInComponentId(type: string) {
  return `builtin-${type.replace(/[^a-zA-Z0-9_-]+/g, '-')}`
}

const BUILT_IN_COMPONENTS: ComponentLibraryEntry[] =
  builtInComponentRegistry.list().map(({ definition }) => ({
    id: getBuiltInComponentId(definition.type),
    name: definition.title,
    type: definition.type,
    category: definition.category,
    description: definition.description,
    defaultWidth: definition.size.defaultWidth,
    defaultHeight: definition.size.defaultHeight,
    status: 'ready',
    renderCode: `// Built-in runtime registration: ${definition.type}`,
    updatedAt: BUILT_IN_UPDATED_AT,
    builtIn: true,
  }))

function createComponentId() {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
  return `component-${suffix}`
}

function readCustomComponents(): ComponentLibraryEntry[] {
  const raw = window.localStorage.getItem(COMPONENTS_STORAGE_KEY)

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

function writeCustomComponents(components: ComponentLibraryEntry[]) {
  window.localStorage.setItem(COMPONENTS_STORAGE_KEY, JSON.stringify(components))
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
  return listComponentDefinitions().find((component) => component.id === componentId) ?? null
}

export function createComponentDraft(): ComponentLibraryEntry {
  const suffix = Date.now().toString(36)
  return {
    id: createComponentId(),
    name: '新组件',
    type: `custom.component.${suffix}`,
    category: '自定义',
    description: '',
    defaultWidth: 96,
    defaultHeight: 72,
    status: 'draft',
    renderCode: `export function render(ctx) {\n  // TODO: 在这里实现组件视觉。\n}\n`,
    updatedAt: new Date().toISOString(),
    builtIn: false,
  }
}

export function saveComponentDefinition(component: ComponentLibraryEntry) {
  if (component.builtIn) {
    throw new Error('内置组件当前不允许覆盖保存')
  }

  const next = {
    ...component,
    updatedAt: new Date().toISOString(),
  }
  const components = readCustomComponents()
  const index = components.findIndex((item) => item.id === next.id)

  if (index >= 0) {
    components[index] = next
  } else {
    components.push(next)
  }

  writeCustomComponents(components)
  return next
}
