import {
  COMPONENT_VISUAL_VERSION,
  type ComponentVisualDesignSize,
} from './visual'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function normalizeStoredComponentVisual(
  value: unknown,
  fallbackDesignSize: ComponentVisualDesignSize,
): unknown {
  if (!isRecord(value)) {
    return value
  }

  if (value.version === 1) {
    return {
      ...value,
      version: COMPONENT_VISUAL_VERSION,
      designSize: {
        width: fallbackDesignSize.width,
        height: fallbackDesignSize.height,
      },
      animations: [],
    }
  }

  if (value.version === 2) {
    return {
      ...value,
      version: COMPONENT_VISUAL_VERSION,
      animations: [],
    }
  }

  return value
}
