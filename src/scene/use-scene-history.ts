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
  // 暂存编辑，不立即推入历史。第一次暂存会冻结事务前快照，后续
  // commit() 将整段连续编辑作为一条历史记录提交。
  setScene: (updater: SceneDocument | ((current: SceneDocument) => SceneDocument)) => void
  setSelectedNodeIds: (ids: string[]) => void
  setSelectedConnectionId: (id: string | null) => void
  // 提交一次变更并推入历史栈。应在「一个完整手势/操作」结束时调用一次。
  // 如果此前通过 setScene() 做过暂存编辑，则以第一次暂存前的快照为 before。
  commit: (
    nextScene?: SceneDocument | ((current: SceneDocument) => SceneDocument),
    nextSelection?: Partial<Pick<HistorySnapshot, 'selectedNodeIds' | 'selectedConnectionId'>>,
  ) => void
  // 放弃尚未提交的暂存编辑，恢复事务开始前快照。
  cancelPending: () => void
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

function trimHistory(history: HistorySnapshot[]) {
  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY)
  }
}

export function useSceneHistory(
  initial: HistorySnapshot | (() => HistorySnapshot),
): SceneHistory {
  const initialSnapshotRef = useRef<HistorySnapshot | null>(null)
  if (initialSnapshotRef.current === null) {
    initialSnapshotRef.current = resolveInitial(initial)
  }
  const initialSnapshot = initialSnapshotRef.current

  const [scene, setSceneState] = useState<SceneDocument>(initialSnapshot.scene)
  const [selectedNodeIds, setSelectedNodeIdsState] = useState<string[]>(
    initialSnapshot.selectedNodeIds,
  )
  const [selectedConnectionId, setSelectedConnectionIdState] = useState<string | null>(
    initialSnapshot.selectedConnectionId,
  )

  // 同步 ref 让同一个浏览器事件中的 setScene() → commit() 也能看到最新暂存值，
  // 不依赖 React 先完成一次重渲染。
  const sceneRef = useRef(scene)
  const selectedNodeIdsRef = useRef(selectedNodeIds)
  const selectedConnectionIdRef = useRef(selectedConnectionId)

  // past / future 用 ref 存放，避免渲染期间依赖、且避免把巨大数组放进 deps。
  const pastRef = useRef<HistorySnapshot[]>([])
  const futureRef = useRef<HistorySnapshot[]>([])
  // 第一次 setScene() 时冻结事务前快照；直到 commit/cancel/undo/reset 才清空。
  const pendingBeforeRef = useRef<HistorySnapshot | null>(null)
  // 版本号：每次推入/撤销/重做时自增，驱动 canUndo/canRedo 重算。
  const [tick, setTick] = useState(0)

  const bump = useCallback(() => setTick((value) => value + 1), [])

  const currentSnapshot = useCallback((): HistorySnapshot => ({
    scene: sceneRef.current,
    selectedNodeIds: selectedNodeIdsRef.current,
    selectedConnectionId: selectedConnectionIdRef.current,
  }), [])

  const applySnapshot = useCallback((snapshot: HistorySnapshot) => {
    sceneRef.current = snapshot.scene
    selectedNodeIdsRef.current = snapshot.selectedNodeIds
    selectedConnectionIdRef.current = snapshot.selectedConnectionId
    setSceneState(snapshot.scene)
    setSelectedNodeIdsState(snapshot.selectedNodeIds)
    setSelectedConnectionIdState(snapshot.selectedConnectionId)
  }, [])

  const setScene = useCallback(
    (updater: SceneDocument | ((current: SceneDocument) => SceneDocument)) => {
      if (pendingBeforeRef.current === null) {
        pendingBeforeRef.current = currentSnapshot()
      }

      const resolved = resolveScene(sceneRef.current, updater)
      sceneRef.current = resolved
      setSceneState(resolved)
    },
    [currentSnapshot],
  )

  const setSelectedNodeIds = useCallback((ids: string[]) => {
    selectedNodeIdsRef.current = ids
    setSelectedNodeIdsState(ids)
  }, [])

  const setSelectedConnectionId = useCallback((id: string | null) => {
    selectedConnectionIdRef.current = id
    setSelectedConnectionIdState(id)
  }, [])

  const commit = useCallback(
    (
      nextScene?: SceneDocument | ((current: SceneDocument) => SceneDocument),
      nextSelection?: Partial<Pick<HistorySnapshot, 'selectedNodeIds' | 'selectedConnectionId'>>,
    ) => {
      // 注意：历史栈的推入/弹出必须在 React state updater 之外完成。
      // StrictMode 可能重复调用 functional updater；这里通过同步 ref 先解析最终值。
      const before = pendingBeforeRef.current ?? currentSnapshot()
      const resolved = resolveScene(sceneRef.current, nextScene)
      const after: HistorySnapshot = {
        scene: resolved,
        selectedNodeIds:
          nextSelection?.selectedNodeIds ?? selectedNodeIdsRef.current,
        selectedConnectionId:
          nextSelection?.selectedConnectionId ?? selectedConnectionIdRef.current,
      }

      pendingBeforeRef.current = null

      // Scene 引用未变化时保持原有语义：纯 selection 变化不创建历史记录。
      if (after.scene === before.scene) {
        return
      }

      pastRef.current.push(before)
      trimHistory(pastRef.current)
      futureRef.current = []
      applySnapshot(after)
      bump()
    },
    [applySnapshot, bump, currentSnapshot],
  )

  const cancelPending = useCallback(() => {
    const before = pendingBeforeRef.current
    if (!before) {
      return
    }

    pendingBeforeRef.current = null
    applySnapshot(before)
  }, [applySnapshot])

  const undo = useCallback(() => {
    const pendingBefore = pendingBeforeRef.current

    // 如果仍有尚未 blur/commit 的表单事务，Undo 直接撤销这一整段暂存编辑，
    // 并把当前暂存结果放入 future，行为等价于它刚刚提交后立即撤销。
    if (pendingBefore && pendingBefore.scene !== sceneRef.current) {
      const after = currentSnapshot()
      pendingBeforeRef.current = null
      futureRef.current.push(after)
      trimHistory(futureRef.current)
      applySnapshot(pendingBefore)
      bump()
      return
    }

    pendingBeforeRef.current = null

    if (pastRef.current.length === 0) {
      return
    }

    const before = pastRef.current.pop()!
    futureRef.current.push(currentSnapshot())
    trimHistory(futureRef.current)
    applySnapshot(before)
    bump()
  }, [applySnapshot, bump, currentSnapshot])

  const redo = useCallback(() => {
    // Redo 只处理已提交/已撤销事务；存在暂存编辑时不跨过它。
    if (pendingBeforeRef.current !== null || futureRef.current.length === 0) {
      return
    }

    const after = futureRef.current.pop()!
    pastRef.current.push(currentSnapshot())
    trimHistory(pastRef.current)
    applySnapshot(after)
    bump()
  }, [applySnapshot, bump, currentSnapshot])

  const reset = useCallback((snapshot: HistorySnapshot) => {
    pendingBeforeRef.current = null
    pastRef.current = []
    futureRef.current = []
    applySnapshot(snapshot)
    setTick((value) => value + 1)
  }, [applySnapshot])

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
    cancelPending,
    undo,
    redo,
    canUndo: pastRef.current.length > 0 || Boolean(
      pendingBeforeRef.current && pendingBeforeRef.current.scene !== sceneRef.current,
    ),
    canRedo: pendingBeforeRef.current === null && futureRef.current.length > 0,
    reset,
  }
}
