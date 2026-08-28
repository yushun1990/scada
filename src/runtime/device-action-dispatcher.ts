import type { ComponentActionArguments } from '../component-system/definition'

export type ScadaDeviceActionInvocation = Readonly<{
  interactionId: string
  sourceId: string
  action: string
  arguments: ComponentActionArguments
}>

/**
 * Outbound Device/Platform Actions are a separate host capability from inbound
 * RuntimeDataSource telemetry. Implementations may enqueue network work, RPC or
 * platform commands, but the SCADA runtime only emits one typed invocation.
 */
export interface ScadaDeviceActionDispatcher {
  dispatch(invocation: ScadaDeviceActionInvocation): void
}

export function createScadaDeviceActionInvocation(
  interactionId: string,
  sourceId: string,
  action: string,
  argumentsValue: ComponentActionArguments,
): ScadaDeviceActionInvocation {
  return Object.freeze({
    interactionId,
    sourceId,
    action,
    arguments: Object.freeze([...argumentsValue]),
  })
}
