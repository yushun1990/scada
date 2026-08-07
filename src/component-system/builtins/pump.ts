import {
  createDefaultPropsFromDefinition,
  type ComponentDefinition,
} from '../definition'
import type { ComponentRegistration } from '../registration'
import { DEFAULT_RECT_ANCHORS } from '../default-anchors'
import { PumpComponentRenderer } from './PumpComponentRenderer'

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
      kind: 'select',
      defaultValue: 'green',
      bindable: true,
      options: [
        { label: '停止', value: 'gray' },
        { label: '运行', value: 'green' },
        { label: '手动', value: 'blue' },
        { label: '警告', value: 'orange' },
        { label: '报警', value: 'red' },
      ],
    },
  },
  actions: {},
  events: {},
  anchors: DEFAULT_RECT_ANCHORS,
}

export const pumpComponentRegistration: ComponentRegistration = {
  definition: pumpComponentDefinition,
  renderer: PumpComponentRenderer,
  createDefaultProps: () => createDefaultPropsFromDefinition(pumpComponentDefinition),
}
