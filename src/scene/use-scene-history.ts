import { useCallback, useRef, useState } from 'react'
import type { SceneDocument } from './model'

// 一次完整的应用状态快照：场景 + 选中节点 + 选中连线。
// 之所以把三者一起快照，是因为几乎所有变更都同时改场景和选中，
// 撤销时若只回滚场景，选中会指向已不存在的 id。
export type HistorySnapshot = {
  scene: SceneDocument
  selectedNodeIds: string[]
  selectedConnectionId: string | null
}

export type SceneHistory = {
  scene: SceneDocument
  selectedNodeIds: string[]
  selectedConnectionId: string | null
  // 直接写入，不推入历史。用于实时预览（拖拽过程、文本逐字符输入）。
  setScene: (updater: SceneDocument | ((current: SceneDocument) => SceneDocument)) => void
  setSelectedNodeIds: (ids: string[]) => void
  setSelectedConnectionId: (id: string | null) => void
  // 提交一次变更并推入历史栈。应在「一个完整手势/操作」结束时调用一次。
  commit: (
    nextScene?: SceneDocument | ((current: SceneDocument) => SceneDocument),
    nextSelection?: Partial<Pick<HistorySnapshot, 'selectedNodeIds' | 'selectedConnectionId'>>,
  ) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  // 用全新快照重置，并清空历史。用于导入/恢复文档。
  reset: (snapshot: HistorySnapshot) => void
}

// 历史栈上限，防止长会话内存膨胀。
const MAX_HISTORY = 50

function resolveScene(
  current: SceneDocument,
  next?: SceneDocument | ((current: SceneDocument) => SceneDocument),
): SceneDocument {
  if (typeof next === 'function') {
    return next(current)
  }
  return next ?? current
}

function resolveInitial(
  initial: HistorySnapshot | (() => HistorySnapshot),
): HistorySnapshot {
  return typeof initial === 'function' ? initial() : initial
}

export function useSceneHistory(
  initial: HistorySnapshot | (() => HistorySnapshot),
): SceneHistory {
  const [scene, setSceneState] = useState<SceneDocument>(
    () => resolveInitial(initial).scene,
  )
  const [selectedNodeIds, setSelectedNodeIdsState] = useState<string[]>(
    () => resolveInitial(initial).selectedNodeIds,
  )
  const [selectedConnectionId, setSelectedConnectionIdState] = useState<string | null>(
    () => resolveInitial(initial).selectedConnectionId,
  )

  // past / future 用 ref 存放，避免渲染期间依赖、且避免把巨大数组放进 deps。
  const pastRef = useRef<HistorySnapshot[]>([])
  const futureRef = useRef<HistorySnapshot[]>([])
  // 版本号：每次推入/撤销/重做时自增，驱动 canUndo/canRedo 重算。
  const [tick, setTick] = useState(0)

  const bump = useCallback(() => setTick((value) => value + 1), [])

  const setScene = useCallback(
    (updater: SceneDocument | ((current: SceneDocument) => SceneDocument)) => {
      setSceneState(updater)
    },
    [],
  )

  const setSelectedNodeIds = useCallback((ids: string[]) => {
    setSelectedNodeIdsState(ids)
  }, [])

  const setSelectedConnectionId = useCallback((id: string | null) => {
    setSelectedConnectionIdState(id)
  }, [])

  const commit = useCallback(
    (
      nextScene?: SceneDocument | ((current: SceneDocument) => SceneDocument),
      nextSelection?: Partial<Pick<HistorySnapshot, 'selectedNodeIds' | 'selectedConnectionId'>>,
    ) => {
      // 注意：历史栈的推入/弹出必须在 setSceneState 之外完成。
      // React 的 functional updater 在 StrictMode 下会被调用两次，
      // 若在其中修改 ref，会导致历史栈被重复推入。
      const before: HistorySnapshot = {
        scene,
        selectedNodeIds,
        selectedConnectionId,
      }
      const resolved = resolveScene(scene, nextScene)
      // 同值不推历史（纯函数 helper 可能返回同一引用）。
      if (resolved === scene) {
        return
      }
      pastRef.current.push(before)
      if (pastRef.current.length > MAX_HISTORY) {
        pastRef.current.shift()
      }
      futureRef.current = []
      setSceneState(resolved)
      if (nextSelection?.selectedNodeIds !== undefined) {
        setSelectedNodeIdsState(nextSelection.selectedNodeIds)
      }
      if (nextSelection?.selectedConnectionId !== undefined) {
        setSelectedConnectionIdState(nextSelection.selectedConnectionId)
      }
      bump()
    },
    [scene, selectedNodeIds, selectedConnectionId, bump],
  )

  const undo = useCallback(() => {
    if (pastRef.current.length === 0) {
      return
    }
    const before = pastRef.current.pop()!
    futureRef.current.push({
      scene,
      selectedNodeIds,
      selectedConnectionId,
    })
    setSceneState(before.scene)
    setSelectedNodeIdsState(before.selectedNodeIds)
    setSelectedConnectionIdState(before.selectedConnectionId)
    bump()
  }, [scene, selectedNodeIds, selectedConnectionId, bump])

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) {
      return
    }
    const after = futureRef.current.pop()!
    pastRef.current.push({
      scene,
      selectedNodeIds,
      selectedConnectionId,
    })
    setSceneState(after.scene)
    setSelectedNodeIdsState(after.selectedNodeIds)
    setSelectedConnectionIdState(after.selectedConnectionId)
    bump()
  }, [scene, selectedNodeIds, selectedConnectionId, bump])

  const reset = useCallback((snapshot: HistorySnapshot) => {
    pastRef.current = []
    futureRef.current = []
    setSceneState(snapshot.scene)
    setSelectedNodeIdsState(snapshot.selectedNodeIds)
    setSelectedConnectionIdState(snapshot.selectedConnectionId)
    setTick((value) => value + 1)
  }, [])

  // tick 仅用于让 canUndo/canRedo 在历史变化后重算（ref 不触发重渲染）。
  void tick

  return {
    scene,
    selectedNodeIds,
    selectedConnectionId,
    setScene,
    setSelectedNodeIds,
    setSelectedConnectionId,
    commit,
    undo,
    redo,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    reset,
  }
}
