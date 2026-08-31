import {
  createDistributableComponentPackage,
  serializeDistributableComponentPackage,
  type DistributableComponentPackage,
} from '../component-library/distributable-component-package'
import type { ComponentLibraryEntry } from '../component-library/component-document'
import type { InstalledRemoteComponent } from '../component-library/remote-component-installation'
import { isComponentNode, type SceneDocument } from '../../scene/schema'
import type { ScadaWorkPackage } from './scada-work-package'

export type ScadaWorkTransferInventory = Readonly<{
  components: readonly ComponentLibraryEntry[]
  installedRemoteComponents: readonly InstalledRemoteComponent[]
}>

export type ScadaWorkDependencyReuse = Readonly<{
  componentType: string
  source: 'local-authored' | 'installed-remote'
}>

export type ScadaWorkPackageImportPlan =
  | Readonly<{
      kind: 'ready'
      sceneName: string
      dependenciesToImport: readonly DistributableComponentPackage[]
      reusedDependencies: readonly ScadaWorkDependencyReuse[]
    }>
  | Readonly<{
      kind: 'collision'
      componentType: string
      message: string
    }>

function packageDocument(componentPackage: DistributableComponentPackage) {
  return serializeDistributableComponentPackage(componentPackage)
}

function packageFromEntry(entry: ComponentLibraryEntry) {
  try {
    return createDistributableComponentPackage(entry)
  } catch {
    return null
  }
}

function matchingPortableSources(
  componentType: string,
  inventory: ScadaWorkTransferInventory,
) {
  const local = inventory.components.filter(
    (entry) => !entry.builtIn && entry.definition.type === componentType,
  )
  const installed = inventory.installedRemoteComponents.filter(
    (entry) => entry.source.componentType === componentType,
  )
  return { local, installed }
}

/**
 * Resolve the exact portable dependency closure for one persisted Scene.
 *
 * Built-in/native component types are host capabilities and are deliberately
 * omitted. Every referenced non-host type must resolve to exactly one ready
 * local or installed-remote package; ambiguous or missing inventory fails
 * closed before a work artifact is created.
 */
export function resolveScadaWorkDependencies(
  scene: SceneDocument,
  inventory: ScadaWorkTransferInventory,
): DistributableComponentPackage[] {
  const referencedTypes = [...new Set(
    scene.nodes
      .filter(isComponentNode)
      .map((node) => node.type),
  )].sort((left, right) => left.localeCompare(right))
  const builtInTypes = new Set(
    inventory.components
      .filter((entry) => entry.builtIn)
      .map((entry) => entry.definition.type),
  )
  const dependencies: DistributableComponentPackage[] = []

  for (const componentType of referencedTypes) {
    if (builtInTypes.has(componentType)) continue

    const { local, installed } = matchingPortableSources(componentType, inventory)
    if (local.length + installed.length !== 1) {
      throw new Error(
        local.length + installed.length === 0
          ? `作品缺少可分发组件依赖：${componentType}`
          : `作品组件依赖来源不唯一：${componentType}`,
      )
    }

    const entry = local[0] ?? installed[0]?.entry
    const dependency = entry ? packageFromEntry(entry) : null
    if (!dependency) {
      throw new Error(`作品依赖组件不可分发：${componentType}`)
    }
    dependencies.push(dependency)
  }

  return dependencies.sort((left, right) =>
    left.definition.type.localeCompare(right.definition.type),
  )
}

/**
 * Compare a validated work package with current browser component inventory
 * without writing or activating anything.
 *
 * Missing dependencies may be imported. Existing same-type packages are only
 * reusable when their transport-neutral package is byte-for-byte equivalent
 * after normalized serialization; a different local/remote definition fails
 * closed instead of silently changing the runnable work.
 */
export function planScadaWorkPackageImport(
  workPackage: ScadaWorkPackage,
  inventory: ScadaWorkTransferInventory,
): ScadaWorkPackageImportPlan {
  const dependenciesToImport: DistributableComponentPackage[] = []
  const reusedDependencies: ScadaWorkDependencyReuse[] = []

  for (const dependency of workPackage.dependencies) {
    const componentType = dependency.definition.type
    const builtIn = inventory.components.find(
      (entry) => entry.builtIn && entry.definition.type === componentType,
    )
    if (builtIn) {
      return {
        kind: 'collision',
        componentType,
        message: `作品依赖与内置组件冲突：${componentType}`,
      }
    }

    const { local, installed } = matchingPortableSources(componentType, inventory)
    if (local.length + installed.length > 1) {
      return {
        kind: 'collision',
        componentType,
        message: `本地存在多个同类型组件来源，无法安全导入作品：${componentType}`,
      }
    }

    const localEntry = local[0]
    if (localEntry) {
      const existingPackage = packageFromEntry(localEntry)
      if (
        !existingPackage
        || packageDocument(existingPackage) !== packageDocument(dependency)
      ) {
        return {
          kind: 'collision',
          componentType,
          message: `作品依赖与本地可编辑组件定义不一致：${componentType}`,
        }
      }
      reusedDependencies.push({
        componentType,
        source: 'local-authored',
      })
      continue
    }

    const installedEntry = installed[0]
    if (installedEntry) {
      const existingPackage = packageFromEntry(installedEntry.entry)
      if (
        !existingPackage
        || packageDocument(existingPackage) !== packageDocument(dependency)
      ) {
        return {
          kind: 'collision',
          componentType,
          message: `作品依赖与已安装远程组件定义不一致：${componentType}`,
        }
      }
      reusedDependencies.push({
        componentType,
        source: 'installed-remote',
      })
      continue
    }

    dependenciesToImport.push(dependency)
  }

  return {
    kind: 'ready',
    sceneName: workPackage.scene.name,
    dependenciesToImport,
    reusedDependencies,
  }
}
