import {
  createControlledComponentRuntime,
  type ControlledComponentRuntime,
  type ControlledRuntimeDiagnosticEntry,
  type ControlledRuntimeVisualValue,
} from '../component-system/controlledRuntime'
import {
  isComponentPropertyValue,
  type ComponentDefinition,
  type ComponentProps,
  type ComponentScalarValue,
} from '../component-system/definition'
import type { ComponentVisualDefinition } from '../component-system/visual'
import {
  composeVisualRuntimeContribution,
  type VisualRuntimeOverlay,
  type VisualRuntimeTarget,
} from '../component-system/visualRuntime'
import {
  applyVisualRuntimeAbsoluteState,
  type VisualRuntimeAbsoluteState,
  type VisualRuntimeLayerState,
} from '../component-system/visualRuntimeState'

export type ControlledRuntimeSessionCallbacks = {
  emitEvent?: (eventName: string, payload?: unknown) => void
  invokeAction?: (actionName: string, input?: unknown) => unknown | Promise<unknown>
  reportDiagnostic?: (entry: ControlledRuntimeDiagnosticEntry) => void
}

type VisualContributionSlot = {
  layerId: string
  target: VisualRuntimeTarget
  contribution: ControlledRuntimeVisualValue
}

export class ControlledRuntimeSession {
  readonly runtime: ControlledComponentRuntime

  private readonly propertyOverrides = new Map<string, ComponentScalarValue>()
  private readonly absoluteVisualValues = new Map<string, VisualRuntimeLayerState>()
  private readonly contributionSlots = new Map<string, VisualContributionSlot>()
  private readonly diagnostics: ControlledRuntimeDiagnosticEntry[] = []
  private disposed = false

  constructor(
    private readonly definition: ComponentDefinition,
    private readonly visual: ComponentVisualDefinition,
    private readonly readBaseProperties: () => Readonly<ComponentProps>,
    private readonly callbacks: ControlledRuntimeSessionCallbacks = {},
  ) {
    this.runtime = createControlledComponentRuntime(definition, visual, {
      readProperty: (key) => this.getEffectiveProperties()[key] ?? null,
      writeProperty: (key, value) => {
        this.requireActive()
        this.propertyOverrides.set(key, value)
      },
      clearProperty: (key) => {
        this.requireActive()
        this.propertyOverrides.delete(key)
      },
      emitEvent: (eventName, payload) => {
        this.requireActive()
        if (!this.callbacks.emitEvent) {
          throw new Error('Controlled Runtime Event host capability 不可用')
        }
        this.callbacks.emitEvent(eventName, payload)
      },
      invokeAction: (actionName, input) => {
        this.requireActive()
        if (!this.callbacks.invokeAction) {
          throw new Error('Controlled Runtime Action host capability 不可用')
        }
        return this.callbacks.invokeAction(actionName, input)
      },
      setVisualValue: (layerId, target, value) => {
        this.requireActive()
        const state = this.absoluteVisualValues.get(layerId) ?? {}
        ;(state as Record<string, number | boolean | undefined>)[target] = value
        this.absoluteVisualValues.set(layerId, state)
      },
      clearVisualValue: (layerId, target) => {
        this.requireActive()
        const state = this.absoluteVisualValues.get(layerId)
        if (!state) return

        delete (state as Record<string, number | boolean | undefined>)[target]
        if (Object.keys(state).length === 0) {
          this.absoluteVisualValues.delete(layerId)
        }
      },
      setVisualContribution: (controlId, layerId, target, contribution) => {
        this.requireActive()
        this.contributionSlots.set(controlId, { layerId, target, contribution })
      },
      clearVisualContribution: (controlId) => {
        this.requireActive()
        this.contributionSlots.delete(controlId)
      },
      reportDiagnostic: (entry) => {
        this.requireActive()
        const frozen = Object.freeze({ ...entry })
        this.diagnostics.push(frozen)
        this.callbacks.reportDiagnostic?.(frozen)
      },
    })
  }

  get isDisposed() {
    return this.disposed
  }

  getEffectiveProperties(): Readonly<ComponentProps> {
    this.requireActive()
    const base = this.readBaseProperties()
    const effective: ComponentProps = {}

    for (const [key, property] of Object.entries(this.definition.properties)) {
      const baseValue = base[key]
      effective[key] = isComponentPropertyValue(property, baseValue)
        ? baseValue
        : property.defaultValue
    }

    for (const [key, value] of this.propertyOverrides) {
      effective[key] = value
    }

    return Object.freeze(effective)
  }

  getVisualAbsoluteState(): VisualRuntimeAbsoluteState {
    this.requireActive()
    return Object.freeze(
      Object.fromEntries(
        [...this.absoluteVisualValues.entries()].map(([layerId, state]) => [
          layerId,
          Object.freeze({ ...state }),
        ]),
      ),
    )
  }

  getVisualContributionOverlay(): VisualRuntimeOverlay {
    this.requireActive()
    const overlay: VisualRuntimeOverlay = {}

    for (const slot of this.contributionSlots.values()) {
      composeVisualRuntimeContribution(
        overlay,
        slot.layerId,
        slot.target,
        slot.contribution,
      )
    }

    return overlay
  }

  applyVisualAbsoluteState(
    visual: ComponentVisualDefinition,
  ): ComponentVisualDefinition {
    return applyVisualRuntimeAbsoluteState(visual, this.getVisualAbsoluteState())
  }

  getDiagnostics(): readonly ControlledRuntimeDiagnosticEntry[] {
    this.requireActive()
    return Object.freeze(this.diagnostics.map((entry) => Object.freeze({ ...entry })))
  }

  reset() {
    this.requireActive()
    this.propertyOverrides.clear()
    this.absoluteVisualValues.clear()
    this.contributionSlots.clear()
    this.diagnostics.length = 0
  }

  dispose() {
    if (this.disposed) return
    this.propertyOverrides.clear()
    this.absoluteVisualValues.clear()
    this.contributionSlots.clear()
    this.diagnostics.length = 0
    this.disposed = true
  }

  private requireActive() {
    if (this.disposed) {
      throw new Error('Controlled Runtime Session 已释放')
    }
  }
}
