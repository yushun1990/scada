import type { ComponentDefinition, ComponentProps } from './definition'
import type { ComponentRenderer } from './renderer'

export type ComponentActionHandlerContext = {
  nodeId: string
  componentType: string
  props: Readonly<ComponentProps>
  emit: (eventName: string, payload?: unknown) => void
}

export type ComponentActionHandler = (
  context: ComponentActionHandlerContext,
  input?: unknown,
) => unknown | Promise<unknown>

export type ComponentRegistration = {
  definition: ComponentDefinition
  renderer: ComponentRenderer
  createDefaultProps: () => ComponentProps
  actions?: Readonly<Record<string, ComponentActionHandler>>
}
