import type { ComponentLibraryEntry } from './component-document'
import type { DistributableComponentPackage } from './distributable-component-package'
import type { InstalledRemoteComponent } from './remote-component-installation'

export type ComponentPackageImportCollisionKind =
  | 'built-in'
  | 'local-authored'
  | 'installed-remote'

export type ComponentPackageImportPlan =
  | Readonly<{
      kind: 'ready'
      componentType: string
      title: string
    }>
  | Readonly<{
      kind: 'collision'
      componentType: string
      title: string
      collision: ComponentPackageImportCollisionKind
      message: string
    }>

export type ComponentPackageImportInventory = Readonly<{
  components: readonly ComponentLibraryEntry[]
  installedRemoteComponents: readonly InstalledRemoteComponent[]
}>

/**
 * Pure, side-effect-free import planning. File selection/parsing may call this
 * safely before the user explicitly confirms an import.
 *
 * M7A2 deliberately rejects all component-type collisions. Portable file
 * import is a local-authoring operation, not an overwrite/update mechanism for
 * built-ins, existing local packages, or installed remote provenance.
 */
export function planComponentPackageImport(
  componentPackage: DistributableComponentPackage,
  inventory: ComponentPackageImportInventory,
): ComponentPackageImportPlan {
  const componentType = componentPackage.definition.type
  const title = componentPackage.definition.title
  const component = inventory.components.find(
    (entry) => entry.definition.type === componentType,
  )

  if (component?.builtIn) {
    return {
      kind: 'collision',
      componentType,
      title,
      collision: 'built-in',
      message: `组件类型与内置组件冲突：${componentType}`,
    }
  }

  if (component) {
    return {
      kind: 'collision',
      componentType,
      title,
      collision: 'local-authored',
      message: `组件类型与本地可编辑组件冲突：${componentType}`,
    }
  }

  const installed = inventory.installedRemoteComponents.find(
    (entry) => entry.source.componentType === componentType,
  )

  if (installed) {
    return {
      kind: 'collision',
      componentType,
      title,
      collision: 'installed-remote',
      message: `组件类型已由远程安装占用：${componentType} @ revision ${installed.source.revision}`,
    }
  }

  return {
    kind: 'ready',
    componentType,
    title,
  }
}
