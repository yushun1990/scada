import { builtInComponentRegistry } from '../component-system/builtins'
import { isGroupNode, type SceneDocument } from '../scene/model'
import type { RuntimeDataSource, RuntimeDataSourceStop } from './data-source'
import { resolveEffectiveComponentProps } from './effective-component-props'
import { createDefaultPreviewMockSources } from './mock-data-source'
import { RuntimeValueStore } from './runtime-value-store'

const MAX_BEHAVIOR_DISPATCH_DEPTH = 32

export type ComponentRuntimeEvent = {
  sequence: number
  timestamp: number
  nodeId: string
  componentType: string
  eventName: string
  payload?: unknown
}

export type ComponentRuntimeEventListener = (
  event: ComponentRuntimeEvent,
) => void

export class PreviewRuntime {
  readonly values = new RuntimeValueStore()

  private readonly sources: readonly RuntimeDataSource[]
  private readonly eventListeners = new Set<ComponentRuntimeEventListener>()
  private sourceStops: RuntimeDataSourceStop[] = []
  private scene: SceneDocument | null = null
  private leaseCount = 0
  private running = false
  private eventSequence = 0
  private behaviorDispatchDepth = 0

  constructor(sources: readonly RuntimeDataSource[] = []) {
    this.sources = [...sources]
  }

  get isRunning() {
    return this.running
  }

  acquire(scene: SceneDocument) {
    if (this.scene && this.scene.id !== scene.id) {
      throw new Error(
        `Preview runtime is already active for scene ${this.scene.id}`,
      )
    }

    this.leaseCount += 1
    this.scene = scene

    if (this.leaseCount === 1) {
      try {
        this.start()
      } catch (error) {
        this.leaseCount = 0
        this.scene = null
        throw error
      }
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

  invokeAction(nodeId: string, actionName: string, input?: unknown) {
    const target = this.requireComponentTarget(nodeId)
    const action = target.registration.definition.actions[actionName]

    if (!action) {
      throw new Error(
        `Component ${target.node.type} does not declare action ${actionName}`,
      )
    }

    const handler = target.registration.actions?.[actionName]

    if (!handler) {
      throw new Error(
        `Component ${target.node.type} action ${actionName} has no runtime implementation`,
      )
    }

    const props = Object.freeze(
      resolveEffectiveComponentProps(
        target.registration.definition,
        target.node.props,
        target.node.bindings,
        this.values.getSnapshot(),
      ),
    )

    return handler(
      {
        nodeId,
        componentType: target.node.type,
        props,
        emit: (eventName, payload) => {
          this.emitEvent(nodeId, eventName, payload)
        },
      },
      input,
    )
  }

  emitEvent(nodeId: string, eventName: string, payload?: unknown) {
    const target = this.requireComponentTarget(nodeId)

    if (!target.registration.definition.events[eventName]) {
      throw new Error(
        `Component ${target.node.type} does not declare event ${eventName}`,
      )
    }

    const event: ComponentRuntimeEvent = Object.freeze({
      sequence: ++this.eventSequence,
      timestamp: Date.now(),
      nodeId,
      componentType: target.node.type,
      eventName,
      payload,
    })

    for (const listener of [...this.eventListeners]) {
      listener(event)
    }

    this.dispatchBehaviors(event)
    return event
  }

  subscribeEvents(listener: ComponentRuntimeEventListener) {
    this.eventListeners.add(listener)

    return () => {
      this.eventListeners.delete(listener)
    }
  }

  private dispatchBehaviors(event: ComponentRuntimeEvent) {
    if (!this.scene) {
      return
    }

    if (this.behaviorDispatchDepth >= MAX_BEHAVIOR_DISPATCH_DEPTH) {
      throw new Error(
        `Runtime behavior dispatch exceeded ${MAX_BEHAVIOR_DISPATCH_DEPTH} nested steps`,
      )
    }

    const sourceNode = this.scene.nodes.find(
      (candidate) => candidate.id === event.nodeId,
    )

    if (!sourceNode || isGroupNode(sourceNode)) {
      return
    }

    const matchingBehaviors = sourceNode.behaviors.filter(
      (behavior) => behavior.trigger.event === event.eventName,
    )

    if (matchingBehaviors.length === 0) {
      return
    }

    this.behaviorDispatchDepth += 1

    try {
      for (const behavior of matchingBehaviors) {
        this.invokeAction(
          behavior.effect.targetNodeId,
          behavior.effect.action,
        )
      }
    } finally {
      this.behaviorDispatchDepth -= 1
    }
  }

  private requireComponentTarget(nodeId: string) {
    if (!this.running || !this.scene) {
      throw new Error('Preview runtime is not running')
    }

    const node = this.scene.nodes.find((candidate) => candidate.id === nodeId)

    if (!node || isGroupNode(node)) {
      throw new Error(`Runtime component node does not exist: ${nodeId}`)
    }

    return {
      node,
      registration: builtInComponentRegistry.require(node.type),
    }
  }

  private start() {
    this.values.clear()
    this.eventSequence = 0
    this.behaviorDispatchDepth = 0
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
    this.scene = null
    this.behaviorDispatchDepth = 0
  }
}

export const previewRuntime = new PreviewRuntime(
  createDefaultPreviewMockSources(),
)
