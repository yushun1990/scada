import {
  forwardRef,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type Konva from 'konva'
import { Group } from 'react-konva'
import {
  applyVisualAnimationOverlay,
  evaluateVisualAnimations,
} from './animations'
import { CompositeComponentVisualRenderer } from './CompositeComponentVisualRenderer'
import { createDefaultPropsFromDefinition, type ComponentDefinition } from './definition'
import type { ComponentRegistration } from './registration'
import type { ComponentRendererProps } from './renderer'
import type { ComponentVisualDefinition } from './visual'
import { resolveComponentVisualRules } from './visualRules'

/**
 * Build a trusted runtime registration from a declarative composite package.
 *
 * This factory deliberately consumes only the structured public definition and
 * visual model. It never evaluates Component Workbench implementationDraft text.
 */
export function createCompositeComponentRegistration(
  definition: ComponentDefinition,
  visual: ComponentVisualDefinition,
): ComponentRegistration {
  if (visual.mode !== 'composite') {
    throw new Error(
      `Component ${definition.type} cannot use the composite registration factory with a native visual`,
    )
  }

  const renderer = forwardRef<Konva.Group, ComponentRendererProps>(
    function RegisteredCompositeComponentRenderer(
      {
        attributes,
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
      const [animationTimeMs, setAnimationTimeMs] = useState(0)
      const ruleResolvedVisual = useMemo(
        () => resolveComponentVisualRules(visual, { attributes, properties }),
        [attributes, properties],
      )
      const renderedVisual = useMemo(
        () => applyVisualAnimationOverlay(
          ruleResolvedVisual,
          evaluateVisualAnimations(ruleResolvedVisual, properties, animationTimeMs),
        ),
        [animationTimeMs, properties, ruleResolvedVisual],
      )

      useEffect(() => {
        if (visual.animations.length === 0) {
          setAnimationTimeMs(0)
          return
        }

        let frameId = 0
        let epochMs: number | null = null

        const tick = (nowMs: number) => {
          epochMs ??= nowMs
          setAnimationTimeMs(nowMs - epochMs)
          frameId = window.requestAnimationFrame(tick)
        }

        frameId = window.requestAnimationFrame(tick)
        return () => window.cancelAnimationFrame(frameId)
      }, [])

      return (
        <Group
          ref={ref}
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
          <CompositeComponentVisualRenderer
            visual={renderedVisual}
            x={0}
            y={0}
            width={width}
            height={height}
            rotation={0}
            visible
            opacity={1}
            listening={listening}
          />
        </Group>
      )
    },
  )

  return {
    definition,
    renderer,
    createDefaultProps: () => createDefaultPropsFromDefinition(definition),
  }
}
