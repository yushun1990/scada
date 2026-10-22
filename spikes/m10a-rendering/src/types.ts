import type { ComponentProps } from '../../../src/component-system/definition'

export type { FixtureName } from './fixtureCatalog'
import type { FixtureName } from './fixtureCatalog'
export type Mode = 'translate' | 'rotate' | 'scale'
export type Transform = { position: number[]; quaternion: number[]; scale: number[] }
export type Metrics = { geometries: number; textures: number; programs: number; calls: number; triangles: number }
export type Sample = {
  phase: 'idle' | 'orbit' | 'transform'; source: 'scripted-probe'; frames: number;
  elapsedMs: number; frameIntervalsMs: number[]; p50: number; p95: number; p99: number;
  renderedFrames: number; heapUsed: number | null;
}
export type SpikeSnapshot = {
  status: string; error: string | null; fixture: FixtureName | null; selectedId: string | null;
  transform: Transform | null; historyDepth: number; mode: Mode; orbitEnabled: boolean; controlAxis: string | null;
  gesture: { active: boolean; commits: number; cancels: number; source: 'pointer' | null };
  visual: { visible: boolean; color: string; playing: boolean; clipCount: number; mixerTime: number; animationTime: number; snapshotFrozen: boolean; groupVisible: boolean | null; materialColor: string | null; mixerTimeScale: number | null; materialMapCount: number };
  renderer: Metrics; capability: Record<string, unknown>; screenPoints: Record<string, { x: number; y: number }>;
  telemetry: { loads: Record<string, unknown>[]; disposals: Record<string, unknown>[]; events: Record<string, unknown>[]; staleDiscards: number; renderedFrames: number; measurements: Sample[]; ownedObjectURLs: number };
}
export type AdapterBridge = {
  loadFixture(name: FixtureName): Promise<void>; unload(): void; select(id: string): void;
  setMode(mode: Mode): void; undo(): void; cancel(): void; forceContextLoss(): void;
  snapshot(): SpikeSnapshot; measure(options: { phase: Sample['phase']; frames?: number }): Promise<Sample>;
}
export type AdapterProps = {
  effective: Readonly<ComponentProps>;
  onBridge: (bridge: AdapterBridge | null) => void;
  onSnapshot: (snapshot: SpikeSnapshot) => void;
}

export function emptySnapshot(): SpikeSnapshot {
  return { status: 'shell', error: null, fixture: null, selectedId: null, transform: null,
    historyDepth: 0, mode: 'translate', orbitEnabled: true, controlAxis: null,
    gesture: { active: false, commits: 0, cancels: 0, source: null },
    visual: { visible: true, color: '#35c5b1', playing: false, clipCount: 0, mixerTime: 0, animationTime: 0, snapshotFrozen: true, groupVisible: null, materialColor: null, mixerTimeScale: null, materialMapCount: 0 },
    renderer: { geometries: 0, textures: 0, programs: 0, calls: 0, triangles: 0 },
    capability: {}, screenPoints: {},
    telemetry: { loads: [], disposals: [], events: [], staleDiscards: 0, renderedFrames: 0, measurements: [], ownedObjectURLs: 0 },
  }
}
