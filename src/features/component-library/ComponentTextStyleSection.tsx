import { CollapsibleInspectorGroup } from '../../components/CollapsibleInspectorGroup'
import {
  TextAlignBottomIcon,
  TextAlignCenterIcon,
  TextAlignLeftIcon,
  TextAlignMiddleIcon,
  TextAlignRightIcon,
  TextAlignTopIcon,
} from '../../components/toolbar-icons'
import {
  resolveVisualTextStyle,
  type TextVisualLayer,
  type VisualTextFontStyle,
} from '../../component-system/visual'
import {
  Checkbox,
  Input,
  NumberInput,
  SegmentedControl,
  Select,
  Textarea,
} from '../../ui'
import { ColorPickerInput } from './ColorPickerInput'

type ComponentTextStyleSectionProps = {
  layer: TextVisualLayer
  readOnly: boolean
  onUpdateLayer: (nextLayer: TextVisualLayer) => void
}

const TEXT_FONT_STYLE_OPTIONS = [
  { value: 'normal', label: '常规' },
  { value: 'bold', label: '粗体' },
  { value: 'italic', label: '斜体' },
  { value: 'bold italic', label: '粗斜体' },
]

const HORIZONTAL_ALIGN_ITEMS = [
  { value: 'left' as const, label: '左对齐', icon: <TextAlignLeftIcon /> },
  { value: 'center' as const, label: '水平居中', icon: <TextAlignCenterIcon /> },
  { value: 'right' as const, label: '右对齐', icon: <TextAlignRightIcon /> },
]

const VERTICAL_ALIGN_ITEMS = [
  { value: 'top' as const, label: '顶部对齐', icon: <TextAlignTopIcon /> },
  { value: 'middle' as const, label: '垂直居中', icon: <TextAlignMiddleIcon /> },
  { value: 'bottom' as const, label: '底部对齐', icon: <TextAlignBottomIcon /> },
]

export function ComponentTextStyleSection({
  layer,
  readOnly,
  onUpdateLayer,
}: ComponentTextStyleSectionProps) {
  const style = resolveVisualTextStyle(layer)

  const horizontalItems = HORIZONTAL_ALIGN_ITEMS.map((item) => ({
    ...item,
    disabled: readOnly,
  }))

  const verticalItems = VERTICAL_ALIGN_ITEMS.map((item) => ({
    ...item,
    disabled: readOnly,
  }))

  return (
    <div className="component-layer-style-inspector">
      <CollapsibleInspectorGroup title="文本">
        <div className="component-text-editor-field">
          <Textarea
            rows={3}
            value={layer.text}
            disabled={readOnly}
            placeholder="输入文本..."
            aria-label={`${layer.name} 文本`}
            onChange={(event) => onUpdateLayer({ ...layer, text: event.target.value })}
          />
        </div>
      </CollapsibleInspectorGroup>

      <CollapsibleInspectorGroup title="文字排版">
        <div className="property-grid">
          <label className="property-field compact">
            <span>字体</span>
            <Input
              value={style.fontFamily}
              disabled={readOnly}
              placeholder="Arial"
              onChange={(event) => onUpdateLayer({
                ...layer,
                style: { ...style, fontFamily: event.target.value },
              })}
            />
          </label>
          <label className="property-field compact">
            <span>字形</span>
            <Select
              value={style.fontStyle}
              disabled={readOnly}
              ariaLabel={`${layer.name} 字形`}
              options={TEXT_FONT_STYLE_OPTIONS}
              onValueChange={(value) => onUpdateLayer({
                ...layer,
                style: { ...style, fontStyle: value as VisualTextFontStyle },
              })}
            />
          </label>
        </div>

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
                onUpdateLayer({ ...layer, style: { ...style, fontSize } })
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
                onUpdateLayer({ ...layer, style: { ...style, lineHeight } })
              }}
            />
          </label>
        </div>

        <label className="property-field compact">
          <span>颜色</span>
          <ColorPickerInput
            value={style.fill}
            disabled={readOnly}
            ariaLabel={`${layer.name} 文字颜色`}
            placeholder="#334155"
            clearValue="transparent"
            onChange={(fill) => onUpdateLayer({
              ...layer,
              style: { ...style, fill },
            })}
          />
        </label>

        <div className="property-field compact">
          <span>对齐</span>
          <div className="component-text-align-bar">
            <SegmentedControl
              value={style.align}
              items={horizontalItems}
              ariaLabel={`${layer.name} 水平对齐`}
              iconOnly
              onValueChange={(align) => onUpdateLayer({
                ...layer,
                style: { ...style, align },
              })}
            />
            <div className="component-text-align-separator" />
            <SegmentedControl
              value={style.verticalAlign}
              items={verticalItems}
              ariaLabel={`${layer.name} 垂直对齐`}
              iconOnly
              onValueChange={(verticalAlign) => onUpdateLayer({
                ...layer,
                style: { ...style, verticalAlign },
              })}
            />
          </div>
        </div>
      </CollapsibleInspectorGroup>

      <CollapsibleInspectorGroup title="边框">
        <label className="property-field compact">
          <span>背景</span>
          <ColorPickerInput
            value={style.backgroundColor ?? 'transparent'}
            disabled={readOnly}
            ariaLabel={`${layer.name} 背景色`}
            placeholder="transparent / #ffffff"
            clearValue="transparent"
            onChange={(backgroundColor) => onUpdateLayer({
              ...layer,
              style: { ...style, backgroundColor },
            })}
          />
        </label>

        <div className="property-field compact">
          <span>线框</span>
          <div className="property-field-checkbox-row">
            <Checkbox
              checked={Boolean(style.borderVisible)}
              disabled={readOnly}
              label="显示"
              onCheckedChange={(checked) => onUpdateLayer({
                ...layer,
                style: { ...style, borderVisible: checked },
              })}
            />
          </div>
        </div>

        {style.borderVisible && (
          <div className="property-grid">
            <label className="property-field compact">
              <span>颜色</span>
              <ColorPickerInput
                value={style.borderColor ?? '#64748b'}
                disabled={readOnly}
                ariaLabel={`${layer.name} 边框颜色`}
                placeholder="#64748b"
                clearValue="transparent"
                onChange={(borderColor) => onUpdateLayer({
                  ...layer,
                  style: { ...style, borderColor },
                })}
              />
            </label>

            <label className="property-field compact">
              <span>线宽</span>
              <NumberInput
                min="0.5"
                step="0.5"
                value={style.borderWidth ?? 1}
                disabled={readOnly}
                onChange={(event) => {
                  const borderWidth = Number(event.target.value)
                  if (!Number.isFinite(borderWidth) || borderWidth < 0) return
                  onUpdateLayer({ ...layer, style: { ...style, borderWidth } })
                }}
              />
            </label>
          </div>
        )}
      </CollapsibleInspectorGroup>
    </div>
  )
}
