import { CollapsibleInspectorGroup } from '../../components/CollapsibleInspectorGroup'
import {
  resolveVisualAssetStyle,
  resolveVisualTextStyle,
  resolveVisualVectorStyle,
  type ComponentVisualDefinition,
  type ComponentVisualLayer,
  type VisualAssetFit,
  type VisualTextAlign,
  type VisualTextFontStyle,
  type VisualTextVerticalAlign,
} from '../../component-system/visual'
import { Input, NumberInput, Select } from '../../ui'

type ComponentVisualStyleInspectorProps = {
  visual: ComponentVisualDefinition
  selectedLayerId: string
  readOnly: boolean
  onChange: (visual: ComponentVisualDefinition) => void
}

const ASSET_FIT_OPTIONS = [
  { value: 'stretch', label: '拉伸' },
  { value: 'contain', label: '适应' },
  { value: 'cover', label: '裁切填充' },
]

const TEXT_FONT_STYLE_OPTIONS = [
  { value: 'normal', label: '常规' },
  { value: 'bold', label: '粗体' },
  { value: 'italic', label: '斜体' },
  { value: 'bold italic', label: '粗斜体' },
]

const TEXT_ALIGN_OPTIONS = [
  { value: 'left', label: '左对齐' },
  { value: 'center', label: '居中' },
  { value: 'right', label: '右对齐' },
]

const TEXT_VERTICAL_ALIGN_OPTIONS = [
  { value: 'top', label: '顶部' },
  { value: 'middle', label: '居中' },
  { value: 'bottom', label: '底部' },
]

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
    onChange({
      ...visual,
      layers: visual.layers.map((candidate) =>
        candidate.id === selectedLayerId ? nextLayer : candidate,
      ),
    })
  }

  if (layer.kind === 'vector') {
    const style = resolveVisualVectorStyle(layer)

    return (
      <div className="property-section-list component-layer-style-inspector">
        <CollapsibleInspectorGroup title="样式">
          <label className="property-field">
            <span>填充</span>
            <Input
              value={style.fill}
              disabled={readOnly}
              placeholder="#cbd5e1 / transparent"
              onChange={(event) => updateLayer({
                ...layer,
                style: { ...style, fill: event.target.value },
              })}
            />
          </label>
          <label className="property-field">
            <span>描边</span>
            <Input
              value={style.stroke}
              disabled={readOnly}
              placeholder="#64748b / transparent"
              onChange={(event) => updateLayer({
                ...layer,
                style: { ...style, stroke: event.target.value },
              })}
            />
          </label>
          <label className="property-field compact">
            <span>描边宽度</span>
            <NumberInput
              min="0"
              step="0.5"
              value={style.strokeWidth}
              disabled={readOnly}
              onChange={(event) => {
                const strokeWidth = Number(event.target.value)
                if (!Number.isFinite(strokeWidth) || strokeWidth < 0) return
                updateLayer({ ...layer, style: { ...style, strokeWidth } })
              }}
            />
          </label>
        </CollapsibleInspectorGroup>
      </div>
    )
  }

  if (layer.kind === 'text') {
    const style = resolveVisualTextStyle(layer)

    return (
      <div className="property-section-list component-layer-style-inspector">
        <CollapsibleInspectorGroup title="样式">
          <label className="property-field">
            <span>文字颜色</span>
            <Input
              value={style.fill}
              disabled={readOnly}
              placeholder="#334155"
              onChange={(event) => updateLayer({
                ...layer,
                style: { ...style, fill: event.target.value },
              })}
            />
          </label>
          <label className="property-field">
            <span>字体</span>
            <Input
              value={style.fontFamily}
              disabled={readOnly}
              placeholder="Arial"
              onChange={(event) => updateLayer({
                ...layer,
                style: { ...style, fontFamily: event.target.value },
              })}
            />
          </label>
          <div className="property-grid">
            <label className="property-field compact">
              <span>字号</span>
              <NumberInput
                min="1"
                step="1"
                value={style.fontSize}
                disabled={readOnly}
                onChange={(event) => {
                  const fontSize = Number(event.target.value)
                  if (!Number.isFinite(fontSize) || fontSize <= 0) return
                  updateLayer({ ...layer, style: { ...style, fontSize } })
                }}
              />
            </label>
            <label className="property-field compact">
              <span>行高</span>
              <NumberInput
                min="0.1"
                step="0.1"
                value={style.lineHeight}
                disabled={readOnly}
                onChange={(event) => {
                  const lineHeight = Number(event.target.value)
                  if (!Number.isFinite(lineHeight) || lineHeight <= 0) return
                  updateLayer({ ...layer, style: { ...style, lineHeight } })
                }}
              />
            </label>
          </div>
          <label className="property-field">
            <span>字形</span>
            <Select
              value={style.fontStyle}
              disabled={readOnly}
              ariaLabel={`${layer.name} 字形`}
              options={TEXT_FONT_STYLE_OPTIONS}
              onValueChange={(value) => updateLayer({
                ...layer,
                style: { ...style, fontStyle: value as VisualTextFontStyle },
              })}
            />
          </label>
          <div className="property-grid">
            <label className="property-field compact">
              <span>水平</span>
              <Select
                value={style.align}
                disabled={readOnly}
                ariaLabel={`${layer.name} 水平对齐`}
                options={TEXT_ALIGN_OPTIONS}
                onValueChange={(value) => updateLayer({
                  ...layer,
                  style: { ...style, align: value as VisualTextAlign },
                })}
              />
            </label>
            <label className="property-field compact">
              <span>垂直</span>
              <Select
                value={style.verticalAlign}
                disabled={readOnly}
                ariaLabel={`${layer.name} 垂直对齐`}
                options={TEXT_VERTICAL_ALIGN_OPTIONS}
                onValueChange={(value) => updateLayer({
                  ...layer,
                  style: {
                    ...style,
                    verticalAlign: value as VisualTextVerticalAlign,
                  },
                })}
              />
            </label>
          </div>
        </CollapsibleInspectorGroup>
      </div>
    )
  }

  const style = resolveVisualAssetStyle(layer)

  return (
    <div className="property-section-list component-layer-style-inspector">
      <CollapsibleInspectorGroup title="样式">
        <label className="property-field">
          <span>填充模式</span>
          <Select
            value={style.fit}
            disabled={readOnly}
            ariaLabel={`${layer.name} 资源填充模式`}
            options={ASSET_FIT_OPTIONS}
            onValueChange={(value) => updateLayer({
              ...layer,
              style: { ...style, fit: value as VisualAssetFit },
            })}
          />
        </label>
        <p className="component-inspector-help">
          样式属于组件私有视觉实现；后续 Visual Rules 会以这些 typed style 字段作为稳定目标。
        </p>
      </CollapsibleInspectorGroup>
    </div>
  )
}
