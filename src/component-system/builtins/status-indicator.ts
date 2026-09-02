import {
  createDefaultPropsFromDefinition,
  type ComponentDefinition,
} from '../definition'
import type { ComponentRegistration } from '../registration'
import { DEFAULT_RECT_ANCHORS } from '../default-anchors'
import { StatusIndicatorComponentRenderer } from './StatusIndicatorComponentRenderer'

export const STATUS_INDICATOR_COMPONENT_TYPE = 'indicator.status' as const

export const statusIndicatorComponentDefinition: ComponentDefinition = {
  type: STATUS_INDICATOR_COMPONENT_TYPE,
  title: '状态指示灯',
  category: '指示',
  description: '用于展示停止、运行、警告和报警状态的内置指示灯。',
  size: {
    defaultWidth: 96,
    defaultHeight: 96,
    minWidth: 48,
    minHeight: 48,
  },
  attributes: {},
  properties: {
    state: {
      title: '状态',
      kind: 'select',
      defaultValue: 'normal',
      bindable: true,
      options: [
        { label: '停止', value: 'off' },
        { label: '运行', value: 'normal' },
        { label: '警告', value: 'warning' },
        { label: '报警', value: 'alarm' },
      ],
    },
  },
  actions: {},
  events: {},
  anchors: DEFAULT_RECT_ANCHORS,
}

export const statusIndicatorComponentRegistration: ComponentRegistration = {
  definition: statusIndicatorComponentDefinition,
  renderer: StatusIndicatorComponentRenderer,
  createDefaultProps: () =>
    createDefaultPropsFromDefinition(statusIndicatorComponentDefinition),
}
