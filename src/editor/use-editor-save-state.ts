import { useCallback, useRef, useState } from 'react'

export type EditorSaveStatus = 'saved' | 'dirty' | 'saving' | 'error'

export type EditorSaveOutcome<T, R> =
  | {
      ok: true
      document: T
      revision: number
      result: R
      currentAtCompletion: boolean
    }
  | {
      ok: false
      document: T
      revision: number
      error: Error
    }

type UseEditorSaveStateOptions<T, R> = {
  document: T
  initiallySaved: boolean
  saveDocument: (document: T) => Promise<R>
}

export function useEditorSaveState<T extends object, R>({
  document,
  initiallySaved,
  saveDocument,
}: UseEditorSaveStateOptions<T, R>) {
  const documentRef = useRef(document)
  const previousDocumentRef = useRef(document)
  const revisionRef = useRef(0)
  const savedDocumentRef = useRef<T | null>(initiallySaved ? document : null)
  const savedRevisionRef = useRef<number | null>(initiallySaved ? 0 : null)
  const savingRevisionRef = useRef<number | null>(null)
  const savingRef = useRef(false)
  const activeSaveRef = useRef<Promise<EditorSaveOutcome<T, R>> | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [, setVersion] = useState(0)

  if (previousDocumentRef.current !== document) {
    previousDocumentRef.current = document
    documentRef.current = document
    revisionRef.current += 1
  } else {
    documentRef.current = document
  }

  const bump = useCallback(() => setVersion((value) => value + 1), [])

  const isDirtyNow = useCallback(
    () => savedDocumentRef.current !== documentRef.current,
    [],
  )

  const isSavingNow = useCallback(() => savingRef.current, [])

  const save = useCallback((): Promise<EditorSaveOutcome<T, R>> => {
    const active = activeSaveRef.current
    if (active) return active

    const snapshot = documentRef.current
    const revision = revisionRef.current
    savingRef.current = true
    savingRevisionRef.current = revision
    setError(null)
    bump()

    let operation: Promise<EditorSaveOutcome<T, R>>
    operation = (async () => {
      try {
        const result = await saveDocument(snapshot)
        savedDocumentRef.current = snapshot
        savedRevisionRef.current = revision
        const outcome: EditorSaveOutcome<T, R> = {
          ok: true,
          document: snapshot,
          revision,
          result,
          currentAtCompletion: documentRef.current === snapshot,
        }
        return outcome
      } catch (cause) {
        const normalized = cause instanceof Error
          ? cause
          : new Error('保存失败')
        setError(normalized)
        return {
          ok: false,
          document: snapshot,
          revision,
          error: normalized,
        }
      } finally {
        if (activeSaveRef.current === operation) {
          activeSaveRef.current = null
          savingRef.current = false
          savingRevisionRef.current = null
          bump()
        }
      }
    })()

    activeSaveRef.current = operation
    return operation
  }, [bump, saveDocument])

  const dirty = savedDocumentRef.current !== document
  const saving = savingRef.current
  const status: EditorSaveStatus = saving
    ? 'saving'
    : error
      ? 'error'
      : dirty
        ? 'dirty'
        : 'saved'

  return {
    status,
    dirty,
    saving,
    error,
    currentRevision: revisionRef.current,
    savedRevision: savedRevisionRef.current,
    savingRevision: savingRevisionRef.current,
    save,
    isDirtyNow,
    isSavingNow,
  }
}
