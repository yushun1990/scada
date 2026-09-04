import { useRef, useState } from 'react'
import type { ComponentVisualDefinition } from '../../component-system/visual'
import { Button } from '../../ui'
import {
  applyImportedVisualAsset,
  importLocalVisualAsset,
  LOCAL_VISUAL_ASSET_ACCEPT,
} from './visual-asset-import'
import type { ComponentLayerSelectionChange } from './ComponentVisualTreeEditor'

type ComponentVisualAssetImportControlProps = {
  visual: ComponentVisualDefinition
  readOnly: boolean
  selectedLayerId: string | null
  requireReplacement?: boolean
  onSelectionChange: ComponentLayerSelectionChange
  onChange: (visual: ComponentVisualDefinition) => void
}

export function ComponentVisualAssetImportControl({
  visual,
  readOnly,
  selectedLayerId,
  requireReplacement = false,
  onSelectionChange,
  onChange,
}: ComponentVisualAssetImportControlProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function ingestFile(file: File | undefined) {
    if (!file || readOnly || busy) return

    setBusy(true)
    setMessage('')
    try {
      const imported = await importLocalVisualAsset(file)
      const result = applyImportedVisualAsset(visual, imported, {
        selectedLayerId,
        requireReplacement,
      })
      onChange(result.visual)
      onSelectionChange(result.layerId)
      setMessage(result.replaced ? '资源已替换，可撤销/重做' : '资源已导入，可撤销/重做')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '资源导入失败')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="component-asset-import-control">
      <input
        ref={inputRef}
        className="component-asset-file-input"
        type="file"
        tabIndex={-1}
        accept={LOCAL_VISUAL_ASSET_ACCEPT}
        disabled={readOnly || busy}
        onChange={(event) => void ingestFile(event.currentTarget.files?.[0])}
      />
      <Button
        size="small"
        disabled={readOnly || busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? '处理中…' : requireReplacement ? '替换文件' : '导入 SVG / 图片'}
      </Button>
      {message && (
        <span className="component-asset-import-message" role="status" aria-live="polite">
          {message}
        </span>
      )}
    </div>
  )
}
