import { builtInComponentRegistry } from '../../component-system/builtins'
import type { ComponentDefinition } from '../../component-system/definition'
import {
  isGroupNode,
  type ComponentSceneNode,
  type SceneDocument,
} from '../../scene/model'

export type BehaviorActionTarget = {
  nodeId: string
  action: string
}

type ComponentInteractionsInspectorProps = {
  tab: 'actions' | 'events'
  scene: SceneDocument
  node: ComponentSceneNode
  definition: ComponentDefinition
  previewActive: boolean
  onInvokeAction: (actionName: string) => void
  onBehaviorChange: (
    eventName: string,
    target: BehaviorActionTarget | null,
  ) => void
}

function encodeActionTarget(target: BehaviorActionTarget) {
  return JSON.stringify([target.nodeId, target.action])
}

function decodeActionTarget(value: string): BehaviorActionTarget | null {
  if (!value) {
    return null
  }

  try {
    const parsed: unknown = JSON.parse(value)

    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === 'string' &&
      typeof parsed[1] === 'string'
    ) {
      return {
        nodeId: parsed[0],
        action: parsed[1],
      }
    }
  } catch {
    return null
  }

  return null
}

function getActionTargets(scene: SceneDocument) {
  return scene.nodes.flatMap((candidate) => {
    if (isGroupNode(candidate)) {
      return []
    }

    const registration = builtInComponentRegistry.get(candidate.type)

    if (!registration) {
      return []
    }

    return Object.entries(registration.definition.actions).flatMap(
      ([actionName, action]) =>
        registration.actions?.[actionName]
          ? [{
              nodeId: candidate.id,
              nodeName: candidate.name,
              action: actionName,
              actionTitle: action.title,
            }]
          : [],
    )
  })
}

export function ComponentInteractionsInspector({
  tab,
  scene,
  node,
  definition,
  previewActive,
  onInvokeAction,
  onBehaviorChange,
}: ComponentInteractionsInspectorProps) {
  if (tab === 'actions') {
    const registration = builtInComponentRegistry.get(node.type)
    const actions = Object.entries(definition.actions)

    if (actions.length === 0) {
      return (
        <div className="inspector-placeholder">
          <strong>无公开方法</strong>
          <span>该组件没有向组态场景暴露 Action。</span>
        </div>
      )
    }

    return (
      <div className="property-section-list">
        <fieldset className="inspector-group">
          <legend>组件方法</legend>
          {actions.map(([actionName, action]) => {
            const executable = Boolean(registration?.actions?.[actionName])

            return (
              <div key={actionName} className="property-field">
                <span>{action.title}</span>
                <button
                  type="button"
                  disabled={!previewActive || !executable}
                  onClick={() => onInvokeAction(actionName)}
                >
                  {executable ? '执行' : '未实现'}
                </button>
                {action.description && <small>{action.description}</small>}
              </div>
            )
          })}
          {!previewActive && (
            <small>进入预览后可执行当前 Runtime 已实现的公开方法。</small>
          )}
        </fieldset>
      </div>
    )
  }

  const events = Object.entries(definition.events)

  if (events.length === 0) {
    return (
      <div className="inspector-placeholder">
        <strong>无公开事件</strong>
        <span>该组件没有向组态场景暴露 Event。</span>
      </div>
    )
  }

  const actionTargets = getActionTargets(scene)

  return (
    <div className="property-section-list">
      <fieldset className="inspector-group">
        <legend>事件行为</legend>
        {events.map(([eventName, event]) => {
          const behavior = node.behaviors.find(
            (candidate) => candidate.trigger.event === eventName,
          )
          const selectedTarget = behavior
            ? encodeActionTarget({
                nodeId: behavior.effect.targetNodeId,
                action: behavior.effect.action,
              })
            : ''
          const knownTarget = behavior
            ? actionTargets.some(
                (target) =>
                  target.nodeId === behavior.effect.targetNodeId &&
                  target.action === behavior.effect.action,
              )
            : true

          return (
            <label key={eventName} className="property-field">
              <span>{event.title}</span>
              <select
                value={selectedTarget}
                disabled={previewActive}
                onChange={(changeEvent) =>
                  onBehaviorChange(
                    eventName,
                    decodeActionTarget(changeEvent.target.value),
                  )
                }
              >
                <option value="">不触发方法</option>
                {behavior && !knownTarget && (
                  <option value={selectedTarget}>
                    {behavior.effect.targetNodeId} · {behavior.effect.action}
                  </option>
                )}
                {actionTargets.map((target) => (
                  <option
                    key={`${target.nodeId}:${target.action}`}
                    value={encodeActionTarget(target)}
                  >
                    {target.nodeName} · {target.actionTitle}
                  </option>
                ))}
              </select>
              {event.description && <small>{event.description}</small>}
            </label>
          )
        })}
        {previewActive && <small>返回设计模式后可修改事件行为。</small>}
      </fieldset>
    </div>
  )
}
