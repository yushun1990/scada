import { createCompositeComponentRegistration } from '../../component-system/composite-registration'
import type { ComponentRegistration } from '../../component-system/registration'
import { ComponentRegistry } from '../../component-system/registry'
import type { RuntimeDataSource } from '../../runtime/data-source'
import type { ScadaDeviceActionDispatcher } from '../../runtime/device-action-dispatcher'
import { PreviewRuntime } from '../../runtime/preview-runtime'
import {
  attachPreviewScadaSemantics,
  type PreviewScadaSemanticsAttachment,
} from '../../runtime/preview-scada-semantics'
import type { ScadaPrimaryDeviceContext } from '../../scene/scada-behavior-contract'
import { compileScadaDslRuntime, type ScadaDslCompiledRuntime } from '../../scene/scada-dsl-runtime'
import type {
  ScadaDslSemanticExpression,
  ScadaDslSemanticPlan,
} from '../../scene/scada-dsl-semantics'
import { restoreScadaSemanticPlan } from '../../scene/scada-semantics-persistence'
import {
  isComponentNode,
  type ComponentSceneNode,
  type SceneDocument,
} from '../../scene/schema'
import { parseSceneDocumentWithRegistry } from '../../scene/validation-core'
import {
  parseScadaWorkPackage,
  type ScadaWorkPackage,
} from '../scada-works/scada-work-package'

export type StandaloneRuntimePrimaryDeviceResolver = (
  node: ComponentSceneNode,
) => ScadaPrimaryDeviceContext | null

export type StandaloneRuntimeHostOptions = Readonly<{
  dataSources?: readonly RuntimeDataSource[]
  deviceActionDispatcher?: ScadaDeviceActionDispatcher
  resolvePrimaryDevice?: StandaloneRuntimePrimaryDeviceResolver
}>

type StandaloneSemanticProgram = Readonly<{
  nodeId: string
  compiled: ScadaDslCompiledRuntime
  primaryDevice: ScadaPrimaryDeviceContext | null
}>

export type StandaloneWorkRuntime = Readonly<{
  workPackage: ScadaWorkPackage
  registry: ComponentRegistry
  runtime: PreviewRuntime
  semanticProgramCount: number
  acquire(): () => void
}>

function expressionUsesPrimaryDevice(
  expression: ScadaDslSemanticExpression,
): boolean {
  if (expression.kind === 'literal') return false
  if (expression.kind === 'reference') {
    return (
      expression.reference.kind === 'source-property' &&
      expression.reference.reference.scope === 'primary-device'
    )
  }
  if (expression.kind === 'unary') {
    return expressionUsesPrimaryDevice(expression.operand)
  }
  if (expression.kind === 'binary') {
    return (
      expressionUsesPrimaryDevice(expression.left) ||
      expressionUsesPrimaryDevice(expression.right)
    )
  }
  return (
    expressionUsesPrimaryDevice(expression.condition) ||
    expressionUsesPrimaryDevice(expression.consequent) ||
    expressionUsesPrimaryDevice(expression.alternate)
  )
}

function planUsesPrimaryDevice(plan: ScadaDslSemanticPlan) {
  for (const binding of plan.valueBindings) {
    if (expressionUsesPrimaryDevice(binding.expression)) return true
  }

  for (const behavior of plan.behaviors) {
    for (const branch of behavior.branches) {
      if (branch.condition && expressionUsesPrimaryDevice(branch.condition)) {
        return true
      }
      for (const action of branch.actions) {
        if (action.arguments.some(expressionUsesPrimaryDevice)) return true
      }
    }
  }

  for (const interaction of plan.interactions) {
    if (interaction.action.target.scope === 'primary-device') return true
    if (interaction.action.arguments.some(expressionUsesPrimaryDevice)) return true
  }

  return false
}

