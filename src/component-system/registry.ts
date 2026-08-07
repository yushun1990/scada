import type { ComponentDefinition } from './definition'
import type { ComponentRegistration } from './registration'

function assertDefinition(definition: ComponentDefinition) {
  if (!definition.type.trim()) {
    throw new Error('Component type cannot be empty')
  }

  if (definition.size.defaultWidth <= 0 || definition.size.defaultHeight <= 0) {
    throw new Error(`Component ${definition.type} has an invalid default size`)
  }

  if (definition.size.minWidth <= 0 || definition.size.minHeight <= 0) {
    throw new Error(`Component ${definition.type} has an invalid minimum size`)
  }

  const anchorIds = new Set<string>()

  for (const anchor of definition.anchors) {
    if (anchorIds.has(anchor.id)) {
      throw new Error(`Component ${definition.type} has duplicate anchor ${anchor.id}`)
    }

    anchorIds.add(anchor.id)
  }
}

export class ComponentRegistry {
  private readonly registrations = new Map<string, ComponentRegistration>()

  constructor(registrations: readonly ComponentRegistration[] = []) {
    for (const registration of registrations) {
      this.register(registration)
    }
  }

  register(registration: ComponentRegistration) {
    const { definition } = registration
    assertDefinition(definition)

    if (this.registrations.has(definition.type)) {
      throw new Error(`Component type is already registered: ${definition.type}`)
    }

    this.registrations.set(definition.type, registration)
    return registration
  }

  has(type: string) {
    return this.registrations.has(type)
  }

  get(type: string) {
    return this.registrations.get(type) ?? null
  }

  require(type: string) {
    const registration = this.get(type)

    if (!registration) {
      throw new Error(`Component type is not registered: ${type}`)
    }

    return registration
  }

  list() {
    return Array.from(this.registrations.values()).sort((left, right) => {
      const categoryOrder = left.definition.category.localeCompare(
        right.definition.category,
        'zh-CN',
      )

      return categoryOrder !== 0
        ? categoryOrder
        : left.definition.title.localeCompare(right.definition.title, 'zh-CN')
    })
  }
}
