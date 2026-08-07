import type { ComponentDefinition, ComponentProps } from './definition'
import type { ComponentRenderer } from './renderer'

export type ComponentRegistration = {
  definition: ComponentDefinition
  renderer: ComponentRenderer
  createDefaultProps: () => ComponentProps
}
