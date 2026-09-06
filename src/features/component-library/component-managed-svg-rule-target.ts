import {
  findManagedSvgElement,
  getManagedSvgElementAttribute,
  isManagedSvgPresentationEditableElement,
} from '../../component-system/managedSvgAuthoring'
import type { ComponentVisualLayer } from '../../component-system/visual'
import type { ComponentManagedSvgSelection } from './component-managed-svg-selection'

export type ManagedSvgRuleTargetOption = Readonly<{
  tagId: string
  label: string
  shortLabel: string
}>

function describeManagedSvgRuleElement(
  element: NonNullable<Extract<ComponentVisualLayer, { kind: 'svg' }>['document']>['root'],
): ManagedSvgRuleTargetOption {
  const sourceId = getManagedSvgElementAttribute(element, 'id')
  const shortLabel = element.authorRef ? `@${element.authorRef}` : element.tagId
  const details = [
    `<${element.tagName}>`,
    element.authorRef ? element.tagId : null,
    sourceId ? `#${sourceId}` : null,
  ].filter(Boolean)

  return {
    tagId: element.tagId,
    shortLabel,
    label: `${shortLabel} · ${details.join(' · ')}`,
  }
}

export function listManagedSvgRuleTargets(
  layer: ComponentVisualLayer,
): ManagedSvgRuleTargetOption[] {
  if (layer.kind !== 'svg' || !layer.document) return []
  const result: ManagedSvgRuleTargetOption[] = []

  const visit = (element: typeof layer.document.root) => {
    if (isManagedSvgPresentationEditableElement(element)) {
      result.push(describeManagedSvgRuleElement(element))
    }
    for (const child of element.children) {
      if (child.kind === 'element') visit(child)
    }
  }

  visit(layer.document.root)
  return result
}

export function managedSvgRuleTargetLabel(
  layer: ComponentVisualLayer,
  tagId: string,
) {
  if (layer.kind !== 'svg' || !layer.document) return tagId
  const element = findManagedSvgElement(layer.document, tagId)
  if (!element) return tagId
  return describeManagedSvgRuleElement(element).shortLabel
}

export function selectedManagedSvgRuleTagId(
  layer: ComponentVisualLayer,
  selection: ComponentManagedSvgSelection | null,
) {
  if (
    layer.kind !== 'svg' ||
    !layer.document ||
    selection?.layerId !== layer.id
  ) {
    return null
  }

  const element = findManagedSvgElement(layer.document, selection.tagId)
  return element && isManagedSvgPresentationEditableElement(element)
    ? element.tagId
    : null
}
