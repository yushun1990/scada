import { CollapsibleInspectorGroup } from '../../components/CollapsibleInspectorGroup'
import {
  resolveVisualVectorStyle,
  type VectorVisualLayer,
  type VisualGradient,
  type VisualLineCap,
  type VisualLineDash,
  type VisualLineMarker,
  type VisualScaleMode,
  type VisualScalePlacement,
} from '../../component-system/visual'
import {
  Checkbox,
  IconButton,
  Input,
  NumberInput,
  Select,
} from '../../ui'
import { ColorPickerInput } from './ColorPickerInput'

type ComponentVectorStyleSectionProps = {
  layer: VectorVisualLayer
  readOnly: boolean
  onUpdateLayer: (nextLayer: VectorVisualLayer) => void
}

const LINE_MARKER_OPTIONS = [
  { value: 'none', label: '无' },
  { value: 'arrow', label: '箭头' },
  { value: 'circle', label: '圆点' },
  { value: 'square', label: '方块' },
]

const SCALE_MODE_OPTIONS = [
  { value: 'auto', label: '自适应' },
  { value: 'fixed', label: '固定分度' },
]

const TICK_PLACEMENT_OPTIONS = [
  { value: 'right', label: '向右' },
  { value: 'left', label: '向左' },
  { value: 'both', label: '双向' },
]

function DualDirectionArrows({ isBottomUp }: { isBottomUp: boolean }) {
  return (
    <svg width={18} height={16} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <g
        stroke={isBottomUp ? 'var(--ui-color-accent, #0284c7)' : 'currentColor'}
        strokeWidth={isBottomUp ? 2.5 : 1.5}
        opacity={isBottomUp ? 1 : 0.25}
      >
        <path d="M6 16V4" />
        <path d="M2 8l4-4" />
      </g>
      <g
        stroke={!isBottomUp ? 'var(--ui-color-accent, #0284c7)' : 'currentColor'}
        strokeWidth={!isBottomUp ? 2.5 : 1.5}
        opacity={!isBottomUp ? 1 : 0.25}
      >
        <path d="M14 4v12" />
        <path d="M18 12l-4 4" />
      </g>
    </svg>
  )
}

const LINE_CAP_OPTIONS = [
  { value: 'round', label: '圆头' },
  { value: 'butt', label: '平头' },
  { value: 'square', label: '方头' },
]

const LINE_DASH_OPTIONS = [
  { value: 'solid', label: '实线' },
  { value: 'dashed', label: '虚线' },
  { value: 'dotted', label: '点线' },
]

const FILL_MODE_OPTIONS = [
  { value: 'solid', label: '单色填充' },
  { value: 'linear', label: '线性渐变 (金属/立体)' },
  { value: 'radial', label: '径向渐变 (高光/球体)' },
]

const SHADOW_MODE_OPTIONS = [
  { value: 'none', label: '无效果' },
  { value: 'glow', label: '外发光 (指示灯/警示)' },
  { value: 'drop-shadow', label: '投影 (立体质感)' },
  { value: 'custom', label: '自定义阴影' },
]

function getGradientStartColor(gradient?: VisualGradient): string {
  return gradient?.stops?.[0]?.color ?? '#38bdf8'
}

function getGradientEndColor(gradient?: VisualGradient): string {
  return gradient?.stops?.[gradient.stops.length - 1]?.color ?? '#0284c7'
}

function makeLinearGradient(startColor: string, endColor: string, angle = 90): VisualGradient {
  return {
    type: 'linear',
    angle,
    stops: [
      { offset: 0, color: startColor },
      { offset: 1, color: endColor },
    ],
  }
}

function makeRadialGradient(startColor: string, endColor: string): VisualGradient {
  return {
    type: 'radial',
    stops: [
      { offset: 0, color: startColor },
      { offset: 1, color: endColor },
    ],
  }
}

