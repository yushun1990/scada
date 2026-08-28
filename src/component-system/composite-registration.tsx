import {
  forwardRef,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type Konva from 'konva'
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
        props,
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
        () => resolveComponentVisualRules(visual, props),
        [props],
      )
      const renderedVisual = useMemo(
        () => applyVisualAnimationOverlay(
          ruleResolvedVisual,
          evaluateVisualAnimations(ruleResolvedVisual, props, animationTimeMs),
        ),
        [animationTimeMs, props, ruleResolvedVisual],
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
        <CompositeComponentVisualRenderer
          ref={ref}
          visual={renderedVisual}
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
        />
      )
    },
  )

  return {
    definition,
    renderer,
    createDefaultProps: () => createDefaultPropsFromDefinition(definition),
  }
}
