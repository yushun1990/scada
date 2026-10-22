import { useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { fixtures } from './fixtureCatalog'
import { observeModelResources } from './resourceObservation'
import { finishGesture, verifyFixtureBytes } from './experimentModel'
import { emptySnapshot, type AdapterBridge, type AdapterProps, type FixtureName, type Metrics, type Mode, type Sample, type Transform } from './types'

function transformOf(object: THREE.Object3D): Transform {
  return { position: object.position.toArray(), quaternion: object.quaternion.toArray(), scale: object.scale.toArray() }
}
function restore(object: THREE.Object3D, value: Transform) {
  object.position.fromArray(value.position); object.quaternion.fromArray(value.quaternion); object.scale.fromArray(value.scale)
  object.updateMatrixWorld(true)
}
function heapUsed() { return (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null }
function resourceCounts(gl: THREE.WebGLRenderer): Metrics {
  return { geometries: gl.info.memory.geometries, textures: gl.info.memory.textures, programs: gl.info.programs?.length ?? 0, calls: gl.info.render.calls, triangles: gl.info.render.triangles }
}
function releaseModel(model: GLTF) {
  const geometries = new Set<THREE.BufferGeometry>(); const materials = new Set<THREE.Material>(); const textures = new Set<THREE.Texture>(); const images = new Set<ImageBitmap>()
  model.scenes.forEach((scene) => scene.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (mesh.geometry) geometries.add(mesh.geometry)
    if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material) => materials.add(material))
  }))
  materials.forEach((material) => {
    Object.values(material).forEach((value: unknown) => { if (value instanceof THREE.Texture) textures.add(value) })
  })
  textures.forEach((texture) => {
    const image: unknown = texture.source?.data
    if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) images.add(image)
    texture.dispose()
  })
  geometries.forEach((geometry) => geometry.dispose()); materials.forEach((material) => material.dispose()); images.forEach((image) => image.close())
  return { geometries: geometries.size, materials: materials.size, textures: textures.size, imagesClosed: images.size }
}

