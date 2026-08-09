import { RuntimeValueStore } from './runtime-value-store'

export class PreviewRuntime {
  readonly values = new RuntimeValueStore()

  private leaseCount = 0
  private running = false

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
  }

  private stop() {
    this.running = false
    this.values.clear()
  }
}

export const previewRuntime = new PreviewRuntime()
