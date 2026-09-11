import { useCallback, useRef, useState } from 'react'

const DEFAULT_HISTORY_LIMIT = 100

type Updater<T> = T | ((current: T) => T)

export type DocumentHistory<T> = {
  document: T
  mutate: (updater: Updater<T>) => void
  beginTransaction: () => void
  commitTransaction: () => void
  cancelTransaction: () => void
  replaceCurrent: (document: T) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  reset: (document: T) => void
}

function resolveUpdater<T>(current: T, updater: Updater<T>) {
  return typeof updater === 'function'
    ? (updater as (current: T) => T)(current)
    : updater
}

function pushLimited<T>(history: T[], value: T, limit: number) {
  history.push(value)
  if (history.length > limit) {
    history.splice(0, history.length - limit)
  }
}

/**
 * One history authority for an authored document.
 *
 * Outside an explicit transaction every mutate() call is one undo entry.
 * Between beginTransaction() and commitTransaction(), any number of mutate()
 * calls update the live document but share the same before snapshot. This is
 * the contract used by controlled form fields: focus begins, blur/Enter
 * commits, and Escape cancels.
 */
export function useDocumentHistory<T>(
  initial: T | (() => T),
  limit = DEFAULT_HISTORY_LIMIT,
): DocumentHistory<T> {
  const initialRef = useRef<T | null>(null)
  if (initialRef.current === null) {
    initialRef.current = typeof initial === 'function'
      ? (initial as () => T)()
      : initial
  }

  const [document, setDocument] = useState<T>(initialRef.current)
  const documentRef = useRef(document)
  const pastRef = useRef<T[]>([])
  const futureRef = useRef<T[]>([])
  const pendingBeforeRef = useRef<T | null>(null)
  const [, setVersion] = useState(0)

  const bump = useCallback(() => setVersion((value) => value + 1), [])

  const apply = useCallback((next: T) => {
    documentRef.current = next
    setDocument(next)
  }, [])

  const mutate = useCallback((updater: Updater<T>) => {
    const current = documentRef.current
    const next = resolveUpdater(current, updater)

    if (next === current) {
      return
    }

    if (pendingBeforeRef.current === null) {
      pushLimited(pastRef.current, current, limit)
      futureRef.current = []
    }

    apply(next)
  }, [apply, limit])

  const beginTransaction = useCallback(() => {
    pendingBeforeRef.current ??= documentRef.current
  }, [])

  const commitTransaction = useCallback(() => {
    const before = pendingBeforeRef.current
    if (before === null) {
      return
    }

    pendingBeforeRef.current = null
    if (before === documentRef.current) {
      return
    }

    pushLimited(pastRef.current, before, limit)
    futureRef.current = []
    bump()
  }, [bump, limit])

  const cancelTransaction = useCallback(() => {
    const before = pendingBeforeRef.current
    if (before === null) {
      return
    }

    pendingBeforeRef.current = null
    apply(before)
    bump()
  }, [apply, bump])

  const replaceCurrent = useCallback((next: T) => {
    pendingBeforeRef.current = null
    apply(next)
    bump()
  }, [apply, bump])

  const undo = useCallback(() => {
    const pendingBefore = pendingBeforeRef.current
    if (pendingBefore !== null && pendingBefore !== documentRef.current) {
      const after = documentRef.current
      pendingBeforeRef.current = null
      pushLimited(futureRef.current, after, limit)
      apply(pendingBefore)
      bump()
      return
    }

    pendingBeforeRef.current = null
    const previous = pastRef.current.pop()
    if (previous === undefined) {
      return
    }

    pushLimited(futureRef.current, documentRef.current, limit)
    apply(previous)
    bump()
  }, [apply, bump, limit])

  const redo = useCallback(() => {
    if (pendingBeforeRef.current !== null) {
      return
    }

    const next = futureRef.current.pop()
    if (next === undefined) {
      return
    }

    pushLimited(pastRef.current, documentRef.current, limit)
    apply(next)
    bump()
  }, [apply, bump, limit])

  const reset = useCallback((next: T) => {
    pendingBeforeRef.current = null
    pastRef.current = []
    futureRef.current = []
    apply(next)
    bump()
  }, [apply, bump])

  return {
    document,
    mutate,
    beginTransaction,
    commitTransaction,
    cancelTransaction,
    replaceCurrent,
    undo,
    redo,
    canUndo: pastRef.current.length > 0 || Boolean(
      pendingBeforeRef.current !== null && pendingBeforeRef.current !== documentRef.current,
    ),
    canRedo: pendingBeforeRef.current === null && futureRef.current.length > 0,
    reset,
  }
}
