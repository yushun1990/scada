import type {
  ComponentActionArguments,
  ComponentEventPayload,
} from '../component-system/definition'
import {
  normalizeComponentActionArguments,
  normalizeComponentEventPayload,
} from '../component-system/interactions'
import type { ComponentRegistry } from '../component-system/registry'
import type { ComponentSceneNode, SceneDocument } from '../scene/model'
import { ComponentAttributeStore } from './component-attribute-store'
import { ComponentPropertyStore } from './component-property-store'
import type { RuntimeDataSource, RuntimeDataSourceStop } from './data-source'
import { RuntimeValueStore } from './runtime-value-store'

const MAX_BEHAVIOR_DISPATCH_DEPTH = 32

function isComponentRuntimeNode(
  node: SceneDocument['nodes'][number],
): node is ComponentSceneNode {
  return node.type !== 'core.group'
}

export type ComponentRuntimeEvent = {
  sequence: number
  timestamp: number
  nodeId: string
  componentType: string
  eventName: string
  payload?: ComponentEventPayload
}

export type ComponentRuntimeEventListener = (
  event: ComponentRuntimeEvent,
) => void

export class PreviewRuntime {
  readonly values = new RuntimeValueStore()
  readonly componentAttributes: ComponentAttributeStore
  readonly componentProps: ComponentPropertyStore

  private readonly sources: readonly RuntimeDataSource[]
  private readonly registry: ComponentRegistry
  private readonly eventListeners = new Set<ComponentRuntimeEventListener>()
  private readonly compiledSemanticClaims = new Map<string, number>()
  private sourceStops: RuntimeDataSourceStop[] = []
  private runtimeValueStop: (() => void) | null = null
  private scene: SceneDocument | null = null
  private leaseCount = 0
  private running = false
  private eventSequence = 0
  private behaviorDispatchDepth = 0

  constructor(
    sources: readonly RuntimeDataSource[],
    registry: ComponentRegistry,
  ) {
    this.sources = [...sources]
    this.registry = registry
    this.componentAttributes = new ComponentAttributeStore(registry)
    this.componentProps = new ComponentPropertyStore(registry)
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

  /**
   * Reserve one component node for the compiled SCADA semantics path.
   *
   * While claimed, Component Events are still published to subscribers, but
   * legacy Scene v6 Event -> Component Action behaviors are not auto-dispatched
   * for that node. The compiled Interaction path therefore cannot race the
   * compatibility Event -> Component Action path.
   */
  claimCompiledSemantics(nodeId: string) {
    this.requireComponentTarget(nodeId)
    this.compiledSemanticClaims.set(
      nodeId,
      (this.compiledSemanticClaims.get(nodeId) ?? 0) + 1,
    )

    let released = false
    return () => {
      if (released) return
      released = true
      const count = this.compiledSemanticClaims.get(nodeId) ?? 0
      if (count <= 1) this.compiledSemanticClaims.delete(nodeId)
      else this.compiledSemanticClaims.set(nodeId, count - 1)
    }
  }

  invokeAction(
    nodeId: string,
    actionName: string,
    argumentsValue: ComponentActionArguments = [],
  ) {
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

    const normalizedArguments = normalizeComponentActionArguments(
      action,
      argumentsValue,
      `Component ${target.node.type} Action ${actionName}`,
    )

    // Renderer and Action handlers consume the exact same host-owned snapshots:
    // authored Attributes remain separate from the settled effective Property
    // snapshot, and neither path independently reconstructs runtime state.
    const attributes = this.componentAttributes.getNodeSnapshot(nodeId)
    const properties = this.componentProps.getNodeSnapshot(nodeId)

    return handler(
      {
        nodeId,
        componentType: target.node.type,
        attributes,
        properties,
        emit: (eventName, payload) => {
          this.emitEvent(nodeId, eventName, payload)
        },
      },
      normalizedArguments,
    )
  }

  emitEvent(
    nodeId: string,
    eventName: string,
    payload?: ComponentEventPayload,
  ) {
    const target = this.requireComponentTarget(nodeId)
    const eventDefinition = target.registration.definition.events[eventName]

    if (!eventDefinition) {
      throw new Error(
        `Component ${target.node.type} does not declare event ${eventName}`,
      )
    }

    const normalizedPayload = normalizeComponentEventPayload(
      eventDefinition,
      payload,
      `Component ${target.node.type} Event ${eventName}`,
    )
    const event: ComponentRuntimeEvent = Object.freeze({
      sequence: ++this.eventSequence,
      timestamp: Date.now(),
      nodeId,
      componentType: target.node.type,
      eventName,
      payload: normalizedPayload,
    })

    for (const listener of [...this.eventListeners]) {
      listener(event)
    }

    if (!this.compiledSemanticClaims.has(nodeId)) {
      this.dispatchLegacySceneBehaviors(event)
    }
    return event
  }

  subscribeEvents(listener: ComponentRuntimeEventListener) {
    this.eventListeners.add(listener)

    return () => {
      this.eventListeners.delete(listener)
    }
  }

  private dispatchLegacySceneBehaviors(event: ComponentRuntimeEvent) {
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

    if (!sourceNode || !isComponentRuntimeNode(sourceNode)) {
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

    if (!node || !isComponentRuntimeNode(node)) {
      throw new Error(`Runtime component node does not exist: ${nodeId}`)
    }

    return {
      node,
      registration: this.registry.require(node.type),
    }
  }

  private start() {
    if (!this.scene) {
      throw new Error('Preview runtime cannot start without a scene')
    }

    this.values.clear()
    this.eventSequence = 0
    this.behaviorDispatchDepth = 0
    this.compiledSemanticClaims.clear()
    this.componentAttributes.attachScene(this.scene)
    this.componentProps.attachScene(this.scene, this.values.getSnapshot())
    this.runtimeValueStop = this.values.subscribe(() => {
      this.componentProps.syncRuntimeValues(this.values.getSnapshot())
    })
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

      this.runtimeValueStop?.()
      this.runtimeValueStop = null
      this.componentAttributes.reset()
      this.componentProps.reset()
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
    this.runtimeValueStop?.()
    this.runtimeValueStop = null
    this.running = false
    this.values.clear()
    this.componentAttributes.reset()
    this.componentProps.reset()
    this.compiledSemanticClaims.clear()
    this.scene = null
    this.behaviorDispatchDepth = 0
  }
}
