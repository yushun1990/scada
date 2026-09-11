export function isTextEditingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return Boolean(
    target.closest('input, textarea, [contenteditable="true"], [role="textbox"]'),
  )
}

export function shouldIgnoreEditorShortcut(event: KeyboardEvent) {
  return Boolean(
    event.defaultPrevented ||
    event.isComposing ||
    isTextEditingTarget(event.target),
  )
}
