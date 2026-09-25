import type {
  ComponentVisualDefinition,
  ComponentVisualLayer,
} from '../../component-system/visual'
import { ComponentAssetStyleSection } from './ComponentAssetStyleSection'
import { ComponentTextStyleSection } from './ComponentTextStyleSection'
import { ComponentVectorStyleSection } from './ComponentVectorStyleSection'

type ComponentVisualStyleInspectorProps = {
  visual: ComponentVisualDefinition
  selectedLayerId: string
  readOnly: boolean
  onChange: (visual: ComponentVisualDefinition) => void
}

export function ComponentVisualStyleInspector({
  visual,
  selectedLayerId,
  readOnly,
  onChange,
}: ComponentVisualStyleInspectorProps) {
  const layer = visual.layers.find((candidate) => candidate.id === selectedLayerId)

  if (!layer || layer.kind === 'group') {
    return null
  }

  function updateLayer(nextLayer: ComponentVisualLayer) {
    const nextVisual: ComponentVisualDefinition = {
      ...visual,
      layers: visual.layers.map((candidate) =>
        candidate.id === selectedLayerId ? nextLayer : candidate,
      ),
    }
    onChange(nextVisual)
  }

  if (layer.kind === 'vector') {
    return (
      <ComponentVectorStyleSection
        layer={layer}
        readOnly={readOnly}
        onUpdateLayer={updateLayer}
      />
    )
  }

  if (layer.kind === 'text') {
    return (
      <ComponentTextStyleSection
        layer={layer}
        readOnly={readOnly}
        onUpdateLayer={updateLayer}
      />
    )
  }

  if (layer.kind === 'image' || layer.kind === 'svg') {
    return (
      <ComponentAssetStyleSection
        layer={layer}
        readOnly={readOnly}
        onUpdateLayer={updateLayer}
      />
    )
  }

  return null
}