function SceneController({ effective, onBridge, onSnapshot }: AdapterProps) {
  const { gl, scene, camera, invalidate } = useThree()
  const latestEffective = useRef(effective); latestEffective.current = effective
  const controller = useRef<{ tick: (delta: number) => void; apply: () => void } | null>(null)
  useFrame((_state, delta) => controller.current?.tick(delta))
  useEffect(() => { controller.current?.apply() }, [effective])
  useEffect(() => {
    let alive = true; let generation = 0; let abort: AbortController | null = null
    let model: GLTF | null = null; let group: THREE.Group | null = null; let mixer: THREE.AnimationMixer | null = null
    let transform: TransformControls | null = null; let gestureBefore: Transform | null = null
    let measured = false
    const objectURLs = new Set<string>()
    const rendererTextureUniforms = new Set<{ value: unknown }>()
    const state = emptySnapshot(); state.status = 'empty'
    const history: Array<{ before: Transform; after: Transform }> = []
    const orbit = new OrbitControls(camera, gl.domElement)
    orbit.enableDamping = false; orbit.target.set(0, 0, 0); orbit.update()
    scene.background = new THREE.Color('#111b27')
    const ambient = new THREE.HemisphereLight(0xffffff, 0x42607b, 2.5)
    const light = new THREE.DirectionalLight(0xffffff, 3); light.position.set(4, 6, 8)
    scene.add(ambient, light)
    const context = gl.getContext() as WebGL2RenderingContext
    const debug = context.getExtension('WEBGL_debug_renderer_info')
    state.capability = { webgl2: context instanceof WebGL2RenderingContext, version: context.getParameter(context.VERSION), renderer: context.getParameter(context.RENDERER), vendor: context.getParameter(context.VENDOR), unmaskedRenderer: debug ? context.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null, unmaskedVendor: debug ? context.getParameter(debug.UNMASKED_VENDOR_WEBGL) : null, maxTextureSize: gl.capabilities.maxTextureSize, maxRenderbufferSize: context.getParameter(context.MAX_RENDERBUFFER_SIZE), contextAttributes: context.getContextAttributes(), userAgent: navigator.userAgent, dpr: gl.getPixelRatio() }
    const event = (kind: string, details: Record<string, unknown> = {}) => { state.telemetry.events.push({ kind, at: performance.now(), ...details }); if (state.telemetry.events.length > 200) state.telemetry.events.shift() }
    const screen = (point: THREE.Vector3) => { const rect = gl.domElement.getBoundingClientRect(); point.project(camera); return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 } }
    function snapshot() {
      state.renderer = resourceCounts(gl); state.orbitEnabled = orbit.enabled; state.historyDepth = history.length; state.controlAxis = transform?.axis ?? null
      state.telemetry.ownedObjectURLs = objectURLs.size
      state.transform = group ? transformOf(group) : null; state.visual.mixerTime = mixer?.time ?? 0; state.visual.animationTime = mixer?.time ?? 0
      state.visual.groupVisible = group?.visible ?? null; state.visual.mixerTimeScale = mixer?.timeScale ?? null; state.visual.materialColor = null
      const observedMaps = new Set<THREE.Texture>()
      model?.scene.traverse((object) => { const material = (object as THREE.Mesh).material; const first = Array.isArray(material) ? material[0] : material; if (!state.visual.materialColor && first && 'color' in first && first.color instanceof THREE.Color) state.visual.materialColor = `#${first.color.getHexString()}` })
      model?.scene.traverse((object) => { const material = (object as THREE.Mesh).material; if (material) (Array.isArray(material) ? material : [material]).forEach((value) => { if ('map' in value && value.map instanceof THREE.Texture) observedMaps.add(value.map) }) })
      state.visual.materialMapCount = observedMaps.size
      if (group) {
        const center = group.getWorldPosition(new THREE.Vector3())
        const perspective = camera as THREE.PerspectiveCamera
        const factor = center.distanceTo(camera.position) * Math.min(1.9 * Math.tan(Math.PI * perspective.fov / 360) / perspective.zoom, 7) * (transform?.size ?? 1) / 4
        state.screenPoints = { center: screen(center.clone()), x: screen(center.clone().add(new THREE.Vector3(factor * .45, 0, 0))), y: screen(center.clone().add(new THREE.Vector3(0, factor * .45, 0))), z: screen(center.clone().add(new THREE.Vector3(0, 0, factor * .45))), rotate: screen(center.clone().add(new THREE.Vector3(factor * .35, factor * .35, 0))) }
        state.screenPoints.translate = state.screenPoints.x; state.screenPoints.scale = state.screenPoints.x
      } else state.screenPoints = {}
      return structuredClone(state)
    }
    function publish() { if (alive) onSnapshot(snapshot()) }
    function apply() {
      const props = latestEffective.current
      state.visual = { ...state.visual, visible: props.visible === true, color: String(props.color), playing: props.playing === true, clipCount: model?.animations.length ?? 0, mixerTime: mixer?.time ?? 0, animationTime: mixer?.time ?? 0, snapshotFrozen: Object.isFrozen(props) }
      if (group) group.visible = props.visible === true
      if (model) model.scene.traverse((object) => {
        const mesh = object as THREE.Mesh
        if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material) => { if ('color' in material && material.color instanceof THREE.Color) material.color.set(String(props.color)) })
      })
      if (mixer) mixer.timeScale = props.playing === true ? 1 : 0
      if (transform) transform.enabled = props.visible === true
      invalidate(); publish()
    }
    function cancel() {
      if (!gestureBefore || !group) return
      transform?.reset(); restore(group, gestureBefore); gestureBefore = null
      if (transform) transform.dragging = false
      state.gesture.active = false; state.gesture.cancels++; orbit.enabled = true
      event('gesture-cancel', { source: 'pointer' }); invalidate(); publish()
    }
    function destroyTransform() {
      if (!transform) return
      transform.detach(); scene.remove(transform.getHelper()); transform.dispose(); transform = null
    }
    function createTransform() {
      if (!group) return
      destroyTransform()
      transform = new TransformControls(camera, gl.domElement); transform.setSize(1.5); transform.setMode(state.mode)
      transform.addEventListener('mouseDown', () => {
        if (!group || measured) return
        gestureBefore = transformOf(group); state.gesture.active = true; state.gesture.source = 'pointer'; orbit.enabled = false
        event('gesture-start', { source: 'pointer', mode: state.mode }); publish()
      })
      transform.addEventListener('mouseUp', () => {
        if (!group || !gestureBefore) { orbit.enabled = true; return }
        const before = gestureBefore; gestureBefore = null; const after = transformOf(group)
        const outcome = finishGesture(before, after)
        if (outcome.kind === 'invalid') { restore(group, before); state.gesture.cancels++; event('gesture-invalid') }
        else if (outcome.kind === 'commit') { history.push(outcome.command); state.gesture.commits++; event('gesture-commit', { source: 'pointer', mode: state.mode, commandCount: 1 }) }
        state.gesture.active = false; orbit.enabled = true; invalidate(); publish()
      })
      transform.addEventListener('change', () => { invalidate(); publish() })
      transform.attach(group); scene.add(transform.getHelper())
    }
    function unload() {
      generation++; abort?.abort(); abort = null; cancel(); destroyTransform()
      const before = resourceCounts(gl); let released: Record<string, number> = {}
      if (mixer && model) { mixer.stopAllAction(); mixer.uncacheRoot(model.scene); mixer = null }
      if (group) { scene.remove(group); group.clear(); group = null }
      if (model) { released = releaseModel(model); model = null }
      // Three 0.186.1 allocates a singleton DFG lookup texture for PBR. This
      // isolated app owns one renderer; dispose its captured uniform resource
      // after the final model. This is a measured spike decision, not a shared
      // multi-viewport cache policy.
      const rendererTextures = new Set<THREE.Texture>()
      rendererTextureUniforms.forEach((uniform) => { if (uniform.value instanceof THREE.Texture && uniform.value.name === 'DFG_LUT') rendererTextures.add(uniform.value) })
      rendererTextures.forEach((texture) => texture.dispose()); rendererTextureUniforms.clear()
      history.length = 0; state.selectedId = null; state.fixture = null; state.visual.clipCount = 0
      state.status = 'empty'; state.error = null; gl.renderLists.dispose()
      if (!context.isContextLost()) gl.render(scene, camera)
      state.telemetry.disposals.push({ before, after: resourceCounts(gl), released, disposedRendererTextures: [...rendererTextures].map((texture) => texture.name), heapUsed: heapUsed(), at: performance.now() })
      invalidate(); publish()
    }
    async function loadFixture(name: FixtureName) {
      if (!Object.hasOwn(fixtures, name)) throw new Error('UNKNOWN_INTERNAL_FIXTURE')
      if (context.isContextLost() || state.status === 'context-lost') { state.status = 'context-lost'; state.error = 'WEBGL_CONTEXT_LOST_RELOAD_REQUIRED'; publish(); return }
      unload(); const ticket = generation; const fixture = fixtures[name]
      if ('imageWidth' in fixture.expected && (fixture.expected.imageWidth > gl.capabilities.maxTextureSize || fixture.expected.imageHeight > gl.capabilities.maxTextureSize)) {
        state.status = 'unsupported'; state.error = 'FIXTURE_TEXTURE_EXCEEDS_DEVICE_CAPABILITY'; publish(); return
      }
      const request = new AbortController(); abort = request; state.status = 'loading'; publish()
      const started = performance.now(); let loaded: GLTF | null = null
      const sessionURLs = new Set<string>()
      const resourceErrors: string[] = []
      try {
        const response = await fetch(fixture.url, { signal: request.signal, cache: 'default' })
        if (!response.ok) throw new Error(`FIXTURE_HTTP_${response.status}`)
        const bytes = await response.arrayBuffer(); const fetched = performance.now()
        const verifiedFixture = await verifyFixtureBytes(name, bytes)
        const digest = verifiedFixture.digest
        if (!alive || ticket !== generation) { state.telemetry.staleDiscards++; return }
        const verified = performance.now()
        // The loader receives only pinned, generated exact bytes. It is not a
        // general input validator. Embedded images use loader-owned blob URLs.
        const manager = new THREE.LoadingManager()
        manager.setURLModifier((url) => { if (!url.startsWith('blob:')) throw new Error('UNEXPECTED_FIXTURE_DEPENDENCY'); sessionURLs.add(url); objectURLs.add(url); event('loader-owned-blob', { fixture: name }); return url })
        manager.onError = (url) => { resourceErrors.push(url); event('loader-resource-error', { fixture: name, resource: 'embedded-image' }) }
        loaded = await new GLTFLoader(manager).parseAsync(verifiedFixture.bytes, '')
        const parsed = performance.now()
        if (!alive || ticket !== generation) { releaseModel(loaded); loaded = null; state.telemetry.staleDiscards++; return }
        if (resourceErrors.length) throw new Error('FIXTURE_EMBEDDED_IMAGE_DECODE_FAILED')
        model = loaded; loaded = null; group = new THREE.Group(); group.name = fixture.logicalId; group.userData.logicalId = fixture.logicalId; group.add(model.scene); scene.add(group)
        model.scene.traverse((object) => { const material = (object as THREE.Mesh).material; if (material) (Array.isArray(material) ? material : [material]).forEach((value) => { value.onBeforeCompile = (shader) => { if (shader.uniforms.dfgLUT) rendererTextureUniforms.add(shader.uniforms.dfgLUT) } }) })
        const sphere = new THREE.Box3().setFromObject(group).getBoundingSphere(new THREE.Sphere()); const radius = Math.max(sphere.radius, .5)
        camera.position.copy(sphere.center).add(new THREE.Vector3(radius * .8, radius * .65, radius * 2.8)); (camera as THREE.PerspectiveCamera).near = Math.max(radius / 1000, .01); (camera as THREE.PerspectiveCamera).far = Math.max(radius * 20, 100); (camera as THREE.PerspectiveCamera).updateProjectionMatrix()
        orbit.target.copy(sphere.center); orbit.update()
        mixer = new THREE.AnimationMixer(model.scene); model.animations.forEach((clip) => mixer!.clipAction(clip).play())
        state.fixture = name; state.status = 'ready'; state.error = null
        apply(); gl.render(scene, camera)
        const firstRenderError = context.getError()
        if (firstRenderError !== context.NO_ERROR) throw new Error(`WEBGL_FIRST_RENDER_ERROR_${firstRenderError}`)
        const firstRendered = performance.now()
        state.telemetry.loads.push({ fixture: name, sha256: digest, hashVerified: true, byteLength: bytes.byteLength, fetchMs: fetched - started, hashMs: verified - fetched, parseMs: parsed - verified, firstRenderMs: firstRendered - parsed, totalMs: firstRendered - started, firstRenderMeaning: 'CPU setup/render submission and error check; no GPU completion fence', heapUsed: heapUsed(), resourceObservation: observeModelResources(model.scene) })
        invalidate(); publish()
      } catch (error) {
        if (loaded) releaseModel(loaded)
        if (!alive || ticket !== generation || request.signal.aborted) { state.telemetry.staleDiscards++; return }
        // Failure after attaching the parsed scene must not retain a partial
        // model. Preserve the failure after clearing all owned live resources.
        if (model || group) unload()
        state.status = 'error'; state.error = error instanceof Error ? error.message : String(error); event('load-error', { error: state.error }); publish()
      } finally {
        sessionURLs.forEach((url) => { URL.revokeObjectURL(url); objectURLs.delete(url) }); sessionURLs.clear()
        publish()
      }
    }
    function select(id: string) {
      if (!group || id !== group.userData.logicalId) return
      state.selectedId = id; createTransform(); invalidate(); publish()
    }
    const raycaster = new THREE.Raycaster()
    const pointer = (e: PointerEvent) => {
      if (!group || !group.visible || transform?.dragging || transform?.axis) return
      const rect = gl.domElement.getBoundingClientRect()
      raycaster.setFromCamera(new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1), camera)
      if (raycaster.intersectObject(group, true).length) { select(group.userData.logicalId as string); event('raycast-select', { logicalId: group.userData.logicalId, source: 'pointer' }) }
    }
    const keyboard = (e: KeyboardEvent) => { if (e.key === 'Escape') cancel() }
    const orbitChange = () => { invalidate() }
    const contextLost = (e: Event) => { e.preventDefault(); generation++; abort?.abort(); abort = null; cancel(); state.status = 'context-lost'; state.error = 'WEBGL_CONTEXT_LOST: leave and re-enter the route to recreate resources'; event('context-lost'); publish() }
    const contextRestored = () => { state.status = 'context-lost'; state.error = 'WEBGL_CONTEXT_RESTORED_RELOAD_REQUIRED'; event('context-restored'); publish() }
    gl.domElement.addEventListener('pointerdown', pointer); window.addEventListener('keydown', keyboard)
    gl.domElement.addEventListener('webglcontextlost', contextLost); gl.domElement.addEventListener('webglcontextrestored', contextRestored); orbit.addEventListener('change', orbitChange)
    const bridge: AdapterBridge = {
      snapshot, loadFixture, unload, select, cancel,
      setMode(mode: Mode) { if (!['translate', 'rotate', 'scale'].includes(mode)) return; cancel(); state.mode = mode; transform?.setMode(mode); invalidate(); publish() },
      undo() { cancel(); const command = history.pop(); if (group && command) { restore(group, command.before); event('undo'); invalidate(); publish() } },
      forceContextLoss() { gl.forceContextLoss() },
      async measure({ phase, frames = 120 }) {
        if (measured || state.gesture.active || state.status !== 'ready' || !group) throw new Error('MEASUREMENT_REQUIRES_IDLE_READY_MODEL')
        if (!['idle', 'orbit', 'transform'].includes(phase)) throw new Error('INVALID_MEASUREMENT_PHASE')
        measured = true
        const count = Math.min(600, Math.max(10, Math.trunc(frames))); const started = performance.now(); let previous = started
        const initialPosition = camera.position.clone(); const initialQuaternion = camera.quaternion.clone(); const initial = transformOf(group); const generationAtStart = generation; const renderedBefore = state.telemetry.renderedFrames
        const intervals: number[] = []
        try {
          for (let index = 0; index < count; index++) {
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
            if (!alive || generation !== generationAtStart || !group) throw new Error('MEASUREMENT_CANCELLED')
            const now = performance.now(); intervals.push(now - previous); previous = now
            if (phase === 'orbit') { const relative = initialPosition.clone().sub(orbit.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), index / count * .4); camera.position.copy(orbit.target).add(relative); orbit.update(); invalidate() }
            if (phase === 'transform') { group.position.x = initial.position[0] + Math.sin(index / count * Math.PI * 2) * .25; group.updateMatrixWorld(true); invalidate() }
          }
          const sorted = [...intervals].sort((a, b) => a - b); const percentile = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)]
          const result: Sample = { phase, source: 'scripted-probe', frames: count, elapsedMs: performance.now() - started, frameIntervalsMs: intervals, p50: percentile(.5), p95: percentile(.95), p99: percentile(.99), renderedFrames: state.telemetry.renderedFrames - renderedBefore, heapUsed: heapUsed() }
          state.telemetry.measurements.push(result); return result
        } finally {
          measured = false
          if (alive && generation === generationAtStart && group) { restore(group, initial); camera.position.copy(initialPosition); camera.quaternion.copy(initialQuaternion); orbit.update(); invalidate(); publish() }
        }
      },
    }
    controller.current = { apply, tick(delta) { state.telemetry.renderedFrames++; if (mixer && latestEffective.current.playing === true && state.status === 'ready') { mixer.update(Math.min(delta, .1)); invalidate() } } }
    onBridge(bridge); publish(); void loadFixture('textured')
    return () => {
      unload(); alive = false; controller.current = null; onBridge(null)
      gl.domElement.removeEventListener('pointerdown', pointer); window.removeEventListener('keydown', keyboard)
      gl.domElement.removeEventListener('webglcontextlost', contextLost); gl.domElement.removeEventListener('webglcontextrestored', contextRestored)
      orbit.removeEventListener('change', orbitChange); orbit.dispose(); scene.remove(ambient, light)
      gl.renderLists.dispose(); gl.dispose(); gl.forceContextLoss()
    }
  }, [gl, scene, camera, invalidate, onBridge, onSnapshot])
  return null
}

export default function ThreeAdapter(props: AdapterProps) {
  const [supported] = useState(() => {
    if (new URLSearchParams(location.search).get('unsupported') === '1') return false
    const canvas = document.createElement('canvas'); const context = canvas.getContext('webgl2')
    if (!context) return false
    context.getExtension('WEBGL_lose_context')?.loseContext(); return true
  })
  useEffect(() => {
    if (!supported) props.onSnapshot({ ...emptySnapshot(), status: 'unsupported', error: 'WEBGL2_UNSUPPORTED', capability: { webgl2: false, injected: new URLSearchParams(location.search).get('unsupported') === '1' } })
  }, [supported, props.onSnapshot])
  if (!supported) return <div className="placeholder" role="alert"><h2>WebGL2 unavailable</h2><p>This experiment requires WebGL2. No model resources were allocated.</p></div>
  return <Canvas frameloop="demand" dpr={1} camera={{ fov: 45, position: [3, 2, 6], near: .01, far: 1000 }} gl={{ antialias: true, powerPreference: 'high-performance' }}><SceneController {...props}/></Canvas>
}
