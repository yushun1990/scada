import { Button, Input } from '../../ui'
import type {
  ComponentPublicationObservation,
  ComponentPublicationSession,
} from './component-publication-client'

export type ComponentPublicationPanelProps = {
  configured: boolean
  session: ComponentPublicationSession | null
  observation: ComponentPublicationObservation | null
  username: string
  password: string
  busy: boolean
  publishReady: boolean
  onUsernameChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onLogin: () => void
  onLogout: () => void
  onRefreshObservation: () => void
}

function revisionLabel(observation: ComponentPublicationObservation | null) {
  if (!observation) return '尚未观察远端版本'
  return observation.revision === null
    ? '已观察：远端尚无已发布 revision'
    : `已观察：revision ${observation.revision}`
}

export function ComponentPublicationPanel({
  configured,
  session,
  observation,
  username,
  password,
  busy,
  publishReady,
  onUsernameChange,
  onPasswordChange,
  onLogin,
  onLogout,
  onRefreshObservation,
}: ComponentPublicationPanelProps) {
  if (!configured) {
    return (
      <p className="component-inspector-help">
        未配置发布服务。设置 VITE_PUBLICATION_API_URL 后，Component Workbench 才会连接远端发布 API；本地保存不受影响。
      </p>
    )
  }

  if (session === null) {
    return <p className="component-inspector-help">正在读取发布会话…</p>
  }

  if (!session.authenticated) {
    return (
      <div className="component-publication-panel">
        <p className="component-inspector-help">
          发布使用服务器创建的 HttpOnly 会话；管理员 token 不进入浏览器。
        </p>
        <label className="property-field">
          <span>发布用户</span>
          <Input
            value={username}
            autoComplete="username"
            disabled={busy}
            onChange={(event) => onUsernameChange(event.target.value)}
          />
        </label>
        <label className="property-field">
          <span>密码</span>
          <Input
            type="password"
            value={password}
            autoComplete="current-password"
            disabled={busy}
            onChange={(event) => onPasswordChange(event.target.value)}
          />
        </label>
        <Button
          disabled={busy || !username.trim() || !password}
          onClick={onLogin}
        >
          登录发布服务
        </Button>
      </div>
    )
  }

  return (
    <div className="component-publication-panel">
      <div className="component-implementation-note">
        <strong>{session.identity.displayName}</strong>
        <span>{session.identity.id}</span>
      </div>
      <p className="component-inspector-help">
        {revisionLabel(observation)}。Publish 使用这个已保存的观察值作为 baseRevision；发生冲突时不会自动刷新或重试。
      </p>
      {!publishReady && (
        <p className="component-inspector-help">
          只有状态为“可用”的本地组件才能发布。
        </p>
      )}
      <div className="component-publication-actions">
        <Button
          disabled={busy}
          onClick={onRefreshObservation}
        >
          刷新远端状态
        </Button>
        <Button
          disabled={busy}
          onClick={onLogout}
        >
          退出登录
        </Button>
      </div>
    </div>
  )
}
