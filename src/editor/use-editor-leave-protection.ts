import { useCallback, useEffect, useRef, useState } from 'react'
import {
  commitStudioNavigation,
  registerEditorNavigationGuard,
} from './editor-navigation'
import type { EditorSaveOutcome } from './use-editor-save-state'

type UseEditorLeaveProtectionOptions<T extends object, R> = {
  isDirtyNow: () => boolean
  isSavingNow: () => boolean
  save: () => Promise<EditorSaveOutcome<T, R>>
}

export function useEditorLeaveProtection<T extends object, R>({
  isDirtyNow,
  isSavingNow,
  save,
}: UseEditorLeaveProtectionOptions<T, R>) {
  const [pendingTargetHash, setPendingTargetHash] = useState<string | null>(null)
  const [leavingBusy, setLeavingBusy] = useState(false)
  const targetRef = useRef<string | null>(null)

  useEffect(() => {
    return registerEditorNavigationGuard({
      shouldBlock: () => isDirtyNow() || isSavingNow(),
      requestLeave: (targetHash) => {
        targetRef.current = targetHash
        setPendingTargetHash(targetHash)
      },
    })
  }, [isDirtyNow, isSavingNow])

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirtyNow() && !isSavingNow()) return
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirtyNow, isSavingNow])

  const cancelLeave = useCallback(() => {
    targetRef.current = null
    setPendingTargetHash(null)
  }, [])

  const discardAndLeave = useCallback(async () => {
    const target = targetRef.current
    if (!target || leavingBusy) return false

    setLeavingBusy(true)
    try {
      // IndexedDB writes cannot be cancelled once issued. If a save is already
      // active, wait for that captured snapshot to settle before leaving; any
      // edits newer than that snapshot are deliberately discarded by unmount.
      if (isSavingNow()) {
        await save()
      }

      targetRef.current = null
      setPendingTargetHash(null)
      commitStudioNavigation(target)
      return true
    } finally {
      setLeavingBusy(false)
    }
  }, [isSavingNow, leavingBusy, save])

  const saveAndLeave = useCallback(async () => {
    const target = targetRef.current
    if (!target || leavingBusy) return false

    setLeavingBusy(true)
    try {
      let outcome = await save()
      if (!outcome.ok) return false

      // A save already in flight may have captured an older revision while the
      // user continued editing. The modal prevents further pointer edits, so at
      // most one follow-up save is needed to persist the latest snapshot.
      if (isDirtyNow()) {
        outcome = await save()
        if (!outcome.ok || isDirtyNow()) return false
      }

      targetRef.current = null
      setPendingTargetHash(null)
      commitStudioNavigation(target)
      return true
    } finally {
      setLeavingBusy(false)
    }
  }, [isDirtyNow, leavingBusy, save])

  return {
    pendingTargetHash,
    leavingBusy,
    cancelLeave,
    discardAndLeave,
    saveAndLeave,
  }
}
