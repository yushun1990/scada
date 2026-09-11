import { Button } from '../ui'
import type { EditorSaveStatus } from './use-editor-save-state'
import './editor-save-state.css'

type EditorLeaveDialogProps = {
  open: boolean
  saveStatus: EditorSaveStatus
  saving: boolean
  busy: boolean
  errorMessage?: string | null
  onSaveAndLeave: () => void
  onDiscardAndLeave: () => void
  onCancel: () => void
}

export function EditorLeaveDialog({
  open,
  saveStatus,
  saving,
  busy,
  errorMessage,
  onSaveAndLeave,
  onDiscardAndLeave,
  onCancel,
}: EditorLeaveDialogProps) {
  if (!open) return null

  const savingMessage = saving
    ? '当前仍有保存请求进行中。保存并继续会在当前请求完成后补存最新版本；放弃修改会等当前请求结束后离开。'
    : '当前文档包含尚未持久化的修改。'

  return (
    <div className="editor-leave-backdrop" role="presentation">
      <section
        className="editor-leave-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-leave-title"
        aria-describedby="editor-leave-description"
      >
        <h2 id="editor-leave-title">保存修改后离开？</h2>
        <p id="editor-leave-description">{savingMessage}</p>
        {saveStatus === 'error' && errorMessage && (
          <p className="editor-leave-error" role="alert">{errorMessage}</p>
        )}
        <div className="editor-leave-actions">
          <Button
            variant="primary"
            disabled={busy}
            onClick={onSaveAndLeave}
          >
            {busy ? '处理中…' : '保存并继续'}
          </Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={onDiscardAndLeave}
          >
            放弃修改
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={onCancel}
          >
            取消
          </Button>
        </div>
      </section>
    </div>
  )
}
