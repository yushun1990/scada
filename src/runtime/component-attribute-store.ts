import type {
  ComponentAttributeValues,
  ComponentScalarValue,
} from '../component-system/definition'
import type { ComponentRegistry } from '../component-system/registry'
import type { ComponentSceneNode, SceneDocument } from '../scene/model'

export type ComponentAttributeSnapshot = Readonly<ComponentAttributeValues>
export type ComponentAttributeStoreListener = () => void

const EMPTY_COMPONENT_ATTRIBUTES: ComponentAttributeSnapshot = Object.freeze({})

function isComponentRuntimeNode(
  node: SceneDocument['nodes'][number],
): node is ComponentSceneNode {
  return node.type !== 'core.group'
}

function snapshotsEqual(
  left: ComponentAttributeSnapshot | undefined,
  right: ComponentAttributeSnapshot,
) {
  if (!left) return false
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false
  return rightKeys.every((key) => Object.is(left[key], right[key]))
}

function freezeAttributes(
  attributes: Readonly<Record<string, ComponentScalarValue>>,
): ComponentAttributeSnapshot {
  return Object.freeze({ ...attributes })
}

/**
 * Host-owned authored Attribute snapshots for Preview runtime.
 *
 * Attributes have no telemetry / derived override layers. The store exists so
 * Renderer and Component Action handlers consume the exact same immutable
 * authored snapshot while the Property store independently owns effective
 * runtime Property truth.
 */
export class ComponentAttributeStore {
  private readonly snapshots = new Map<string, ComponentAttributeSnapshot>()
  private readonly listeners = new Set<ComponentAttributeStoreListener>()

  constructor(private readonly registry: ComponentRegistry) {}

  subscribe = (listener: ComponentAttributeStoreListener) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getNodeSnapshot = (nodeId: string): ComponentAttributeSnapshot =>
    this.snapshots.get(nodeId) ?? EMPTY_COMPONENT_ATTRIBUTES

  attachScene(scene: SceneDocument) {
    let changed = false
    const liveNodeIds = new Set<string>()

    for (const node of scene.nodes) {
      if (!isComponentRuntimeNode(node)) continue
      liveNodeIds.add(node.id)
      const registration = this.registry.get(node.type)
      if (!registration) continue

      const attributes: ComponentAttributeValues = {}
      for (const [key, definition] of Object.entries(
        registration.definition.attributes,
      )) {
        attributes[key] = node.attributes[key] ?? definition.defaultValue
      }

      const next = freezeAttributes(attributes)
      const previous = this.snapshots.get(node.id)
      if (!snapshotsEqual(previous, next)) {
        this.snapshots.set(node.id, next)
        changed = true
      }
    }

    for (const nodeId of [...this.snapshots.keys()]) {
      if (!liveNodeIds.has(nodeId)) {
        this.snapshots.delete(nodeId)
        changed = true
      }
    }

    if (changed) this.publish()
    return changed
  }

  reset() {
    if (this.snapshots.size === 0) return
    this.snapshots.clear()
    this.publish()
  }

  private publish() {
    for (const listener of this.listeners) listener()
  }
}
