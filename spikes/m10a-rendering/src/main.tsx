import { Component, Suspense, lazy, useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { effectiveSnapshot, setFixtureProperties } from './semanticSnapshot'
import { emptySnapshot, type AdapterBridge, type FixtureName, type SpikeSnapshot } from './types'
import './styles.css'

const Adapter = lazy(() => import('./ThreeAdapter'))

class Boundary extends Component<{ children: ReactNode; onError: (message: string) => void }, { error: string | null }> {
  state: { error: string | null } = { error: null }
  static getDerivedStateFromError(error: Error) { return { error: error.message } }
  componentDidCatch(error: Error) { this.props.onError(error.message) }
  render() { return this.state.error ? <div role="alert">Renderer failed: {this.state.error}. Leave and re-enter to retry.</div> : this.props.children }
}

function App() {
  const effective = useSyncExternalStore(effectiveSnapshot.subscribe, effectiveSnapshot.get)
  const [active, setActive] = useState(location.hash === '#/3d')
  const [state, setState] = useState<SpikeSnapshot>(emptySnapshot)
  const bridge = useRef<AdapterBridge | null>(null)
  const retained = useRef(state)
  const receive = useCallback((next: SpikeSnapshot) => { retained.current = next; setState(next) }, [])
  const receiveBridge = useCallback((next: AdapterBridge | null) => { bridge.current = next; if (!next) receive({ ...retained.current, status: 'shell', error: null }) }, [receive])
  const enter = useCallback(() => { location.hash = '/3d'; setActive(true) }, [])
  const exit = useCallback(() => { bridge.current?.unload(); location.hash = '/'; setActive(false); receive({ ...retained.current, status: 'shell', error: null }) }, [receive])
  useEffect(() => { const navigate = () => { setActive(location.hash === '#/3d') }; window.addEventListener('hashchange', navigate); return () => window.removeEventListener('hashchange', navigate) }, [])
  const load = (name: FixtureName) => { void bridge.current?.loadFixture(name) }
  useEffect(() => {
    window.__m10a = {
      snapshot: () => structuredClone({ ...(bridge.current?.snapshot() ?? retained.current), effective: effectiveSnapshot.get() }),
      enter, exit,
      setProperties: setFixtureProperties,
      loadFixture: (name) => bridge.current ? bridge.current.loadFixture(name) : Promise.reject(new Error('ADAPTER_NOT_READY')),
      unload: () => bridge.current?.unload(), select: (id) => bridge.current?.select(id),
      setMode: (mode) => bridge.current?.setMode(mode), undo: () => bridge.current?.undo(), cancel: () => bridge.current?.cancel(),
      forceContextLoss: () => bridge.current?.forceContextLoss(),
      measure: (options) => bridge.current ? bridge.current.measure(options) : Promise.reject(new Error('ADAPTER_NOT_READY')),
    }
    return () => { delete window.__m10a }
  }, [enter, exit])

  return <main>
    <header><span className="eyebrow">SCADA · M10A / disposable experiment</span><h1>One snapshot, two presentations</h1><p>Fixed internal GLB fixtures only. No authoring persistence, import admission, Preview or DSL acceptance.</p></header>
    <section className="toolbar" aria-label="Lifecycle">
      <button data-testid="enter-3d" onClick={enter} disabled={active}>Enter lazy 3D route</button>
      <button data-testid="exit-3d" onClick={exit} disabled={!active}>Leave 3D route</button>
      {(['triangle', 'textured', 'reference'] as const).map((name) => <button key={name} data-testid={`load-${name}`} disabled={!active} onClick={() => load(name)}>Load {name}</button>)}
      <button data-testid="unload-model" disabled={!active} onClick={() => bridge.current?.unload()}>Unload model</button>
    </section>
    <div className="workspace"><aside>
      <h2>Shared effective Properties</h2><label><input data-testid="visible" type="checkbox" checked={effective.visible === true} onChange={(e) => setFixtureProperties({ visible: e.target.checked })}/> Visible</label>
      <label><input data-testid="playing" type="checkbox" checked={effective.playing === true} onChange={(e) => setFixtureProperties({ playing: e.target.checked })}/> Play embedded clip</label>
      <label>Material color <input data-testid="color" type="color" value={String(effective.color)} onChange={(e) => setFixtureProperties({ color: e.target.value })}/></label>
      <div data-testid="reference-2d" className="reference"><div className={effective.playing ? 'reference-shape playing' : 'reference-shape'} style={{ visibility: effective.visible ? 'visible' : 'hidden', backgroundColor: String(effective.color) }}/></div>
      <p className="caption">2D HTML reference consumes the exact frozen object supplied to the 3D adapter. This is scalar presentation parity only.</p>
      <h2>Pointer controls</h2><div className="modes">{(['translate', 'rotate', 'scale'] as const).map((mode) => <button key={mode} data-testid={`mode-${mode}`} aria-pressed={state.mode === mode} onClick={() => bridge.current?.setMode(mode)}>{mode}</button>)}</div>
      <p className="caption">Click the model to select. Drag the gizmo; Escape cancels. Drag empty space to orbit. Each released gesture adds one local undo entry.</p>
      <button data-testid="undo" onClick={() => bridge.current?.undo()}>Undo ({state.historyDepth})</button><button data-testid="cancel" onClick={() => bridge.current?.cancel()}>Cancel gesture</button>
      <dl><dt>Logical selection</dt><dd data-testid="selection">{state.selectedId ?? 'none'}</dd><dt>Orbit</dt><dd>{state.orbitEnabled ? 'enabled' : 'transform owns input'}</dd><dt>Renderer allocations</dt><dd>{state.renderer.geometries} geometries · {state.renderer.textures} textures</dd></dl>
    </aside><section className="canvas-column"><div className="status" data-testid="status">{state.status}{state.error && ` · ${state.error}`}</div>
      <div className="viewport" data-testid="viewport">{active ? <Boundary onError={(error) => receive({ ...retained.current, status: 'error', error })}><Suspense fallback={<div className="placeholder">Loading isolated 3D adapter…</div>}><Adapter effective={effective} onBridge={receiveBridge} onSnapshot={receive}/></Suspense></Boundary> : <div className="placeholder"><h2>3D adapter not mounted</h2><p>Enter the route to fetch Three / React Three Fiber.</p></div>}</div>
      {state.error && <p className="failure" role="alert">{state.error}. Unload or leave and re-enter the route to retry.</p>}
    </section></div>
    <footer>Local experiment · WebGL2 · capped DPR 1 · demand rendering · measurements are environment observations, not accepted budgets.</footer>
  </main>
}

declare global {
  interface Window { __m10a?: Omit<AdapterBridge, 'snapshot'> & { snapshot(): SpikeSnapshot & { effective: Readonly<Record<string, unknown>> }; enter(): void; exit(): void; setProperties: typeof setFixtureProperties } }
}
createRoot(document.getElementById('root')!).render(<App/> )
