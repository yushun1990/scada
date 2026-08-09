import type { RuntimeDataSource } from './data-source'
import type { RuntimeValue } from './runtime-value-store'

export const MOCK_INDICATOR_STATE_KEY = 'mock.indicator.state' as const

export type SequenceMockDataSourceOptions = {
  id: string
  key: string
  values: readonly RuntimeValue[]
  intervalMs: number
}

export type PreviewRuntimeValueSourceDefinition = {
  id: string
  key: string
  title: string
  values: readonly RuntimeValue[]
  intervalMs: number
}

export const DEFAULT_PREVIEW_RUNTIME_VALUE_SOURCES: readonly PreviewRuntimeValueSourceDefinition[] = [
  {
    id: 'mock.indicator.state-cycle',
    key: MOCK_INDICATOR_STATE_KEY,
    title: '模拟状态循环 · 停止 / 运行 / 警告 / 报警',
    values: ['off', 'normal', 'warning', 'alarm'],
    intervalMs: 1200,
  },
]

export function createSequenceMockDataSource(
  options: SequenceMockDataSourceOptions,
): RuntimeDataSource {
  if (options.values.length === 0) {
    throw new Error('Sequence mock data source requires at least one value')
  }

  if (!Number.isFinite(options.intervalMs) || options.intervalMs <= 0) {
    throw new Error('Sequence mock data source interval must be positive')
  }

  return {
    id: options.id,
    start(store) {
      let index = 0
      store.set(options.key, options.values[index]!)

      const timer = globalThis.setInterval(() => {
        index = (index + 1) % options.values.length
        store.set(options.key, options.values[index]!)
      }, options.intervalMs)

      return () => {
        globalThis.clearInterval(timer)
      }
    },
  }
}

export function createDefaultPreviewMockSources(): RuntimeDataSource[] {
  return DEFAULT_PREVIEW_RUNTIME_VALUE_SOURCES.map((source) =>
    createSequenceMockDataSource(source),
  )
}
