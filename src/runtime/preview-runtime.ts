import type { RuntimeDataSource, RuntimeDataSourceStop } from './data-source'
import { createDefaultPreviewMockSources } from './mock-data-source'
import { RuntimeValueStore } from './runtime-value-store'

export class PreviewRuntime {
  readonly values = new RuntimeValueStore()

  private readonly sources: readonly RuntimeDataSource[]
  private sourceStops: RuntimeDataSourceStop[] = []
  private leaseCount = 0
  private running = false

  constructor(sources: readonly RuntimeDataSource[] = []) {
    this.sources = [...sources]
  }

  get isRunning() {
    return this.running
  }

  acquire() {
    this.leaseCount += 1

    if (this.leaseCount === 1) {
      this.start()
    }

    let released = false

    return () => {
      if (released) {
        return
      }

      released = true
      this.leaseCount = Math.max(0, this.leaseCount - 1)

      if (this.leaseCount === 0) {
        this.stop()
      }
    }
  }

  private start() {
    this.values.clear()
    this.running = true
    const sourceStops: RuntimeDataSourceStop[] = []

    try {
      for (const source of this.sources) {
        sourceStops.push(source.start(this.values))
      }
    } catch (error) {
      for (const stop of sourceStops.reverse()) {
        stop()
      }

      this.running = false
      this.values.clear()
      throw error
    }

    this.sourceStops = sourceStops
  }

  private stop() {
    for (const stop of this.sourceStops.reverse()) {
      stop()
    }

    this.sourceStops = []
    this.running = false
    this.values.clear()
  }
}

export const previewRuntime = new PreviewRuntime(
  createDefaultPreviewMockSources(),
)
