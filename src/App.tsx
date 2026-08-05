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

function App() {
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
          <article className="panel process-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">PROCESS OVERVIEW</p>
                <h2>供水工艺流程</h2>
              </div>
              <button type="button">进入组态</button>
            </div>

            <div className="process-canvas" role="img" aria-label="供水工艺流程占位示意图">
              <div className="process-node source">
                <span>原水池</span>
                <strong>72%</strong>
              </div>
              <div className="pipeline first" />
              <div className="process-node pump">
                <span>提升泵组</span>
                <strong>2 / 3</strong>
              </div>
              <div className="pipeline second" />
              <div className="process-node output">
                <span>出水总管</span>
                <strong>0.42 MPa</strong>
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
