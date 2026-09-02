import { useRef, useState, type ChangeEvent } from 'react'
import { Button, Input } from '../../ui'
import { StandaloneSceneRuntime } from './StandaloneSceneRuntime'
import {
  parseStandaloneWorkRuntimeDocument,
  type StandaloneWorkRuntime,
} from './standalone-work-runtime'
import './standalone-runtime.css'

function navigateToWorkspace() {
  window.location.hash = '#/works'
}

export function StandaloneRuntimePage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [loaded, setLoaded] = useState<StandaloneWorkRuntime | null>(null)
  const [fileName, setFileName] = useState('')
  const [message, setMessage] = useState('')

  async function loadPackage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const next = parseStandaloneWorkRuntimeDocument(await file.text())
      if (!next) {
        throw new Error('作品包无效、依赖不完整、运行能力缺失或版本不受支持')
      }
      setLoaded(next)
      setFileName(file.name)
      setMessage('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '作品包加载失败')
    }
  }

  const scene = loaded?.workPackage.scene ?? null
  const dependencyCount = loaded?.workPackage.dependencies.length ?? 0

  return (
    <div className="standalone-runtime-shell">
      <header className="standalone-runtime-header">
        <div className="standalone-runtime-brand">
          <span className="standalone-runtime-mark" aria-hidden="true">◆</span>
          <div>
            <strong>SCADA Runtime</strong>
            <span>独立只读运行器</span>
          </div>
        </div>

        <div className="standalone-runtime-actions">
          {scene && (
            <div className="standalone-runtime-document" aria-label="当前运行作品">
              <strong>{scene.name}</strong>
              <span>
                {scene.width} × {scene.height} · {scene.nodes.length} 节点 · {dependencyCount} 可移植依赖
              </span>
            </div>
          )}
          <Button variant="secondary" onClick={() => inputRef.current?.click()}>
            {scene ? '加载其他作品包' : '加载作品包'}
          </Button>
          <Button variant="ghost" onClick={navigateToWorkspace}>
            返回工作台
          </Button>
          <Input
            ref={inputRef}
            className="hidden-input"
            type="file"
            accept="application/json,.json,.scada-work.json"
            aria-label="选择独立运行作品包文件"
            onChange={(event) => void loadPackage(event)}
          />
        </div>
      </header>

      {message && (
        <div className="standalone-runtime-message" role="alert">
          {message}
        </div>
      )}

      <main className="standalone-runtime-main">
        {loaded && scene ? (
          <StandaloneSceneRuntime
            key={`${fileName}:${scene.id}`}
            scene={scene}
            registry={loaded.registry}
            runtime={loaded.runtime}
            acquireRuntime={loaded.acquire}
          />
        ) : (
          <section className="standalone-runtime-empty">
            <span className="standalone-runtime-empty-mark" aria-hidden="true">◇</span>
            <h1>加载 dependency-complete SCADA 作品包</h1>
            <p>
              独立运行器直接消费 M8 的 <code>.scada-work.json</code>；不会导入作品、安装组件或写入 Studio 本地数据库。
            </p>
            <Button variant="primary" onClick={() => inputRef.current?.click()}>
              选择作品包
            </Button>
          </section>
        )}
      </main>
    </div>
  )
}
