import { CollapsibleInspectorGroup } from '../../components/CollapsibleInspectorGroup'
import {
  resolveVisualAssetStyle,
  type ImageVisualLayer,
  type SvgVisualLayer,
  type VisualAssetFit,
} from '../../component-system/visual'
import { Select } from '../../ui'
import { ComponentSvgSourceEditor } from './ComponentSvgSourceEditor'

type ComponentAssetStyleSectionProps = {
  layer: ImageVisualLayer | SvgVisualLayer
  readOnly: boolean
  onUpdateLayer: (nextLayer: ImageVisualLayer | SvgVisualLayer) => void
}

const ASSET_FIT_OPTIONS = [
  { value: 'stretch', label: '拉伸' },
  { value: 'contain', label: '适应' },
  { value: 'cover', label: '裁切填充' },
]

export function ComponentAssetStyleSection({
  layer,
  readOnly,
  onUpdateLayer,
}: ComponentAssetStyleSectionProps) {
  const style = resolveVisualAssetStyle(layer)

  return (
    <div className="component-layer-style-inspector">
      <CollapsibleInspectorGroup title="样式">
        <label className="property-field">
          <span>填充模式</span>
          <Select
            value={style.fit}
            disabled={readOnly}
            ariaLabel={`${layer.name} 资源填充模式`}
            options={ASSET_FIT_OPTIONS}
            onValueChange={(value) => onUpdateLayer({
              ...layer,
              style: { ...style, fit: value as VisualAssetFit },
            })}
          />
        </label>
        <p className="component-inspector-help">
          样式属于组件私有视觉实现；Visual Rules 继续只使用已冻结的 typed target authority。
        </p>
      </CollapsibleInspectorGroup>

      {layer.kind === 'svg' && (
        <ComponentSvgSourceEditor
          layer={layer}
          readOnly={readOnly}
          onChange={onUpdateLayer}
        />
      )}
    </div>
  )
}
