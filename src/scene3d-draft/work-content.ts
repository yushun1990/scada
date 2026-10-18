import { SCENE_VERSION } from '../scene/schema'
import type {
  ComponentSceneNode,
  GroupSceneNode,
  NodeTransform,
  SceneDocument,
} from '../scene/schema'
import {
  validateScene3DDraftDocument,
  type Scene3DDocumentV1,
} from './scene3d-schema'

/**
 * M10A draft of the discriminated Work envelope.
 *
 * Existing Scene v8 inputs migrate deterministically to `kind: 'scene-2d'`.
 * The migration itself, canonical persistence and Work Package v2 remain M10B
 * work; this draft only freezes the discrimination contract and keeps it
 * isolated from production persistence. Architecture authority:
 * `docs/architecture/3d-scene-editor.md` (Work envelope).
 */

export const WORK_CONTENT_KIND_SCENE_2D = 'scene-2d' as const
export const WORK_CONTENT_KIND_SCENE_3D = 'scene-3d' as const

export type WorkContentDraft =
  | {
      kind: typeof WORK_CONTENT_KIND_SCENE_2D
      document: SceneDocument
    }
  | {
      kind: typeof WORK_CONTENT_KIND_SCENE_3D
      document: Scene3DDocumentV1
    }

export type WorkContentDraftClassification =
  | { ok: true; content: WorkContentDraft }
  | { ok: false; issues: readonly string[] }

/**
 * Compile-time guards: adding optional 3D fields to the accepted Scene v8
 * document must break the build, not silently widen the 2D contract. Each
 * constant is `true` exactly while the named 3D field stays absent, and the
 * M10A check asserts the exported values so the guards cannot go stale.
 */
export const sceneV8TransformHasNoDepthAxis: 'z' extends keyof NodeTransform
  ? false
  : true = true
export const sceneV8ComponentNodeHasNoQuaternion: 'quaternion' extends
  keyof ComponentSceneNode
  ? false
  : true = true
export const sceneV8GroupNodeHasNoQuaternion: 'quaternion' extends
  keyof GroupSceneNode
  ? false
  : true = true
export const sceneV8DocumentHasNoRuntimeCamera: 'runtimeCamera' extends
  keyof SceneDocument
  ? false
  : true = true
export const sceneV8DocumentHasNoEnvironment: 'environment' extends
  keyof SceneDocument
  ? false
  : true = true
export const sceneV8DocumentHasNoUnits: 'units' extends keyof SceneDocument
  ? false
  : true = true

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Classify an untyped persisted work payload by its discriminated kind.
 *
 * The `scene-2d` branch only checks that the wrapped document claims the
 * current canonical Scene v8 version; full registry-scoped validation stays
 * with the production scene parser and is not duplicated here. The `scene-3d`
 * branch runs the Scene3D v1 draft validator.
 */
export function classifyWorkContentDraft(
  value: unknown,
): WorkContentDraftClassification {
  if (!isRecord(value)) {
    return { ok: false, issues: ['work content must be an object'] }
  }

  if (value.kind === WORK_CONTENT_KIND_SCENE_2D) {
    const document = value.document
    if (!isRecord(document) || document.version !== SCENE_VERSION) {
      return {
        ok: false,
        issues: [
          `scene-2d work content must wrap a Scene v${SCENE_VERSION} document`,
        ],
      }
    }
    return {
      ok: true,
      content: {
        kind: WORK_CONTENT_KIND_SCENE_2D,
        document: document as unknown as SceneDocument,
      },
    }
  }

  if (value.kind === WORK_CONTENT_KIND_SCENE_3D) {
    const result = validateScene3DDraftDocument(value.document)
    if (!result.ok) {
      return {
        ok: false,
        issues: result.issues.map((issue) => `scene-3d document: ${issue}`),
      }
    }
    return {
      ok: true,
      content: {
        kind: WORK_CONTENT_KIND_SCENE_3D,
        document: result.document,
      },
    }
  }

  return {
    ok: false,
    issues: [
      `work content kind must be "${WORK_CONTENT_KIND_SCENE_2D}" or "${WORK_CONTENT_KIND_SCENE_3D}"`,
    ],
  }
}
