import type {
  ComponentDefinition,
  ComponentPropertyDefinition,
  ComponentScalarValue,
} from '../../component-system/definition'
import {
  resolveVisualAssetStyle,
  resolveVisualTextStyle,
  resolveVisualVectorStyle,
  type ComponentVisualDefinition,
  type ComponentVisualLayer,
} from '../../component-system/visual'
import {
  visualRuleTargetsForLayer,
  type VisualRule,
  type VisualRuleOperator,
  type VisualRuleTargetField,
} from '../../component-system/visualRules'
import { Button, Checkbox, Input, NumberInput, Select } from '../../ui'
import { ComponentVisualAnimationEditor } from './ComponentVisualAnimationEditor'

const OPERATOR_LABELS: Record<VisualRuleOperator, string> = {
  equals: '等于',
  notEquals: '不等于',
  greaterThan: '大于',
  greaterOrEqual: '大于等于',
  lessThan: '小于',
  lessOrEqual: '小于等于',
}

const TARGET_LABELS: Record<VisualRuleTargetField, string> = {
  visible: '显示 / 隐藏',
  opacity: '透明度',
  'transform.x': '位置 X',
  'transform.y': '位置 Y',
  'transform.width': '宽度',
  'transform.height': '高度',
  'transform.rotation': '旋转',
  'transform.scaleX': 'Scale X',
  'transform.scaleY': 'Scale Y',
  'style.fill': '填充 / 文字颜色',
  'style.stroke': '描边颜色',
  'style.strokeWidth': '描边宽度',
  'style.fontFamily': '字体',
  'style.fontSize': '字号',
  'style.fontStyle': '字形',
  'style.align': '水平对齐',
  'style.verticalAlign': '垂直对齐',
  'style.lineHeight': '行高',
  'style.fit': '资源适配',
}

const FONT_STYLE_OPTIONS = [
  { value: 'normal', label: '常规' },
  { value: 'bold', label: '粗体' },
  { value: 'italic', label: '斜体' },
  { value: 'bold italic', label: '粗斜体' },
]

const ALIGN_OPTIONS = [
  { value: 'left', label: '左对齐' },
  { value: 'center', label: '居中' },
  { value: 'right', label: '右对齐' },
]

const VERTICAL_ALIGN_OPTIONS = [
  { value: 'top', label: '顶部' },
  { value: 'middle', label: '居中' },
  { value: 'bottom', label: '底部' },
]

const ASSET_FIT_OPTIONS = [
  { value: 'stretch', label: '拉伸' },
  { value: 'contain', label: '适应' },
  { value: 'cover', label: '裁切填充' },
]

function nextRuleId(rules: readonly VisualRule[]) {
  const ids = new Set(rules.map((rule) => rule.id))
  let index = 1
  while (ids.has(`rule${index}`)) index += 1
  return `rule${index}`
}

function operatorOptions(property: ComponentPropertyDefinition) {
  const operators: VisualRuleOperator[] = property.kind === 'number'
    ? ['equals', 'notEquals', 'greaterThan', 'greaterOrEqual', 'lessThan', 'lessOrEqual']
    : ['equals', 'notEquals']

  return operators.map((value) => ({ value, label: OPERATOR_LABELS[value] }))
}

function defaultTargetValue(
  layer: ComponentVisualLayer,
  target: VisualRuleTargetField,
): ComponentScalarValue {
  if (target === 'visible') return layer.visible
  if (target === 'opacity') return layer.opacity

  if (target.startsWith('transform.')) {
    const field = target.slice('transform.'.length) as keyof ComponentVisualLayer['transform']
    return layer.transform[field]
  }

  if (layer.kind === 'vector') {
    const style = resolveVisualVectorStyle(layer)
    if (target === 'style.fill') return style.fill
    if (target === 'style.stroke') return style.stroke
    if (target === 'style.strokeWidth') return style.strokeWidth
  }

  if (layer.kind === 'text') {
    const style = resolveVisualTextStyle(layer)
    const field = target.slice('style.'.length) as keyof typeof style
    return style[field]
  }

  if (layer.kind === 'svg' || layer.kind === 'image') {
    return resolveVisualAssetStyle(layer).fit
  }

  return 0
}