function prepareSemanticPrograms(
  scene: SceneDocument,
  options: StandaloneRuntimeHostOptions,
): readonly StandaloneSemanticProgram[] {
  const programs: StandaloneSemanticProgram[] = []

  for (const node of scene.nodes) {
    if (!isComponentNode(node) || !node.scadaSemantics) continue

    const plan = restoreScadaSemanticPlan(node.scadaSemantics)
    const compiled = compileScadaDslRuntime(plan)

    if (plan.interactions.length > 0 && !options.deviceActionDispatcher) {
      throw new Error(
        `Standalone SCADA semantics for node ${node.id} requires a device-action dispatcher`,
      )
    }

    const primaryDevice = options.resolvePrimaryDevice?.(node) ?? null
    if (planUsesPrimaryDevice(plan) && !primaryDevice) {
      throw new Error(
        `Standalone SCADA semantics for node ${node.id} requires a primary-device host capability`,
      )
    }

    programs.push({
      nodeId: node.id,
      compiled,
      primaryDevice,
    })
  }

  return programs
}

function createRuntimeAcquire(
  runtime: PreviewRuntime,
  scene: SceneDocument,
  programs: readonly StandaloneSemanticProgram[],
  options: StandaloneRuntimeHostOptions,
) {
  let leaseCount = 0
  let runtimeRelease: (() => void) | null = null
  let attachments: PreviewScadaSemanticsAttachment[] = []

  const start = () => {
    const release = runtime.acquire(scene)
    const nextAttachments: PreviewScadaSemanticsAttachment[] = []

    try {
      for (const program of programs) {
        nextAttachments.push(
          attachPreviewScadaSemantics(
            runtime,
            program.nodeId,
            program.compiled,
            {
              primaryDevice: program.primaryDevice,
              deviceActionDispatcher: options.deviceActionDispatcher,
            },
          ),
        )
      }
    } catch (error) {
      for (const attachment of nextAttachments.reverse()) {
        attachment.dispose()
      }
      release()
      throw error
    }

    runtimeRelease = release
    attachments = nextAttachments
  }

  return () => {
    if (leaseCount === 0) start()
    leaseCount += 1
    let released = false

    return () => {
      if (released) return
      released = true
      leaseCount = Math.max(0, leaseCount - 1)
      if (leaseCount > 0) return

      try {
        for (const attachment of attachments.reverse()) {
          attachment.dispose()
        }
      } finally {
        attachments = []
        runtimeRelease?.()
        runtimeRelease = null
      }
    }
  }
}

/**
 * Build one isolated runtime directly from the accepted M8 work artifact.
 *
 * Host/native registrations, runtime data sources, primary-device resolution
 * and outbound device-action dispatch are explicit host capabilities. Portable
 * dependencies and canonical Scene v7 semantics remain package authority.
 */
export function createStandaloneWorkRuntimeWithHost(
  candidate: ScadaWorkPackage,
  hostRegistrations: readonly ComponentRegistration[],
  options: StandaloneRuntimeHostOptions = {},
): StandaloneWorkRuntime {
  const hostCapabilities = new ComponentRegistry(hostRegistrations)
  const workPackage = parseScadaWorkPackage(candidate, hostCapabilities)

  if (!workPackage) {
    throw new Error('SCADA work package is invalid or dependency-incomplete')
  }

  const portableRegistrations = workPackage.dependencies.map((dependency) =>
    createCompositeComponentRegistration(
      dependency.definition,
      dependency.visual,
    ),
  )
  const registry = new ComponentRegistry([
    ...hostRegistrations,
    ...portableRegistrations,
  ])

  // Re-run Scene validation against the actual renderer/action registrations
  // that will own this runtime, rather than only the codec's validation overlay.
  const scene = parseSceneDocumentWithRegistry(
    JSON.stringify(workPackage.scene),
    registry,
  )
  const normalizedWorkPackage: ScadaWorkPackage = {
    ...workPackage,
    scene,
  }
  const semanticPrograms = prepareSemanticPrograms(scene, options)
  const runtime = new PreviewRuntime(options.dataSources ?? [], registry)

  return {
    workPackage: normalizedWorkPackage,
    registry,
    runtime,
    semanticProgramCount: semanticPrograms.length,
    acquire: createRuntimeAcquire(runtime, scene, semanticPrograms, options),
  }
}
