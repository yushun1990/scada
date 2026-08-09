import type { RuntimeValueStore } from './runtime-value-store'

export type RuntimeDataSourceStop = () => void

export interface RuntimeDataSource {
  readonly id: string
  start(values: RuntimeValueStore): RuntimeDataSourceStop
}
