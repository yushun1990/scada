import type {
  ComponentActionParameterDefinition,
  ComponentDefinition,
} from '../../component-system/definition'
import { serializeManagedSvgDataUrl } from '../../component-system/managedSvg'
import { applyThemeToManagedSvgDocument } from '../../component-system/managedSvgTheme'
import type {
  ComponentVisualDefinition,
  ComponentVisualLayer,
  SvgVisualLayer,
} from '../../component-system/visual'
import type { ManagedSvgDocument } from '../../component-system/managedSvg'


export type MethodRunResult = {
  ok: boolean
  message: string
  elapsedMs: number
}

export type MethodExecutionContextOptions = {
  visual: ComponentVisualDefinition
  definition: ComponentDefinition
  layer?: ComponentVisualLayer | null
  svgLayer?: SvgVisualLayer | null
  getLatestSvgDocument?: () => ManagedSvgDocument | null
  setLatestSvgDocument?: (doc: ManagedSvgDocument) => void
  onUpdateVisual?: (visual: ComponentVisualDefinition) => void
  onUpdateLayer?: (layer: ComponentVisualLayer) => void
  onThemeChanged?: (theme: string, assetRef: string) => void
}

export function createMethodExecutionContext(options: MethodExecutionContextOptions) {
  const {
    visual,
    definition,
    layer,
    svgLayer,
    getLatestSvgDocument,
    setLatestSvgDocument,
    onUpdateVisual,
    onUpdateLayer,
    onThemeChanged,
  } = options

  let currentLayersSnapshot = visual.layers ? [...visual.layers] : []

  const notifyVisualUpdate = () => {
    if (onUpdateVisual) {
      onUpdateVisual({
        ...visual,
        layers: currentLayersSnapshot,
      })
    }
  }

  const layerProxies = currentLayersSnapshot.map((l, index) => {
    const proxy = {
      id: l.id,
      name: l.name,
      kind: l.kind,
      get show(): boolean {
        const cur = currentLayersSnapshot[index]
        return cur ? cur.visible !== false : true
      },
      set show(val: boolean) {
        const isVis = Boolean(val)
        const target = currentLayersSnapshot[index]
        if (!target || target.visible === isVis) return
        const updated = { ...target, visible: isVis }
        currentLayersSnapshot = currentLayersSnapshot.map((item, i) =>
          i === index ? updated : item,
        )
        notifyVisualUpdate()
        if (layer?.id === target.id) {
          onUpdateLayer?.(updated)
        }
      },
      get visible(): boolean {
        const cur = currentLayersSnapshot[index]
        return cur ? cur.visible !== false : true
      },
      set visible(val: boolean) {
        this.show = val
      },
      setVisible(val: boolean) {
        this.show = val
      },
      raw: l,
    }
    return proxy
  })

  const layerTarget = {
    id: layer?.id,
    name: layer?.name,
    kind: layer?.kind,
    layers: layerProxies,
    showOnly: (targetNameOrId: string) => {
      for (const lp of layerProxies) {
        lp.show = lp.name === targetNameOrId || lp.id === targetNameOrId
      }
    },
    showLayer: (targetNameOrId: string) => {
      const found = layerProxies.find(
        (lp) => lp.name === targetNameOrId || lp.id === targetNameOrId,
      )
      if (found) found.show = true
    },
    hideLayer: (targetNameOrId: string) => {
      const found = layerProxies.find(
        (lp) => lp.name === targetNameOrId || lp.id === targetNameOrId,
      )
      if (found) found.show = false
    },
    findLayer: (targetNameOrId: string) => {
      return layerProxies.find((lp) => lp.name === targetNameOrId || lp.id === targetNameOrId)
    },
    setTheme: (state: string) => {
      const currentDoc = (getLatestSvgDocument ? getLatestSvgDocument() : null) || svgLayer?.document
      if (currentDoc && svgLayer) {
        const nextDoc = applyThemeToManagedSvgDocument(currentDoc, state)
        setLatestSvgDocument?.(nextDoc)
        const nextAssetRef = serializeManagedSvgDataUrl(nextDoc)
        onThemeChanged?.(state, nextAssetRef)
        onUpdateLayer?.({
          ...svgLayer,
          document: nextDoc,
          assetRef: nextAssetRef,
        })
      }
    },
    applyTheme: (state: string) => {
      layerTarget.setTheme(state)
    },
    raw: layer,
  }

  return {
    $self: layerTarget,
    layers: layerProxies,
    layer: layerTarget,
    emit: (eventName: string, payload?: unknown) => {
      console.info(`[Action Emit] ${eventName}:`, payload)
    },
    definition,
    visual,
  }
}

export function executeMethodCode(
  methodName: string,
  code: string,
  args: Record<string, unknown>,
  parameterDefs: readonly ComponentActionParameterDefinition[],
  options: MethodExecutionContextOptions,
): MethodRunResult {
  const startTime = performance.now()
  try {
    const context = createMethodExecutionContext(options)
    const $self = context.$self
    const layers = context.layers
    const $emit = context.emit
    const argValues = parameterDefs.map((p) => args[p.name])
    const wrapped = `
      "use strict";
      ${code}
      if (typeof ${methodName} !== 'function') {
        throw new Error("未在代码中找到方法定义 function ${methodName}(...)");
      }
      const fnStr = ${methodName}.toString();
      const paramMatch = fnStr.match(/^[^(]*\\(([^)]*)\\)/);
      const firstParam = paramMatch ? paramMatch[1].split(',')[0].trim() : '';
      const callArgs = firstParam === '$self' ? [$self, ...argList] : argList;
      return ${methodName}.apply($self, callArgs);
    `
    const runner = new Function('$self', 'layers', '$emit', 'context', 'args', 'argList', wrapped)
    const result = runner($self, layers, $emit, context, args, argValues)
    const elapsedMs = Math.round((performance.now() - startTime) * 10) / 10
    return {
      ok: true,
      message: result !== undefined ? String(result) : '图层与组件状态已实时更新',
      elapsedMs,
    }
  } catch (err) {
    const elapsedMs = Math.round((performance.now() - startTime) * 10) / 10
    return {
      ok: false,
      message: (err as Error)?.message || String(err),
      elapsedMs,
    }
  }
}
