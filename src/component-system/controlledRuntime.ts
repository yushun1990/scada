import {
  isComponentPropertyValue,
  type ComponentDefinition,
  type ComponentScalarValue,
} from './definition'
import type { ComponentVisualDefinition } from './visual'
import {
  VISUAL_RUNTIME_TARGET_DESCRIPTORS,
  type VisualRuntimeTarget,
} from './visualRuntime'

export type ControlledRuntimeDiagnosticLevel = 'debug' | 'info' | 'warn' | 'error'

export type ControlledRuntimeDiagnosticEntry = {
  level: ControlledRuntimeDiagnosticLevel
  message: string
  details?: unknown
}

export type ControlledRuntimeVisualValue = number | boolean

export type ControlledRuntimeHost = {
  readProperty: (key: string) => ComponentScalarValue
  writeProperty: (key: string, value: ComponentScalarValue) => void
  clearProperty: (key: string) => void
  emitEvent: (eventName: string, payload?: unknown) => void
  invokeAction: (actionName: string, input?: unknown) => unknown | Promise<unknown>
  setVisualValue: (
    layerId: string,
    target: VisualRuntimeTarget,
    value: ControlledRuntimeVisualValue,
  ) => void
  clearVisualValue: (layerId: string, target: VisualRuntimeTarget) => void
  setVisualContribution: (
    controlId: string,
    layerId: string,
    target: VisualRuntimeTarget,
    contribution: ControlledRuntimeVisualValue,
  ) => void
  clearVisualContribution: (controlId: string) => void
  reportDiagnostic: (entry: ControlledRuntimeDiagnosticEntry) => void
}

export type ControlledComponentRuntime = Readonly<{
  properties: Readonly<{
    get: (key: string) => ComponentScalarValue
    set: (key: string, value: ComponentScalarValue) => void
    clear: (key: string) => void
  }>
  events: Readonly<{
    emit: (eventName: string, payload?: unknown) => void
  }>
  actions: Readonly<{
    invoke: (actionName: string, input?: unknown) => unknown | Promise<unknown>
  }>
  visual: Readonly<{
    set: (
      layerId: string,
      target: VisualRuntimeTarget,
      value: ControlledRuntimeVisualValue,
    ) => void
    clear: (layerId: string, target: VisualRuntimeTarget) => void
    contribute: (
      controlId: string,
      layerId: string,
      target: VisualRuntimeTarget,
      contribution: ControlledRuntimeVisualValue,
    ) => void
    clearContribution: (controlId: string) => void
  }>
  diagnostics: Readonly<{
    log: (
      level: ControlledRuntimeDiagnosticLevel,
      message: string,
      details?: unknown,
    ) => void
  }>
}>

function requireProperty(definition: ComponentDefinition, key: string) {
  const property = definition.properties[key]
  if (!property) {
    throw new Error(`Controlled Runtime 引用了不存在的 Property：${key}`)
  }
  return property
}

function requireEvent(definition: ComponentDefinition, eventName: string) {
  if (!definition.events[eventName]) {
    throw new Error(`Controlled Runtime 引用了不存在的 Event：${eventName}`)
  }
}

function requireAction(definition: ComponentDefinition, actionName: string) {
  if (!definition.actions[actionName]) {
    throw new Error(`Controlled Runtime 引用了不存在的 Action：${actionName}`)
  }
}

function requireLayer(visual: ComponentVisualDefinition, layerId: string) {
  if (!visual.layers.some((layer) => layer.id === layerId)) {
    throw new Error(`Controlled Runtime 引用了不存在的 Layer：${layerId}`)
  }
}

function requireControlId(controlId: string) {
  if (!controlId.trim()) {
    throw new Error('Controlled Runtime visual controlId 不能为空')
  }
}

