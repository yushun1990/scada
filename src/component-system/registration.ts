import type {
  ComponentActionArguments,
  ComponentDefinition,
  ComponentEventPayload,
  ComponentProps,
} from './definition'
import type { ComponentRenderer } from './renderer'

export type ComponentActionHandlerContext = {
  nodeId: string
  componentType: string
  props: Readonly<ComponentProps>
  emit: (eventName: string, payload?: ComponentEventPayload) => void
}

export type ComponentActionHandler = (
  context: ComponentActionHandlerContext,
  argumentsValue: ComponentActionArguments,
) => unknown | Promise<unknown>

export type ComponentRegistration = {
  definition: ComponentDefinition
  renderer: ComponentRenderer
  createDefaultProps: () => ComponentProps
  actions?: Readonly<Record<string, ComponentActionHandler>>
}
