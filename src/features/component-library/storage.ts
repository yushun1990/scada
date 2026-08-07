const COMPONENTS_STORAGE_KEY = 'scada-editor-lab.components.v1'

export type ComponentStatus = 'draft' | 'ready'

export type ComponentDefinition = {
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

const BUILT_IN_COMPONENTS: ComponentDefinition[] = [
  {
    id: 'builtin-pump-submersible',
    name: '潜水泵',
    type: 'pump.submersible',
    category: '设备',
    description: '当前编辑器内置的潜水泵视觉组件。',
    defaultWidth: 96,
    defaultHeight: 135,
    status: 'ready',
    renderCode: '// Built-in renderer: src/assets/pump.tsx / scene node renderer',
    updatedAt: '2026-08-07T00:00:00.000Z',
    builtIn: true,
  },
]

function createComponentId() {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
  return `component-${suffix}`
}

function readCustomComponents(): ComponentDefinition[] {
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

function writeCustomComponents(components: ComponentDefinition[]) {
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

export function createComponentDraft(): ComponentDefinition {
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

export function saveComponentDefinition(component: ComponentDefinition) {
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