export function ComponentVectorStyleSection({
  layer,
  readOnly,
  onUpdateLayer,
}: ComponentVectorStyleSectionProps) {
  const style = resolveVisualVectorStyle(layer)
  const isLine = layer.primitive === 'line'
  const isScale = layer.primitive === 'scale'
  const isLineOrScale = isLine || isScale
  const fillMode = style.gradient?.type ?? 'solid'
  const currentShadow = style.shadow
  const shadowMode: 'none' | 'glow' | 'drop-shadow' | 'custom' = !currentShadow
    ? 'none'
    : currentShadow.offsetX === 0 && currentShadow.offsetY === 0 && currentShadow.blur > 0
      ? 'glow'
      : (currentShadow.offsetX !== 0 || currentShadow.offsetY !== 0) && currentShadow.blur > 0
        ? 'drop-shadow'
        : 'custom'

  return (
    <div className="component-layer-style-inspector">
      {/* 形状几何参数 */}
      {layer.primitive === 'rect' && (
        <CollapsibleInspectorGroup title="形状参数">
          <label className="property-field compact">
            <span>圆角半径</span>
            <NumberInput
              step="1"
              value={style.cornerRadius ?? 0}
              disabled={readOnly}
              onChange={(event) => {
                const cornerRadius = Number(event.target.value)
                if (!Number.isFinite(cornerRadius)) return
                onUpdateLayer({ ...layer, style: { ...style, cornerRadius } })
              }}
            />
            <small>正数外凸，负数内凹（如 -10）</small>
          </label>
        </CollapsibleInspectorGroup>
      )}

      {layer.primitive === 'polygon' && (
        <CollapsibleInspectorGroup title="多边形参数">
          <label className="property-field compact">
            <span>多边形边数</span>
            <NumberInput
              min="3"
              max="20"
              step="1"
              value={layer.sides ?? 3}
              disabled={readOnly}
              onChange={(event) => {
                const sides = Math.max(3, Math.min(20, Math.round(Number(event.target.value))))
                if (!Number.isFinite(sides)) return
                onUpdateLayer({ ...layer, sides })
              }}
            />
          </label>
        </CollapsibleInspectorGroup>
      )}

      {layer.primitive === 'arc' && (
        <CollapsibleInspectorGroup title="圆弧与仪表环">
          <div className="property-grid">
            <label className="property-field compact">
              <span>开角 (度)</span>
              <NumberInput
                min="1"
                max="360"
                step="5"
                value={layer.angle ?? 270}
                disabled={readOnly}
                onChange={(event) => {
                  const angle = Math.max(1, Math.min(360, Number(event.target.value)))
                  if (!Number.isFinite(angle)) return
                  onUpdateLayer({ ...layer, angle })
                }}
              />
            </label>
            <label className="property-field compact">
              <span>内径比 (环形)</span>
              <NumberInput
                min="0"
                max="0.95"
                step="0.05"
                value={layer.innerRadiusRatio ?? 0}
                disabled={readOnly}
                onChange={(event) => {
                  const innerRadiusRatio = Math.max(0, Math.min(0.95, Number(event.target.value)))
                  if (!Number.isFinite(innerRadiusRatio)) return
                  onUpdateLayer({ ...layer, innerRadiusRatio })
                }}
              />
            </label>
          </div>
        </CollapsibleInspectorGroup>
      )}

      {layer.primitive === 'scale' && (
        <CollapsibleInspectorGroup title="标尺参数">
          <div className="property-grid">
            <label className="property-field compact">
              <span>分度方式</span>
              <Select
                value={layer.scaleMode ?? 'auto'}
                disabled={readOnly}
                ariaLabel={`${layer.name} 分度方式`}
                options={SCALE_MODE_OPTIONS}
                onValueChange={(val) => {
                  onUpdateLayer({ ...layer, scaleMode: val as VisualScaleMode })
                }}
              />
            </label>

            <label className="property-field compact">
              <span>刻度朝向</span>
              <Select
                value={layer.tickPlacement ?? 'right'}
                disabled={readOnly}
                ariaLabel={`${layer.name} 刻度朝向`}
                options={TICK_PLACEMENT_OPTIONS}
                onValueChange={(val) => {
                  onUpdateLayer({ ...layer, tickPlacement: val as VisualScalePlacement })
                }}
              />
            </label>
          </div>

          <div className="property-grid">
            {(layer.scaleMode ?? 'auto') === 'auto' ? (
              <label className="property-field compact">
                <span>刻度间距</span>
                <NumberInput
                  min="8"
                  max="500"
                  step="2"
                  value={layer.tickSpacing ?? 24}
                  disabled={readOnly}
                  onChange={(event) => {
                    const tickSpacing = Math.max(8, Number(event.target.value))
                    if (!Number.isFinite(tickSpacing)) return
                    onUpdateLayer({ ...layer, tickSpacing })
                  }}
                />
              </label>
            ) : (
              <label className="property-field compact">
                <span>分度数</span>
                <NumberInput
                  min="1"
                  max="100"
                  step="1"
                  value={layer.divisions ?? 5}
                  disabled={readOnly}
                  onChange={(event) => {
                    const divisions = Math.max(1, Math.round(Number(event.target.value)))
                    if (!Number.isFinite(divisions)) return
                    onUpdateLayer({ ...layer, divisions })
                  }}
                />
              </label>
            )}

            <label className="property-field compact">
              <span>副分度数</span>
              <NumberInput
                min="1"
                max="10"
                step="1"
                value={layer.subDivisions ?? 2}
                disabled={readOnly}
                onChange={(event) => {
                  const subDivisions = Math.max(1, Math.min(10, Math.round(Number(event.target.value))))
                  if (!Number.isFinite(subDivisions)) return
                  onUpdateLayer({ ...layer, subDivisions })
                }}
              />
            </label>
          </div>

          <div className="property-grid">
            <label className="property-field compact">
              <span>主刻度长</span>
              <NumberInput
                min="2"
                max="100"
                step="1"
                value={layer.tickLength ?? 12}
                disabled={readOnly}
                onChange={(event) => {
                  const tickLength = Math.max(2, Number(event.target.value))
                  if (!Number.isFinite(tickLength)) return
                  onUpdateLayer({ ...layer, tickLength })
                }}
              />
            </label>

            <label className="property-field compact">
              <span>副刻度长</span>
              <NumberInput
                min="1"
                max="100"
                step="1"
                value={layer.subTickLength ?? 6}
                disabled={readOnly}
                onChange={(event) => {
                  const subTickLength = Math.max(1, Number(event.target.value))
                  if (!Number.isFinite(subTickLength)) return
                  onUpdateLayer({ ...layer, subTickLength })
                }}
              />
            </label>
          </div>

          <div className="property-field compact">
            <span>主轴线</span>
            <div className="property-field-checkbox-row">
              <Checkbox
                checked={layer.showAxis ?? true}
                disabled={readOnly}
                label="显示"
                onCheckedChange={(checked) => {
                  onUpdateLayer({ ...layer, showAxis: checked })
                }}
              />
            </div>
          </div>
        </CollapsibleInspectorGroup>
      )}

      {layer.primitive === 'scale' && (
        <CollapsibleInspectorGroup title="数字标注">
          <div className="property-field compact">
            <span>数字标注</span>
            <div className="property-field-checkbox-row">
              <Checkbox
                checked={layer.showLabels ?? false}
                disabled={readOnly}
                label="显示"
                onCheckedChange={(checked) => {
                  onUpdateLayer({ ...layer, showLabels: checked })
                }}
              />
            </div>
          </div>

          {(layer.showLabels ?? false) && (
            <>
              <div className="property-grid">
                <label className="property-field compact">
                  <span>初始值</span>
                  <div className="component-inline-input-with-action">
                    <NumberInput
                      step="1"
                      value={layer.labelStart ?? 0}
                      disabled={readOnly}
                      onChange={(event) => {
                        const labelStart = Number(event.target.value)
                        if (!Number.isFinite(labelStart)) return
                        onUpdateLayer({ ...layer, labelStart })
                      }}
                    />
                    <IconButton
                      className="component-direction-toggle-btn"
                      disabled={readOnly}
                      aria-label={`切换方向：当前为${(layer.labelDirection ?? 'bottomUp') === 'bottomUp' ? '向上' : '向下'}递增，点击切换`}
                      title={`切换方向：当前为${(layer.labelDirection ?? 'bottomUp') === 'bottomUp' ? '向上' : '向下'}递增，点击切换`}
                      onClick={() => {
                        const nextDirection = (layer.labelDirection ?? 'bottomUp') === 'bottomUp' ? 'topDown' : 'bottomUp'
                        onUpdateLayer({ ...layer, labelDirection: nextDirection })
                      }}
                    >
                      <DualDirectionArrows isBottomUp={(layer.labelDirection ?? 'bottomUp') === 'bottomUp'} />
                    </IconButton>
                  </div>
                </label>

                <label className="property-field compact">
                  <span>步长</span>
                  <NumberInput
                    min="0.001"
                    step="1"
                    value={layer.minTickValue ?? 1}
                    disabled={readOnly}
                    onChange={(event) => {
                      const minTickValue = Number(event.target.value)
                      if (!Number.isFinite(minTickValue) || minTickValue <= 0) return
                      onUpdateLayer({ ...layer, minTickValue })
                    }}
                  />
                </label>
              </div>

              <div className="property-grid">
                <label className="property-field compact">
                  <span>字体大小</span>
                  <NumberInput
                    min="4"
                    max="72"
                    step="1"
                    value={layer.labelFontSize ?? 10}
                    disabled={readOnly}
                    onChange={(event) => {
                      const labelFontSize = Math.max(4, Number(event.target.value))
                      if (!Number.isFinite(labelFontSize)) return
                      onUpdateLayer({ ...layer, labelFontSize })
                    }}
                  />
                </label>

                <label className="property-field compact">
                  <span>小数位数</span>
                  <NumberInput
                    min="0"
                    max="4"
                    step="1"
                    value={layer.labelDecimals ?? 0}
                    disabled={readOnly}
                    onChange={(event) => {
                      const labelDecimals = Math.max(0, Math.min(4, Math.round(Number(event.target.value))))
                      if (!Number.isFinite(labelDecimals)) return
                      onUpdateLayer({ ...layer, labelDecimals })
                    }}
                  />
                </label>
              </div>

              <label className="property-field compact">
                <span>字体</span>
                <Input
                  value={layer.labelFontFamily ?? 'sans-serif'}
                  disabled={readOnly}
                  onChange={(event) => {
                    onUpdateLayer({ ...layer, labelFontFamily: event.target.value })
                  }}
                />
              </label>

              <label className="property-field compact">
                <span>标注颜色</span>
                <ColorPickerInput
                  value={layer.labelColor ?? ''}
                  disabled={readOnly}
                  ariaLabel={`${layer.name} 标注颜色`}
                  placeholder="继承描边色"
                  onChange={(labelColor) => {
                    onUpdateLayer({ ...layer, labelColor })
                  }}
                />
              </label>
            </>
          )}
        </CollapsibleInspectorGroup>
      )}

      <CollapsibleInspectorGroup title="填充与描边">
        {!isLineOrScale && (
          <>
            <label className="property-field compact">
              <span>填充模式</span>
              <Select
                value={fillMode}
                disabled={readOnly}
                ariaLabel={`${layer.name} 填充模式`}
                options={FILL_MODE_OPTIONS}
                onValueChange={(val) => {
                  if (val === 'solid') {
                    onUpdateLayer({ ...layer, style: { ...style, gradient: undefined } })
                  } else if (val === 'linear') {
                    onUpdateLayer({
                      ...layer,
                      style: {
                        ...style,
                        gradient: makeLinearGradient(
                          style.fill && style.fill !== 'transparent' ? style.fill : '#38bdf8',
                          '#0284c7',
                          90,
                        ),
                      },
                    })
                  } else if (val === 'radial') {
                    onUpdateLayer({
                      ...layer,
                      style: {
                        ...style,
                        gradient: makeRadialGradient(
                          '#ffffff',
                          style.fill && style.fill !== 'transparent' ? style.fill : '#0284c7',
                        ),
                      },
                    })
                  }
                }}
              />
            </label>

            {fillMode === 'solid' && (
              <label className="property-field compact">
                <span>纯色填充</span>
                <ColorPickerInput
                  value={style.fill}
                  disabled={readOnly}
                  ariaLabel={`${layer.name} 填充`}
                  placeholder="#cbd5e1 / transparent"
                  clearValue="transparent"
                  onChange={(fill) => onUpdateLayer({
                    ...layer,
                    style: { ...style, fill },
                  })}
                />
              </label>
            )}

            {fillMode === 'linear' && (
              <>
                <div className="property-grid">
                  <label className="property-field compact">
                    <span>起始颜色</span>
                    <ColorPickerInput
                      value={getGradientStartColor(style.gradient)}
                      disabled={readOnly}
                      ariaLabel={`${layer.name} 渐变起始颜色`}
                      onChange={(color) => onUpdateLayer({
                        ...layer,
                        style: {
                          ...style,
                          gradient: makeLinearGradient(
                            color,
                            getGradientEndColor(style.gradient),
                            style.gradient?.angle ?? 90,
                          ),
                        },
                      })}
                    />
                  </label>
                  <label className="property-field compact">
                    <span>终止颜色</span>
                    <ColorPickerInput
                      value={getGradientEndColor(style.gradient)}
                      disabled={readOnly}
                      ariaLabel={`${layer.name} 渐变终止颜色`}
                      onChange={(color) => onUpdateLayer({
                        ...layer,
                        style: {
                          ...style,
                          gradient: makeLinearGradient(
                            getGradientStartColor(style.gradient),
                            color,
                            style.gradient?.angle ?? 90,
                          ),
                        },
                      })}
                    />
                  </label>
                </div>
                <label className="property-field compact">
                  <span>渐变角度 (度)</span>
                  <NumberInput
                    min="0"
                    max="360"
                    step="15"
                    value={style.gradient?.angle ?? 90}
                    disabled={readOnly}
                    onChange={(event) => {
                      const angle = Number(event.target.value)
                      if (!Number.isFinite(angle)) return
                      onUpdateLayer({
                        ...layer,
                        style: {
                          ...style,
                          gradient: makeLinearGradient(
                            getGradientStartColor(style.gradient),
                            getGradientEndColor(style.gradient),
                            angle,
                          ),
                        },
                      })
                    }}
                  />
                </label>
              </>
            )}

            {fillMode === 'radial' && (
              <div className="property-grid">
                <label className="property-field compact">
                  <span>中心高光</span>
                  <ColorPickerInput
                    value={getGradientStartColor(style.gradient)}
                    disabled={readOnly}
                    ariaLabel={`${layer.name} 中心高光`}
                    onChange={(color) => onUpdateLayer({
                      ...layer,
                      style: {
                        ...style,
                        gradient: makeRadialGradient(color, getGradientEndColor(style.gradient)),
                      },
                    })}
                  />
                </label>
                <label className="property-field compact">
                  <span>边缘暗调</span>
                  <ColorPickerInput
                    value={getGradientEndColor(style.gradient)}
                    disabled={readOnly}
                    ariaLabel={`${layer.name} 边缘暗调`}
                    onChange={(color) => onUpdateLayer({
                      ...layer,
                      style: {
                        ...style,
                        gradient: makeRadialGradient(getGradientStartColor(style.gradient), color),
                      },
                    })}
                  />
                </label>
              </div>
            )}
          </>
        )}

        <label className="property-field compact">
          <span>描边</span>
          <ColorPickerInput
            value={style.stroke}
            disabled={readOnly}
            ariaLabel={`${layer.name} 描边`}
            placeholder="#64748b / transparent"
            clearValue="transparent"
            onChange={(stroke) => onUpdateLayer({
              ...layer,
              style: { ...style, stroke },
            })}
          />
        </label>
        <div className="property-grid">
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
                onUpdateLayer({ ...layer, style: { ...style, strokeWidth } })
              }}
            />
          </label>
          <label className="property-field compact">
            <span>描边类型</span>
            <Select
              value={style.dash ?? 'solid'}
              disabled={readOnly}
              ariaLabel={`${layer.name} 描边类型`}
              options={LINE_DASH_OPTIONS}
              onValueChange={(value) => onUpdateLayer({
                ...layer,
                style: { ...style, dash: value as VisualLineDash },
              })}
            />
          </label>
        </div>
        {(isLineOrScale || (style.dash && style.dash !== 'solid')) && (
          <label className="property-field compact">
            <span>端点形状</span>
            <Select
              value={style.lineCap ?? 'round'}
              disabled={readOnly}
              ariaLabel={`${layer.name} 端点形状`}
              options={LINE_CAP_OPTIONS}
              onValueChange={(value) => onUpdateLayer({
                ...layer,
                style: { ...style, lineCap: value as VisualLineCap },
              })}
            />
          </label>
        )}
      </CollapsibleInspectorGroup>

      {/* 投影与光晕效果 */}
      <CollapsibleInspectorGroup title="光效与投影">
        <label className="property-field compact">
          <span>视觉效果</span>
          <Select
            value={shadowMode}
            disabled={readOnly}
            ariaLabel={`${layer.name} 视觉效果`}
            options={SHADOW_MODE_OPTIONS}
            onValueChange={(val) => {
              if (val === 'none') {
                onUpdateLayer({ ...layer, style: { ...style, shadow: undefined } })
              } else if (val === 'glow') {
                onUpdateLayer({
                  ...layer,
                  style: {
                    ...style,
                    shadow: {
                      color: '#22c55e',
                      blur: 14,
                      offsetX: 0,
                      offsetY: 0,
                      opacity: 0.85,
                    },
                  },
                })
              } else if (val === 'drop-shadow') {
                onUpdateLayer({
                  ...layer,
                  style: {
                    ...style,
                    shadow: {
                      color: '#000000',
                      blur: 8,
                      offsetX: 2,
                      offsetY: 4,
                      opacity: 0.35,
                    },
                  },
                })
              } else {
                onUpdateLayer({
                  ...layer,
                  style: {
                    ...style,
                    shadow: currentShadow ?? {
                      color: '#000000',
                      blur: 8,
                      offsetX: 2,
                      offsetY: 4,
                      opacity: 0.35,
                    },
                  },
                })
              }
            }}
          />
        </label>
        {shadowMode !== 'none' && currentShadow && (
          <>
            <div className="property-grid">
              <label className="property-field compact">
                <span>光影颜色</span>
                <ColorPickerInput
                  value={currentShadow.color}
                  disabled={readOnly}
                  ariaLabel={`${layer.name} 光影颜色`}
                  onChange={(color) => onUpdateLayer({
                    ...layer,
                    style: {
                      ...style,
                      shadow: { ...currentShadow, color },
                    },
                  })}
                />
              </label>
              <label className="property-field compact">
                <span>模糊半径</span>
                <NumberInput
                  min="0"
                  max="100"
                  step="1"
                  value={currentShadow.blur}
                  disabled={readOnly}
                  onChange={(event) => {
                    const blur = Number(event.target.value)
                    if (!Number.isFinite(blur) || blur < 0) return
                    onUpdateLayer({
                      ...layer,
                      style: {
                        ...style,
                        shadow: { ...currentShadow, blur },
                      },
                    })
                  }}
                />
              </label>
            </div>
            <div className="property-grid">
              <label className="property-field compact">
                <span>水平偏移</span>
                <NumberInput
                  step="1"
                  value={currentShadow.offsetX}
                  disabled={readOnly}
                  onChange={(event) => {
                    const offsetX = Number(event.target.value)
                    if (!Number.isFinite(offsetX)) return
                    onUpdateLayer({
                      ...layer,
                      style: {
                        ...style,
                        shadow: { ...currentShadow, offsetX },
                      },
                    })
                  }}
                />
              </label>
              <label className="property-field compact">
                <span>垂直偏移</span>
                <NumberInput
                  step="1"
                  value={currentShadow.offsetY}
                  disabled={readOnly}
                  onChange={(event) => {
                    const offsetY = Number(event.target.value)
                    if (!Number.isFinite(offsetY)) return
                    onUpdateLayer({
                      ...layer,
                      style: {
                        ...style,
                        shadow: { ...currentShadow, offsetY },
                      },
                    })
                  }}
                />
              </label>
            </div>
          </>
        )}
      </CollapsibleInspectorGroup>

      {isLine && (
        <CollapsibleInspectorGroup title="线段箭头与标记">
          <div className="property-grid">
            <label className="property-field compact">
              <span>起点样式</span>
              <Select
                value={style.startMarker ?? 'none'}
                disabled={readOnly}
                ariaLabel={`${layer.name} 起点样式`}
                options={LINE_MARKER_OPTIONS}
                onValueChange={(value) => onUpdateLayer({
                  ...layer,
                  style: { ...style, startMarker: value as VisualLineMarker },
                })}
              />
            </label>
            <label className="property-field compact">
              <span>终点样式</span>
              <Select
                value={style.endMarker ?? 'none'}
                disabled={readOnly}
                ariaLabel={`${layer.name} 终点样式`}
                options={LINE_MARKER_OPTIONS}
                onValueChange={(value) => onUpdateLayer({
                  ...layer,
                  style: { ...style, endMarker: value as VisualLineMarker },
                })}
              />
            </label>
          </div>
        </CollapsibleInspectorGroup>
      )}
    </div>
  )
}
