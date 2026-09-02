import {
  isComponentPropertyValue,
  type ComponentProps,
  type ComponentScalarValue,
} from '../component-system/definition'
import type { ComponentRegistry } from '../component-system/registry'
import type { ComponentSceneNode, SceneDocument } from '../scene/model'
import { resolveEffectiveComponentProps } from './effective-component-props'
import type { RuntimeValueSnapshot } from './runtime-value-store'

export type ComponentPropertyStoreListener = () => void
export type ComponentPropertySnapshot = Readonly<ComponentProps>

export type ComponentDerivedPropertyUpdate = {
  property: string
  value: ComponentScalarValue | undefined
}

const EMPTY_COMPONENT_PROPS: ComponentPropertySnapshot = Object.freeze({})

function isComponentRuntimeNode(
  node: SceneDocument['nodes'][number],
): node is ComponentSceneNode {
  return node.type !== 'core.group'
}

function snapshotsEqual(
  left: ComponentPropertySnapshot | undefined,
  right: ComponentPropertySnapshot,
) {
  if (!left) return false
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false
  return rightKeys.every((key) => Object.is(left[key], right[key]))
}

function freezeProps(props: ComponentProps): ComponentPropertySnapshot {
  return Object.freeze({ ...props })
}

/**
 * Host-owned effective Component Property state for Preview.
 *
 * Layer order is deterministic:
 *
 *   component defaults
 *     < authored Scene propertyFallbacks
 *     < legacy Scene v6 runtime-value bindings
 *     < compiled-DSL derived overrides
 *
 * RuntimeValueStore remains external-source state. This store owns only the
 * Component Property layers consumed by renderers and Component Action
 * handlers. Authored Attributes are intentionally outside this Property store.
 * The base snapshot deliberately excludes compiled-derived overrides so a
 * propagation session can evaluate its own derived graph without reading
 * yesterday's derived state back as host input.
 */
export class ComponentPropertyStore {
  private scene: SceneDocument | null = null
  private runtimeValues: RuntimeValueSnapshot = Object.freeze({})
  private readonly derivedOverrides = new Map<string, ComponentProps>()
  private readonly baseSnapshots = new Map<string, ComponentPropertySnapshot>()
  private readonly snapshots = new Map<string, ComponentPropertySnapshot>()
  private readonly listeners = new Set<ComponentPropertyStoreListener>()

  constructor(private readonly registry: ComponentRegistry) {}

  subscribe = (listener: ComponentPropertyStoreListener) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** default + authored fallback + legacy Scene v6 binding; no DSL override. */
  getNodeBaseSnapshot = (nodeId: string): ComponentPropertySnapshot =>
    this.baseSnapshots.get(nodeId) ?? EMPTY_COMPONENT_PROPS

  /** Final settled snapshot consumed by Preview Renderer and Component Actions. */
  getNodeSnapshot = (nodeId: string): ComponentPropertySnapshot =>
    this.snapshots.get(nodeId) ?? EMPTY_COMPONENT_PROPS

  attachScene(scene: SceneDocument, runtimeValues: RuntimeValueSnapshot) {
    this.scene = scene
    this.runtimeValues = runtimeValues
    this.derivedOverrides.clear()
    this.baseSnapshots.clear()
    this.snapshots.clear()
    this.recomputeAll(true)
  }

  syncRuntimeValues(runtimeValues: RuntimeValueSnapshot) {
    this.runtimeValues = runtimeValues
    if (!this.scene) return false
    return this.recomputeAll(false)
  }

  commitDerivedUpdates(
    nodeId: string,
    updates: readonly ComponentDerivedPropertyUpdate[],
  ) {
    const node = this.requireComponentNode(nodeId)
    const registration = this.registry.require(node.type)
    const nextOverrides: ComponentProps = {
      ...(this.derivedOverrides.get(nodeId) ?? {}),
    }

    for (const update of updates) {
      const property = registration.definition.properties[update.property]
      if (!property) {
        throw new Error(
          `Component ${node.type} does not declare property ${update.property}`,
        )
      }

      if (update.value === undefined) {
        delete nextOverrides[update.property]
        continue
      }

      if (!isComponentPropertyValue(property, update.value)) {
        throw new Error(
          `Invalid derived value for ${node.type}.${update.property}`,
        )
      }

      nextOverrides[update.property] = update.value
    }

    if (Object.keys(nextOverrides).length === 0) {
      this.derivedOverrides.delete(nodeId)
    } else {
      this.derivedOverrides.set(nodeId, nextOverrides)
    }

    return this.recomputeNode(node, true)
  }

  clearDerivedOverrides(nodeId: string) {
    const node = this.requireComponentNode(nodeId)
    if (!this.derivedOverrides.delete(nodeId)) return false
    return this.recomputeNode(node, true)
  }

  reset() {
    const hadState =
      this.scene !== null ||
      this.baseSnapshots.size > 0 ||
      this.snapshots.size > 0 ||
      this.derivedOverrides.size > 0
    this.scene = null
    this.runtimeValues = Object.freeze({})
    this.baseSnapshots.clear()
    this.snapshots.clear()
    this.derivedOverrides.clear()
    if (hadState) this.publish()
  }

  private requireComponentNode(nodeId: string): ComponentSceneNode {
    if (!this.scene) {
      throw new Error('Preview Component Property store has no active scene')
    }
    const node = this.scene.nodes.find((candidate) => candidate.id === nodeId)
    if (!node || !isComponentRuntimeNode(node)) {
      throw new Error(`Preview component node does not exist: ${nodeId}`)
    }
    return node
  }

  private recomputeAll(forcePublish: boolean) {
    if (!this.scene) return false
    let changed = false
    const liveNodeIds = new Set<string>()

    for (const node of this.scene.nodes) {
      if (!isComponentRuntimeNode(node)) continue
      liveNodeIds.add(node.id)
      changed = this.recomputeNode(node, false) || changed
    }

    for (const nodeId of [...this.snapshots.keys()]) {
      if (liveNodeIds.has(nodeId)) continue
      this.baseSnapshots.delete(nodeId)
      this.snapshots.delete(nodeId)
      this.derivedOverrides.delete(nodeId)
      changed = true
    }

    if (changed || forcePublish) this.publish()
    return changed
  }

  private recomputeNode(node: ComponentSceneNode, publish: boolean) {
    const registration = this.registry.get(node.type)
    const base = freezeProps(
      registration
        ? resolveEffectiveComponentProps(
            registration.definition,
            node.propertyFallbacks,
            node.bindings,
            this.runtimeValues,
          )
        : node.propertyFallbacks,
    )
    const effective = freezeProps({
      ...base,
      ...(this.derivedOverrides.get(node.id) ?? {}),
    })

    const previousBase = this.baseSnapshots.get(node.id)
    const previousEffective = this.snapshots.get(node.id)
    const baseChanged = !snapshotsEqual(previousBase, base)
    const effectiveChanged = !snapshotsEqual(previousEffective, effective)

    if (!baseChanged && !effectiveChanged) return false
    if (baseChanged) this.baseSnapshots.set(node.id, base)
    if (effectiveChanged) this.snapshots.set(node.id, effective)
    if (publish) this.publish()
    return true
  }

  private publish() {
    for (const listener of this.listeners) listener()
  }
}
