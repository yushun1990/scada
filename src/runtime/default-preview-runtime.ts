import { builtInComponentRegistry } from '../component-system/builtins'
import { createDefaultPreviewMockSources } from './mock-data-source'
import { PreviewRuntime } from './preview-runtime'

/**
 * Browser/product singleton. Keep built-in renderer/assets out of the generic
 * PreviewRuntime core so runtime semantics remain deterministic and testable in
 * a plain Node environment.
 */
export const previewRuntime = new PreviewRuntime(
  createDefaultPreviewMockSources(),
  builtInComponentRegistry,
)
