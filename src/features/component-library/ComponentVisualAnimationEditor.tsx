import type {
  ComponentDefinition,
  ComponentPropertyDefinition,
  ComponentScalarValue,
} from '../../component-system/definition'
import type {
  MoveVisualAnimation,
  ScaleVisualAnimation,
  SpinVisualAnimation,
  VisualAnimation,
  VisualAnimationDirection,
  VisualAnimationEasing,
  VisualAnimationTiming,
} from '../../component-system/animations'
import type { ComponentVisualDefinition } from '../../component-system/visual'
import type { VisualRuleOperator } from '../../component-system/visualRules'
import { Button, Checkbox, Input, NumberInput, Select } from '../../ui'
import './component-animation-editor.css'

const OPERATOR_LABELS: Record<VisualRuleOperator, string> = {
  equals: '等于',
  notEquals: '不等于',
  greaterThan: '大于',
  greaterOrEqual: '大于等于',
  lessThan: '小于',
  lessOrEqual: '小于等于',
}

const DIRECTION_OPTIONS: Array<{ value: VisualAnimationDirection; label: string }> = [
  { value: 'normal', label: '正向' },
  { value: 'reverse', label: '反向' },
  { value: 'alternate', label: '交替' },
  { value: 'alternate-reverse', label: '反向交替' },
]

const EASING_OPTIONS: Array<{ value: VisualAnimationEasing; label: string }> = [
  { value: 'linear', label: '线性' },
  { value: 'ease-in', label: '缓入' },
  { value: 'ease-out', label: '缓出' },
  { value: 'ease-in-out', label: '缓入缓出' },
]

function nextAnimationId(animations: readonly VisualAnimation[]) {
  const ids = new Set(animations.map((animation) => animation.id))
  let index = 1
  while (ids.has(`animation${index}`)) index += 1
  return `animation${index}`
}

function createDefaultTiming(): VisualAnimationTiming {
  return {
    durationMs: 1000,
    delayMs: 0,
    iterations: 'infinite',
    direction: 'normal',
    easing: 'linear',
  }
}

function operatorOptions(property: ComponentPropertyDefinition) {
  const operators: VisualRuleOperator[] = property.kind === 'number'
    ? ['equals', 'notEquals', 'greaterThan', 'greaterOrEqual', 'lessThan', 'lessOrEqual']
    : ['equals', 'notEquals']
  return operators.map((value) => ({ value, label: OPERATOR_LABELS[value] }))
}

