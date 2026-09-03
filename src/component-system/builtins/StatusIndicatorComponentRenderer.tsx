import { forwardRef } from 'react'
import type Konva from 'konva'
import { Circle, Group, Rect, Text } from 'react-konva'
import type { ComponentRendererProps } from '../renderer'

type IndicatorState = 'off' | 'normal' | 'warning' | 'alarm'

const indicatorPalettes: Record<
  IndicatorState,
  { light: string; label: string; glow: boolean }
> = {
  off: { light: '#64748b', label: 'OFF', glow: false },
  normal: { light: '#22c55e', label: 'RUN', glow: true },
  warning: { light: '#f59e0b', label: 'WARN', glow: true },
  alarm: { light: '#ef4444', label: 'ALARM', glow: true },
}

function resolveIndicatorState(value: unknown): IndicatorState {
  return typeof value === 'string' && value in indicatorPalettes
    ? value as IndicatorState
    : 'normal'
}

export const StatusIndicatorComponentRenderer = forwardRef<
  Konva.Group,
  ComponentRendererProps
>(function StatusIndicatorComponentRendererImpl(
  {
    nodeId,
    properties,
    x,
    y,
    width,
    height,
    rotation,
    draggable,
    dragBoundFunc,
    visible,
    opacity,
    listening,
  },
  ref,
) {
  const state = resolveIndicatorState(properties.state)
  const palette = indicatorPalettes[state]
  const unit = Math.min(width, height)
  const bezelInset = unit * 0.07
  const lampRadius = unit * 0.24
  const lampCenterY = height * 0.4
  const strokeWidth = Math.max(1, unit * 0.025)

  return (
    <Group
      ref={ref}
      id={nodeId}
      name={listening ? 'scene-node' : undefined}
      x={x}
      y={y}
      width={width}
      height={height}
      rotation={rotation}
      draggable={draggable}
      dragBoundFunc={dragBoundFunc}
      visible={visible}
      opacity={opacity}
      listening={listening}
    >
      <Rect
        x={bezelInset}
        y={bezelInset}
        width={width - bezelInset * 2}
        height={height - bezelInset * 2}
        cornerRadius={unit * 0.16}
        fill="#111827"
        stroke="#475569"
        strokeWidth={strokeWidth}
        listening={listening}
        perfectDrawEnabled={false}
      />
      <Circle
        x={width / 2}
        y={lampCenterY}
        radius={lampRadius * 1.2}
        fill="#020617"
        stroke="#64748b"
        strokeWidth={strokeWidth}
        listening={listening}
        perfectDrawEnabled={false}
      />
      <Circle
        x={width / 2}
        y={lampCenterY}
        radius={lampRadius}
        fill={palette.light}
        shadowColor={palette.light}
        shadowBlur={palette.glow ? unit * 0.14 : 0}
        shadowOpacity={palette.glow ? 0.7 : 0}
        listening={listening}
        perfectDrawEnabled={false}
      />
      <Text
        x={bezelInset}
        y={height * 0.69}
        width={width - bezelInset * 2}
        height={height * 0.16}
        text={palette.label}
        align="center"
        verticalAlign="middle"
        fill="#e2e8f0"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fontStyle="bold"
        fontSize={Math.max(8, unit * 0.11)}
        listening={listening}
        perfectDrawEnabled={false}
      />
    </Group>
  )
})
