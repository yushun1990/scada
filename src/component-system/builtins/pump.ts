import {
  createDefaultPropsFromDefinition,
  type ComponentDefinition,
  type ComponentRegistration,
} from '../definition'
import { DEFAULT_RECT_ANCHORS } from '../default-anchors'

export const PUMP_COMPONENT_TYPE = 'pump.submersible' as const

export const pumpComponentDefinition: ComponentDefinition = {
  type: PUMP_COMPONENT_TYPE,
  title: '潜水泵',
  category: '设备',
  description: '内置潜水泵视觉组件。',
  size: {
    defaultWidth: 96,
    defaultHeight: 135,
    minWidth: 40,
    minHeight: 56.25,
  },
  properties: {
    state: {
      title: '状态',
      kind: 'string',
      defaultValue: 'green',
      bindable: true,
    },
  },
  actions: {},
  events: {},
  anchors: DEFAULT_RECT_ANCHORS,
}

export const pumpComponentRegistration: ComponentRegistration = {
  definition: pumpComponentDefinition,
  createDefaultProps: () => createDefaultPropsFromDefinition(pumpComponentDefinition),
}
