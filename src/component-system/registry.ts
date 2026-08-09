import type { ComponentRegistration } from './registration'
import { assertComponentDefinition } from './validation'

function assertRegistration(registration: ComponentRegistration) {
  const { definition, actions } = registration

  if (!actions) {
    return
  }

  for (const actionName of Object.keys(actions)) {
    if (!definition.actions[actionName]) {
      throw new Error(
        `Component ${definition.type} registers undeclared action ${actionName}`,
      )
    }
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
    assertComponentDefinition(definition)
    assertRegistration(registration)

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
