export const LEGACY_ACTION_IMPLEMENTATION_REMOVED =
  'legacy-action-implementation-removed' as const

export type PortableActionMigrationDiagnostic = Readonly<{
  code: typeof LEGACY_ACTION_IMPLEMENTATION_REMOVED
  actionKey: string
  message: string
}>

export type PortableActionMigrationResult = Readonly<{
  definition: unknown
  diagnostics: readonly PortableActionMigrationDiagnostic[]
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Normalize the short-lived, never-accepted Action `implementation` field out
 * of persisted/imported component definitions before current-schema
 * validation.
 *
 * The public Action signature is retained. The source value is deliberately
 * discarded and never evaluated, copied into the canonical model, or emitted
 * by current serializers. Callers that present an import/migration surface can
 * expose the returned diagnostics to the user.
 */
export function migrateLegacyPortableActionImplementations(
  definition: unknown,
): PortableActionMigrationResult {
  if (!isRecord(definition) || !isRecord(definition.actions)) {
    return { definition, diagnostics: [] }
  }

  const diagnostics: PortableActionMigrationDiagnostic[] = []
  let changed = false
  const actions = Object.fromEntries(
    Object.entries(definition.actions).map(([actionKey, action]) => {
      if (
        !isRecord(action) ||
        !Object.prototype.hasOwnProperty.call(action, 'implementation')
      ) {
        return [actionKey, action]
      }

      const signature = Object.fromEntries(
        Object.keys(action)
          .filter((field) => field !== 'implementation')
          .map((field) => [field, action[field]]),
      )
      changed = true
      diagnostics.push({
        code: LEGACY_ACTION_IMPLEMENTATION_REMOVED,
        actionKey,
        message:
          `已移除 Action ${actionKey} 的旧 implementation 源码；` +
          '当前可移植组件只保留公开签名，不执行用户源码。',
      })
      return [actionKey, signature]
    }),
  )

  if (!changed) {
    return { definition, diagnostics }
  }

  return {
    definition: {
      ...definition,
      actions,
    },
    diagnostics,
  }
}
