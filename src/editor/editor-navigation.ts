export type EditorNavigationGuard = {
  shouldBlock: () => boolean
  requestLeave: (targetHash: string) => void
}

let activeGuard: EditorNavigationGuard | null = null
// One-shot bypass for navigation that the editor lifecycle has explicitly
// accepted, including restoring the current editor after an intercepted Back.
// It prevents that restoration hashchange from reopening the leave dialog.
let bypassTargetHash: string | null = null

export function normalizeStudioHash(hash: string) {
  const trimmed = hash.trim()
  if (!trimmed || trimmed === '#') return '#/works'
  if (trimmed.startsWith('#/')) return trimmed
  if (trimmed.startsWith('#')) return `#/${trimmed.slice(1).replace(/^\//, '')}`
  return `#/${trimmed.replace(/^\//, '')}`
}

export function registerEditorNavigationGuard(guard: EditorNavigationGuard) {
  activeGuard = guard
  return () => {
    if (activeGuard === guard) activeGuard = null
  }
}

export function getActiveEditorNavigationGuard() {
  return activeGuard
}

export function commitStudioNavigation(targetHash: string) {
  const normalized = normalizeStudioHash(targetHash)
  bypassTargetHash = normalized
  if (normalizeStudioHash(window.location.hash) === normalized) {
    bypassTargetHash = null
    return
  }
  window.location.hash = normalized
}

export function requestStudioNavigation(targetHash: string) {
  const normalized = normalizeStudioHash(targetHash)
  const guard = activeGuard

  if (guard?.shouldBlock()) {
    guard.requestLeave(normalized)
    return false
  }

  commitStudioNavigation(normalized)
  return true
}

export function consumeStudioNavigationBypass(targetHash: string) {
  const normalized = normalizeStudioHash(targetHash)
  if (bypassTargetHash !== normalized) return false
  bypassTargetHash = null
  return true
}