function PropertyValueEditor({
  property,
  value,
  disabled,
  ariaLabel,
  onChange,
}: {
  property: ComponentPropertyDefinition
  value: ComponentScalarValue
  disabled: boolean
  ariaLabel: string
  onChange: (value: ComponentScalarValue) => void
}) {
  if (property.kind === 'boolean') {
    return (
      <Checkbox
        checked={Boolean(value)}
        disabled={disabled}
        label={Boolean(value) ? 'true' : 'false'}
        onCheckedChange={onChange}
      />
    )
  }

  if (property.kind === 'number') {
    return (
      <NumberInput
        value={typeof value === 'number' ? value : 0}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    )
  }

  if (property.kind === 'select') {
    return (
      <Select
        value={String(value ?? '')}
        disabled={disabled}
        ariaLabel={ariaLabel}
        options={(property.options ?? []).map((option) => ({
          value: String(option.value),
          label: option.label,
        }))}
        onValueChange={(next) => {
          const option = property.options?.find((candidate) => String(candidate.value) === next)
          onChange(option?.value ?? next)
        }}
      />
    )
  }

  return (
    <Input
      type={property.kind === 'color' ? 'color' : 'text'}
      value={typeof value === 'string' ? value : ''}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

function RuleTargetValueEditor({
  target,
  value,
  disabled,
  onChange,
}: {
  target: VisualRuleTargetField
  value: ComponentScalarValue
  disabled: boolean
  onChange: (value: ComponentScalarValue) => void
}) {
  if (target === 'visible') {
    return (
      <Checkbox
        checked={Boolean(value)}
        disabled={disabled}
        label={Boolean(value) ? '显示' : '隐藏'}
        onCheckedChange={onChange}
      />
    )
  }

  if (target === 'style.fontStyle') {
    return (
      <Select
        value={String(value)}
        disabled={disabled}
        ariaLabel="规则目标字形"
        options={FONT_STYLE_OPTIONS}
        onValueChange={onChange}
      />
    )
  }

  if (target === 'style.align') {
    return (
      <Select
        value={String(value)}
        disabled={disabled}
        ariaLabel="规则目标水平对齐"
        options={ALIGN_OPTIONS}
        onValueChange={onChange}
      />
    )
  }

  if (target === 'style.verticalAlign') {
    return (
      <Select
        value={String(value)}
        disabled={disabled}
        ariaLabel="规则目标垂直对齐"
        options={VERTICAL_ALIGN_OPTIONS}
        onValueChange={onChange}
      />
    )
  }

  if (target === 'style.fit') {
    return (
      <Select
        value={String(value)}
        disabled={disabled}
        ariaLabel="规则目标资源适配"
        options={ASSET_FIT_OPTIONS}
        onValueChange={onChange}
      />
    )
  }

  const numeric =
    target === 'opacity' ||
    target.startsWith('transform.') ||
    target === 'style.strokeWidth' ||
    target === 'style.fontSize' ||
    target === 'style.lineHeight'

  if (numeric) {
    return (
      <NumberInput
        value={typeof value === 'number' ? value : 0}
        disabled={disabled}
        min={target === 'opacity' ? '0' : undefined}
        max={target === 'opacity' ? '1' : undefined}
        step={target === 'opacity' || target.startsWith('transform.scale') || target === 'style.lineHeight' ? '0.05' : '1'}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    )
  }

  return (
    <Input
      value={typeof value === 'string' ? value : ''}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

export function ComponentVisualRuleEditor({
  definition,
  visual,
  layerId,
  readOnly,
  onChange,
}: {
  definition: ComponentDefinition
  visual: ComponentVisualDefinition
  layerId: string
  readOnly: boolean
  onChange: (visual: ComponentVisualDefinition) => void
}) {
  const selectedLayer = visual.layers.find((candidate) => candidate.id === layerId)
  if (!selectedLayer) return null
  const layer: ComponentVisualLayer = selectedLayer

  const properties = Object.entries(definition.properties)
  const allRules = visual.rules ?? []
  const layerRules = allRules.filter((rule) => rule.layerId === layerId)
  const targetOptions = visualRuleTargetsForLayer(layer).map((value) => ({
    value,
    label: TARGET_LABELS[value],
  }))

  function updateRule(ruleId: string, patch: Partial<VisualRule>) {
    onChange({
      ...visual,
      rules: allRules.map((rule) => rule.id === ruleId ? { ...rule, ...patch } : rule),
    })
  }

  function removeRule(ruleId: string) {
    onChange({ ...visual, rules: allRules.filter((rule) => rule.id !== ruleId) })
  }

  function addRule() {
    const [propertyKey, property] = properties[0] ?? []
    const target = visualRuleTargetsForLayer(layer)[0]
    if (!propertyKey || !property || !target) return

    const rule: VisualRule = {
      id: nextRuleId(allRules),
      enabled: true,
      propertyKey,
      operator: 'equals',
      compareValue: property.defaultValue,
      layerId,
      target,
      value: defaultTargetValue(layer, target),
    }

    onChange({ ...visual, rules: [...allRules, rule] })
  }

  return (
    <div className="component-rule-editor">
      {properties.length === 0 ? (
        <p className="component-inspector-help">
          先在组件根定义公开 Property，再用 Property 驱动这个 Layer 的视觉状态。
        </p>
      ) : (
        <p className="component-inspector-help">
          规则仅在预览/运行时计算，不修改基础 Layer。多条规则同时命中时，后面的规则覆盖前面的同一目标。
        </p>
      )}

      {layerRules.map((rule) => {
        const property = definition.properties[rule.propertyKey]
        if (!property) return null

        return (
          <article className="component-rule-item" key={rule.id}>
            <div className="component-layer-inspector-title">
              <div>
                <strong>{rule.id}</strong>
                <span>{rule.propertyKey} → {TARGET_LABELS[rule.target]}</span>
              </div>
              {!readOnly && (
                <Button variant="danger" size="small" onClick={() => removeRule(rule.id)}>
                  删除
                </Button>
              )}
            </div>

            <Checkbox
              className="checkbox-field property-toggle"
              checked={rule.enabled}
              disabled={readOnly}
              label="启用规则"
              onCheckedChange={(enabled) => updateRule(rule.id, { enabled })}
            />

            <div className="property-grid">
              <label className="property-field compact">
                <span>Property</span>
                <Select
                  value={rule.propertyKey}
                  disabled={readOnly}
                  ariaLabel={`${rule.id} Property`}
                  options={properties.map(([key, candidate]) => ({
                    value: key,
                    label: `${candidate.title || key} · ${key}`,
                  }))}
                  onValueChange={(propertyKey) => {
                    const nextProperty = definition.properties[propertyKey]
                    if (!nextProperty) return
                    updateRule(rule.id, {
                      propertyKey,
                      operator: 'equals',
                      compareValue: nextProperty.defaultValue,
                    })
                  }}
                />
              </label>

              <label className="property-field compact">
                <span>条件</span>
                <Select
                  value={rule.operator}
                  disabled={readOnly}
                  ariaLabel={`${rule.id} 条件`}
                  options={operatorOptions(property)}
                  onValueChange={(operator) => updateRule(rule.id, {
                    operator: operator as VisualRuleOperator,
                  })}
                />
              </label>

              <label className="property-field compact">
                <span>比较值</span>
                <PropertyValueEditor
                  property={property}
                  value={rule.compareValue}
                  disabled={readOnly}
                  ariaLabel={`${rule.id} 比较值`}
                  onChange={(compareValue) => updateRule(rule.id, { compareValue })}
                />
              </label>

              <label className="property-field compact">
                <span>目标</span>
                <Select
                  value={rule.target}
                  disabled={readOnly}
                  ariaLabel={`${rule.id} 视觉目标`}
                  options={targetOptions}
                  onValueChange={(target) => {
                    const nextTarget = target as VisualRuleTargetField
                    updateRule(rule.id, {
                      target: nextTarget,
                      value: defaultTargetValue(layer, nextTarget),
                    })
                  }}
                />
              </label>

              <label className="property-field compact">
                <span>目标值</span>
                <RuleTargetValueEditor
                  target={rule.target}
                  value={rule.value}
                  disabled={readOnly}
                  onChange={(value) => updateRule(rule.id, { value })}
                />
              </label>
            </div>
          </article>
        )
      })}

      {layerRules.length === 0 && properties.length > 0 && (
        <div className="component-layer-empty">这个 Layer 还没有 Visual Rule。</div>
      )}

      {!readOnly && properties.length > 0 && (
        <Button variant="secondary" size="small" onClick={addRule}>
          + 添加视觉规则
        </Button>
      )}

      <section className="component-animation-section" aria-label="Layer 动画">
        <div className="component-behavior-section-heading">
          <strong>动画</strong>
          <span>Spin authoring · M6.4.2</span>
        </div>
        <ComponentVisualAnimationEditor
          definition={definition}
          visual={visual}
          layerId={layerId}
          readOnly={readOnly}
          onChange={onChange}
        />
      </section>
    </div>
  )
}