function assertAbsoluteVisualValue(
  target: VisualRuntimeTarget,
  value: ControlledRuntimeVisualValue,
) {
  const descriptor = VISUAL_RUNTIME_TARGET_DESCRIPTORS[target]

  if (descriptor.valueKind === 'boolean') {
    if (typeof value !== 'boolean') {
      throw new Error(`Controlled Runtime Visual target ${target} 需要 boolean value`)
    }
    return
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Controlled Runtime Visual target ${target} 需要有限 number value`)
  }

  if (target === 'opacity' && (value < 0 || value > 1)) {
    throw new Error('Controlled Runtime opacity absolute value 必须位于 0..1')
  }

  if (
    (target === 'transform.scaleX' || target === 'transform.scaleY') &&
    value === 0
  ) {
    throw new Error(`Controlled Runtime ${target} absolute value 不能为 0`)
  }
}

function assertVisualContribution(
  target: VisualRuntimeTarget,
  value: ControlledRuntimeVisualValue,
) {
  const descriptor = VISUAL_RUNTIME_TARGET_DESCRIPTORS[target]

  if (descriptor.composition === 'gate') {
    if (typeof value !== 'boolean') {
      throw new Error(`Controlled Runtime Visual target ${target} 需要 boolean contribution`)
    }
    return
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Controlled Runtime Visual target ${target} 需要有限 number contribution`)
  }

  if (
    (target === 'transform.scaleX' || target === 'transform.scaleY') &&
    value <= 0
  ) {
    throw new Error(`Controlled Runtime ${target} contribution 必须大于 0`)
  }

  if (target === 'opacity' && (value < 0 || value > 1)) {
    throw new Error('Controlled Runtime opacity contribution 必须位于 0..1')
  }
}

export function createControlledComponentRuntime(
  definition: ComponentDefinition,
  visual: ComponentVisualDefinition,
  host: ControlledRuntimeHost,
): ControlledComponentRuntime {
  const properties = Object.freeze({
    get(key: string) {
      requireProperty(definition, key)
      return host.readProperty(key)
    },
    set(key: string, value: ComponentScalarValue) {
      const property = requireProperty(definition, key)
      if (!isComponentPropertyValue(property, value)) {
        throw new Error(`Controlled Runtime Property ${key} value 类型不匹配`)
      }
      host.writeProperty(key, value)
    },
    clear(key: string) {
      requireProperty(definition, key)
      host.clearProperty(key)
    },
  })

  const events = Object.freeze({
    emit(eventName: string, payload?: unknown) {
      requireEvent(definition, eventName)
      host.emitEvent(eventName, payload)
    },
  })

  const actions = Object.freeze({
    invoke(actionName: string, input?: unknown) {
      requireAction(definition, actionName)
      return host.invokeAction(actionName, input)
    },
  })

  const visualApi = Object.freeze({
    set(
      layerId: string,
      target: VisualRuntimeTarget,
      value: ControlledRuntimeVisualValue,
    ) {
      requireLayer(visual, layerId)
      assertAbsoluteVisualValue(target, value)
      host.setVisualValue(layerId, target, value)
    },
    clear(layerId: string, target: VisualRuntimeTarget) {
      requireLayer(visual, layerId)
      host.clearVisualValue(layerId, target)
    },
    contribute(
      controlId: string,
      layerId: string,
      target: VisualRuntimeTarget,
      contribution: ControlledRuntimeVisualValue,
    ) {
      requireControlId(controlId)
      requireLayer(visual, layerId)
      assertVisualContribution(target, contribution)
      host.setVisualContribution(controlId, layerId, target, contribution)
    },
    clearContribution(controlId: string) {
      requireControlId(controlId)
      host.clearVisualContribution(controlId)
    },
  })

  const diagnostics = Object.freeze({
    log(
      level: ControlledRuntimeDiagnosticLevel,
      message: string,
      details?: unknown,
    ) {
      if (!message.trim()) {
        throw new Error('Controlled Runtime diagnostic message 不能为空')
      }
      host.reportDiagnostic({ level, message, details })
    },
  })

  return Object.freeze({
    properties,
    events,
    actions,
    visual: visualApi,
    diagnostics,
  })
}