function animationSummary(animation: VisualAnimation) {
  if (animation.kind === 'spin') {
    return `Spin · ${animation.degreesPerIteration}° / ${animation.timing.durationMs}ms`
  }
  if (animation.kind === 'move') {
    return `Move · ΔX ${animation.deltaXPerIteration} / ΔY ${animation.deltaYPerIteration} / ${animation.timing.durationMs}ms`
  }
  return `Scale · ×${animation.scaleXMultiplier} / ×${animation.scaleYMultiplier} / ${animation.timing.durationMs}ms`
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
        onChange={(event) => {
          const next = Number(event.target.value)
          if (Number.isFinite(next)) onChange(next)
        }}
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

export function ComponentVisualAnimationEditor({
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
  const properties = Object.entries(definition.properties)
  const allAnimations = visual.animations
  const layerAnimations = allAnimations.filter((animation) => animation.layerId === layerId)

  function replaceAnimation(
    animationId: string,
    update: (animation: VisualAnimation) => VisualAnimation,
  ) {
    onChange({
      ...visual,
      animations: allAnimations.map((animation) =>
        animation.id === animationId ? update(animation) : animation,
      ),
    })
  }

  function updateTiming(animationId: string, patch: Partial<VisualAnimationTiming>) {
    replaceAnimation(animationId, (animation) => ({
      ...animation,
      timing: { ...animation.timing, ...patch },
    }))
  }

  function removeAnimation(animationId: string) {
    onChange({
      ...visual,
      animations: allAnimations.filter((animation) => animation.id !== animationId),
    })
  }

  function addSpinAnimation() {
    const animation: SpinVisualAnimation = {
      id: nextAnimationId(allAnimations),
      kind: 'spin',
      enabled: true,
      layerId,
      degreesPerIteration: 360,
      timing: createDefaultTiming(),
      activation: { kind: 'always' },
    }
    onChange({ ...visual, animations: [...allAnimations, animation] })
  }

  function addMoveAnimation() {
    const animation: MoveVisualAnimation = {
      id: nextAnimationId(allAnimations),
      kind: 'move',
      enabled: true,
      layerId,
      deltaXPerIteration: 40,
      deltaYPerIteration: 0,
      timing: createDefaultTiming(),
      activation: { kind: 'always' },
    }
    onChange({ ...visual, animations: [...allAnimations, animation] })
  }

  function addScaleAnimation() {
    const animation: ScaleVisualAnimation = {
      id: nextAnimationId(allAnimations),
      kind: 'scale',
      enabled: true,
      layerId,
      scaleXMultiplier: 1.2,
      scaleYMultiplier: 1.2,
      timing: createDefaultTiming(),
      activation: { kind: 'always' },
    }
    onChange({ ...visual, animations: [...allAnimations, animation] })
  }

  return (
    <div className="component-animation-editor">
      <p className="component-inspector-help">
        动画属于 Layer 的私有实现。设计模式保持静止；预览时由纯动画 evaluator 生成瞬时叠加，不修改基础几何。
      </p>

      {layerAnimations.map((animation) => {
        const activationProperty = animation.activation.kind === 'property'
          ? definition.properties[animation.activation.propertyKey]
          : undefined

        return (
          <article className="component-animation-item" key={animation.id}>
            <div className="component-layer-inspector-title">
              <div>
                <strong>{animation.id}</strong>
                <span>{animationSummary(animation)}</span>
              </div>
              {!readOnly && (
                <Button
                  variant="danger"
                  size="small"
                  aria-label={`删除动画 ${animation.id}`}
                  onClick={() => removeAnimation(animation.id)}
                >
                  删除
                </Button>
              )}
            </div>

            <Checkbox
              className="checkbox-field property-toggle"
              checked={animation.enabled}
              disabled={readOnly}
              label="启用动画"
              onCheckedChange={(enabled) => replaceAnimation(animation.id, (current) => ({
                ...current,
                enabled,
              }))}
            />

            <div className="property-grid component-animation-grid">
              {animation.kind === 'spin' && (
                <label className="property-field compact">
                  <span>每轮旋转</span>
                  <NumberInput
                    value={animation.degreesPerIteration}
                    disabled={readOnly}
                    step="15"
                    aria-label={`${animation.id} 每轮旋转角度`}
                    onChange={(event) => {
                      const degreesPerIteration = Number(event.target.value)
                      if (!Number.isFinite(degreesPerIteration)) return
                      replaceAnimation(animation.id, (current) =>
                        current.kind === 'spin' ? { ...current, degreesPerIteration } : current,
                      )
                    }}
                  />
                </label>
              )}

              {animation.kind === 'move' && (
                <>
                  <label className="property-field compact">
                    <span>每轮 X 位移</span>
                    <NumberInput
                      value={animation.deltaXPerIteration}
                      disabled={readOnly}
                      step="5"
                      aria-label={`${animation.id} 每轮 X 位移`}
                      onChange={(event) => {
                        const deltaXPerIteration = Number(event.target.value)
                        if (!Number.isFinite(deltaXPerIteration)) return
                        replaceAnimation(animation.id, (current) =>
                          current.kind === 'move' ? { ...current, deltaXPerIteration } : current,
                        )
                      }}
                    />
                  </label>
                  <label className="property-field compact">
                    <span>每轮 Y 位移</span>
                    <NumberInput
                      value={animation.deltaYPerIteration}
                      disabled={readOnly}
                      step="5"
                      aria-label={`${animation.id} 每轮 Y 位移`}
                      onChange={(event) => {
                        const deltaYPerIteration = Number(event.target.value)
                        if (!Number.isFinite(deltaYPerIteration)) return
                        replaceAnimation(animation.id, (current) =>
                          current.kind === 'move' ? { ...current, deltaYPerIteration } : current,
                        )
                      }}
                    />
                  </label>
                </>
              )}

              {animation.kind === 'scale' && (
                <>
                  <label className="property-field compact">
                    <span>X 倍率</span>
                    <NumberInput
                      value={animation.scaleXMultiplier}
                      min="0.01"
                      step="0.05"
                      disabled={readOnly}
                      aria-label={`${animation.id} X 缩放倍率`}
                      onChange={(event) => {
                        const scaleXMultiplier = Number(event.target.value)
                        if (!Number.isFinite(scaleXMultiplier) || scaleXMultiplier <= 0) return
                        replaceAnimation(animation.id, (current) =>
                          current.kind === 'scale' ? { ...current, scaleXMultiplier } : current,
                        )
                      }}
                    />
                  </label>
                  <label className="property-field compact">
                    <span>Y 倍率</span>
                    <NumberInput
                      value={animation.scaleYMultiplier}
                      min="0.01"
                      step="0.05"
                      disabled={readOnly}
                      aria-label={`${animation.id} Y 缩放倍率`}
                      onChange={(event) => {
                        const scaleYMultiplier = Number(event.target.value)
                        if (!Number.isFinite(scaleYMultiplier) || scaleYMultiplier <= 0) return
                        replaceAnimation(animation.id, (current) =>
                          current.kind === 'scale' ? { ...current, scaleYMultiplier } : current,
                        )
                      }}
                    />
                  </label>
                </>
              )}

              <label className="property-field compact">
                <span>周期 ms</span>
                <NumberInput
                  value={animation.timing.durationMs}
                  min="1"
                  step="50"
                  disabled={readOnly}
                  aria-label={`${animation.id} 周期`}
                  onChange={(event) => {
                    const durationMs = Number(event.target.value)
                    if (!Number.isFinite(durationMs) || durationMs <= 0) return
                    updateTiming(animation.id, { durationMs })
                  }}
                />
              </label>

              <label className="property-field compact">
                <span>延迟 ms</span>
                <NumberInput
                  value={animation.timing.delayMs}
                  min="0"
                  step="50"
                  disabled={readOnly}
                  aria-label={`${animation.id} 延迟`}
                  onChange={(event) => {
                    const delayMs = Number(event.target.value)
                    if (!Number.isFinite(delayMs) || delayMs < 0) return
                    updateTiming(animation.id, { delayMs })
                  }}
                />
              </label>

              <label className="property-field compact">
                <span>循环</span>
                <Select
                  value={animation.timing.iterations === 'infinite' ? 'infinite' : 'finite'}
                  disabled={readOnly}
                  ariaLabel={`${animation.id} 循环模式`}
                  options={[
                    { value: 'infinite', label: '无限循环' },
                    { value: 'finite', label: '指定次数' },
                  ]}
                  onValueChange={(value) => updateTiming(animation.id, {
                    iterations: value === 'infinite' ? 'infinite' : 1,
                  })}
                />
              </label>

              {animation.timing.iterations !== 'infinite' && (
                <label className="property-field compact">
                  <span>次数</span>
                  <NumberInput
                    value={animation.timing.iterations}
                    min="1"
                    step="1"
                    disabled={readOnly}
                    aria-label={`${animation.id} 循环次数`}
                    onChange={(event) => {
                      const iterations = Number(event.target.value)
                      if (!Number.isInteger(iterations) || iterations <= 0) return
                      updateTiming(animation.id, { iterations })
                    }}
                  />
                </label>
              )}

              <label className="property-field compact">
                <span>方向</span>
                <Select
                  value={animation.timing.direction}
                  disabled={readOnly}
                  ariaLabel={`${animation.id} 方向`}
                  options={DIRECTION_OPTIONS}
                  onValueChange={(direction) => updateTiming(animation.id, {
                    direction: direction as VisualAnimationDirection,
                  })}
                />
              </label>

              <label className="property-field compact">
                <span>缓动</span>
                <Select
                  value={animation.timing.easing}
                  disabled={readOnly}
                  ariaLabel={`${animation.id} 缓动`}
                  options={EASING_OPTIONS}
                  onValueChange={(easing) => updateTiming(animation.id, {
                    easing: easing as VisualAnimationEasing,
                  })}
                />
              </label>

              <label className="property-field compact component-animation-activation-mode">
                <span>激活</span>
                <Select
                  value={animation.activation.kind}
                  disabled={readOnly}
                  ariaLabel={`${animation.id} 激活方式`}
                  options={[
                    { value: 'always', label: '始终运行' },
                    ...(properties.length > 0 ? [{ value: 'property', label: 'Property 条件' }] : []),
                  ]}
                  onValueChange={(kind) => {
                    if (kind === 'always') {
                      replaceAnimation(animation.id, (current) => ({
                        ...current,
                        activation: { kind: 'always' },
                      }))
                      return
                    }
                    const [propertyKey, property] = properties[0] ?? []
                    if (!propertyKey || !property) return
                    replaceAnimation(animation.id, (current) => ({
                      ...current,
                      activation: {
                        kind: 'property',
                        propertyKey,
                        operator: 'equals',
                        compareValue: property.defaultValue,
                      },
                    }))
                  }}
                />
              </label>

              {animation.activation.kind === 'property' && activationProperty && (
                <>
                  <label className="property-field compact">
                    <span>Property</span>
                    <Select
                      value={animation.activation.propertyKey}
                      disabled={readOnly}
                      ariaLabel={`${animation.id} Property`}
                      options={properties.map(([key, property]) => ({
                        value: key,
                        label: `${property.title || key} · ${key}`,
                      }))}
                      onValueChange={(propertyKey) => {
                        const property = definition.properties[propertyKey]
                        if (!property) return
                        replaceAnimation(animation.id, (current) => ({
                          ...current,
                          activation: {
                            kind: 'property',
                            propertyKey,
                            operator: 'equals',
                            compareValue: property.defaultValue,
                          },
                        }))
                      }}
                    />
                  </label>
                  <label className="property-field compact">
                    <span>条件</span>
                    <Select
                      value={animation.activation.operator}
                      disabled={readOnly}
                      ariaLabel={`${animation.id} 条件`}
                      options={operatorOptions(activationProperty)}
                      onValueChange={(operator) => replaceAnimation(animation.id, (current) => ({
                        ...current,
                        activation: current.activation.kind === 'property'
                          ? { ...current.activation, operator: operator as VisualRuleOperator }
                          : current.activation,
                      }))}
                    />
                  </label>
                  <label className="property-field compact">
                    <span>比较值</span>
                    <PropertyValueEditor
                      property={activationProperty}
                      value={animation.activation.compareValue}
                      disabled={readOnly}
                      ariaLabel={`${animation.id} 比较值`}
                      onChange={(compareValue) => replaceAnimation(animation.id, (current) => ({
                        ...current,
                        activation: current.activation.kind === 'property'
                          ? { ...current.activation, compareValue }
                          : current.activation,
                      }))}
                    />
                  </label>
                </>
              )}
            </div>
          </article>
        )
      })}

      {layerAnimations.length === 0 && (
        <div className="component-layer-empty">这个 Layer 还没有动画。</div>
      )}

      {!readOnly && (
        <div className="component-animation-add-actions">
          <Button variant="secondary" size="small" className="component-add-animation" onClick={addSpinAnimation}>
            + 添加 Spin 动画
          </Button>
          <Button variant="secondary" size="small" className="component-add-animation" onClick={addMoveAnimation}>
            + 添加 Move 动画
          </Button>
          <Button variant="secondary" size="small" className="component-add-animation" onClick={addScaleAnimation}>
            + 添加 Scale 动画
          </Button>
        </div>
      )}
    </div>
  )
}
