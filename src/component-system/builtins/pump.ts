import {
  createDefaultPropsFromDefinition,
  type ComponentDefinition,
} from '../definition'
import type { ComponentRegistration } from '../registration'
import { DEFAULT_RECT_ANCHORS } from '../default-anchors'
import { PumpComponentRenderer } from './PumpComponentRenderer'

export const PUMP_COMPONENT_TYPE = 'pump.submersible' as const

export const PUMP_STATE_VALUES = [
  'stopped',
  'running',
  'manual',
  'warning',
  'alarm',
] as const

export type PumpSemanticState = typeof PUMP_STATE_VALUES[number]

const LEGACY_PUMP_STATE_TO_SEMANTIC: Readonly<Record<string, PumpSemanticState>> = {
  gray: 'stopped',
  green: 'running',
  blue: 'manual',
  orange: 'warning',
  red: 'alarm',
}

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
  attributes: {
    stoppedColor: {
      title: '停止色',
      kind: 'color',
      defaultValue: '#788581',
      description: '停止状态的 authored presentation color。',
    },
    runningColor: {
      title: '运行色',
      kind: 'color',
      defaultValue: '#0f9f20',
      description: '运行状态的 authored presentation color。',
    },
    manualColor: {
      title: '手动色',
      kind: 'color',
      defaultValue: '#0369a1',
      description: '手动状态的 authored presentation color。',
    },
    warningColor: {
      title: '警告色',
      kind: 'color',
      defaultValue: '#c2410c',
      description: '警告状态的 authored presentation color。',
    },
    alarmColor: {
      title: '报警色',
      kind: 'color',
      defaultValue: '#b91c1c',
      description: '报警状态的 authored presentation color。',
    },
  },
  properties: {
    state: {
      title: '状态',
      kind: 'select',
      defaultValue: 'running',
      description: '潜水泵当前语义状态；颜色由 authored presentation 配置决定。',
      bindable: true,
      options: [
        { label: '停止', value: 'stopped' },
        { label: '运行', value: 'running' },
        { label: '手动', value: 'manual' },
        { label: '警告', value: 'warning' },
        { label: '报警', value: 'alarm' },
      ],
    },
  },
  actions: {
    start: {
      title: '启动',
      description: '请求启动潜水泵。',
    },
    stop: {
      title: '停止',
      description: '请求停止潜水泵。',
    },
  },
  events: {
    startRequested: {
      title: '启动请求',
      description: '组件的启动 Action 已被调用。',
    },
    stopRequested: {
      title: '停止请求',
      description: '组件的停止 Action 已被调用。',
    },
  },
  anchors: DEFAULT_RECT_ANCHORS,
}

export const pumpComponentRegistration: ComponentRegistration = {
  definition: pumpComponentDefinition,
  renderer: PumpComponentRenderer,
  createDefaultProps: () => createDefaultPropsFromDefinition(pumpComponentDefinition),
  migratePersistedAuthoredState: ({
    attributes,
    propertyFallbacks,
  }) => {
    const legacyState = propertyFallbacks.state
    const semanticState = typeof legacyState === 'string'
      ? LEGACY_PUMP_STATE_TO_SEMANTIC[legacyState] ?? legacyState
      : legacyState

    return {
      attributes: { ...attributes },
      propertyFallbacks: {
        ...propertyFallbacks,
        ...(semanticState === undefined ? {} : { state: semanticState }),
      },
    }
  },
  actions: {
    start: ({ emit }) => {
      emit('startRequested')
    },
    stop: ({ emit }) => {
      emit('stopRequested')
    },
  },
}
