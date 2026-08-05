import { useState, type CSSProperties } from 'react'
import pumpSvg from './assets/water-pump'

const navigation = [
  { label: '运行监控', icon: '◉', active: true },
  { label: '组态编辑', icon: '◇' },
  { label: '设备管理', icon: '▣' },
  { label: '告警中心', icon: '△' },
  { label: '历史趋势', icon: '⌁' },
]

const metrics = [
  { label: '在线设备', value: '128', detail: '总计 132 台', tone: 'healthy' },
  { label: '实时告警', value: '3', detail: '1 条需要处理', tone: 'warning' },
  { label: '今日数据点', value: '2.4M', detail: '较昨日 +8.2%', tone: 'neutral' },
  { label: '系统可用率', value: '99.98%', detail: '过去 30 天', tone: 'healthy' },
]

const stations = [
  { name: '一号供水站', status: '运行中', pressure: '0.42 MPa', flow: '86.5 m³/h' },
  { name: '二号加压站', status: '运行中', pressure: '0.38 MPa', flow: '74.2 m³/h' },
  { name: '北区泵房', status: '需关注', pressure: '0.31 MPa', flow: '52.8 m³/h' },
]

const pumpPalettes = {
  stopped: {
    light: '#8a9699',
    dark: '#566366',
  },
  running: {
    light: '#4be127',
    dark: '#2ea110',
  },
} as const

type PumpState = keyof typeof pumpPalettes

type PumpColorStyle = CSSProperties & {
  '--pump-color1': string
  '--pump-color2': string
}

function App() {
  const [pumpState, setPumpState] = useState<PumpState>('stopped')
  const pumpIsRunning = pumpState === 'running'
  const pumpColors = pumpPalettes[pumpState]
  const pumpColorStyle: PumpColorStyle = {
    '--pump-color1': pumpColors.light,
    '--pump-color2': pumpColors.dark,
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">S</span>
          <span>
            <strong>SCADA</strong>
            <small>Industrial Console</small>
          </span>
        </div>

        <nav aria-label="主导航">
          {navigation.map((item) => (
            <button
              className={`nav-item${item.active ? ' active' : ''}`}
              key={item.label}
              type="button"
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="system-card">
          <span className="status-dot" />
          <div>
            <strong>系统运行正常</strong>
            <small>最后检查：刚刚</small>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">实时运行中心</p>
            <h1>工业监控总览</h1>
          </div>
          <div className="topbar-actions">
            <span className="connection"><i /> 实时连接</span>
            <button type="button">管理员</button>
          </div>
        </header>

        <section className="metrics-grid" aria-label="关键指标">
          {metrics.map((metric) => (
            <article className="metric-card" key={metric.label}>
              <div className="metric-heading">
                <span>{metric.label}</span>
                <i className={`metric-indicator ${metric.tone}`} />
              </div>
              <strong>{metric.value}</strong>
              <small>{metric.detail}</small>
            </article>
          ))}
        </section>

        <section className="workspace-grid">
          <article className="panel pump-demo-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">PUMP COLOR DEMO</p>
                <h2>水泵状态控制</h2>
              </div>
              <span className={`pump-state-badge ${pumpState}`}>
                <i />
                {pumpIsRunning ? '运行中' : '已停止'}
              </span>
            </div>

            <div className="pump-demo">
              <div
                className={`pump-stage ${pumpState}`}
                style={pumpColorStyle}
                role="img"
                aria-label={`水泵当前状态：${pumpIsRunning ? '运行中' : '已停止'}`}
              >
                <div
                  className="pump-svg"
                  aria-hidden="true"
                  dangerouslySetInnerHTML={{ __html: pumpSvg }}
                />
                <span className="pump-stage-label">P-101 潜水泵</span>
              </div>

              <div className="pump-controls">
                <div>
                  <p className="control-kicker">SVG 标签驱动</p>
                  <h3>{pumpIsRunning ? '水泵正在运行' : '水泵处于停止状态'}</h3>
                  <p className="control-description">
                    启停操作通过 CSS 变量修改 SVG 中的两个颜色路径，其他结构与阴影保持不变。
                  </p>
                </div>

                <div className="pump-readings" aria-label="水泵实时数据">
                  <div>
                    <small>运行频率</small>
                    <strong>{pumpIsRunning ? '48.5 Hz' : '0.0 Hz'}</strong>
                  </div>
                  <div>
                    <small>出口压力</small>
                    <strong>{pumpIsRunning ? '0.42 MPa' : '0.00 MPa'}</strong>
                  </div>
                </div>

                <div className="color-bindings" aria-label="SVG 颜色标签">
                  <div>
                    <span className="color-swatch light" style={{ background: pumpColors.light }} />
                    <span>
                      <strong>pump-color1</strong>
                      <small>浅颜色 {pumpColors.light}</small>
                    </span>
                  </div>
                  <div>
                    <span className="color-swatch dark" style={{ background: pumpColors.dark }} />
                    <span>
                      <strong>pump-color2</strong>
                      <small>深颜色 {pumpColors.dark}</small>
                    </span>
                  </div>
                </div>

                <div className="pump-actions" aria-label="水泵控制">
                  <button
                    className="start-button"
                    type="button"
                    aria-pressed={pumpIsRunning}
                    disabled={pumpIsRunning}
                    onClick={() => setPumpState('running')}
                  >
                    启动水泵
                  </button>
                  <button
                    className="stop-button"
                    type="button"
                    aria-pressed={!pumpIsRunning}
                    disabled={!pumpIsRunning}
                    onClick={() => setPumpState('stopped')}
                  >
                    停止水泵
                  </button>
                </div>
              </div>
            </div>
          </article>

          <article className="panel station-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">LIVE STATIONS</p>
                <h2>站点状态</h2>
              </div>
              <button type="button" className="text-button">查看全部</button>
            </div>

            <div className="station-list">
              {stations.map((station) => (
                <div className="station-row" key={station.name}>
                  <div className="station-name">
                    <span className={station.status === '需关注' ? 'status-dot warning' : 'status-dot'} />
                    <div>
                      <strong>{station.name}</strong>
                      <small>{station.status}</small>
                    </div>
                  </div>
                  <div>
                    <small>压力</small>
                    <strong>{station.pressure}</strong>
                  </div>
                  <div>
                    <small>流量</small>
                    <strong>{station.flow}</strong>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>
      </main>
    </div>
  )
}

export default App
