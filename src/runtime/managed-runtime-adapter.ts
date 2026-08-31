import type { RuntimeDataSource } from './data-source'
import type {
  ScadaDeviceActionDispatcher,
  ScadaDeviceActionInvocation,
} from './device-action-dispatcher'
import type { RuntimeValue, RuntimeValueStore } from './runtime-value-store'

export type RuntimeAdapterState =
  | 'stopped'
  | 'connecting'
  | 'connected'
  | 'retrying'
  | 'failed'

export type RuntimeAdapterStatus = Readonly<{
  state: RuntimeAdapterState
  connectionAttempt: number
  consecutiveFailures: number
  lastError: string | null
}>

export type RuntimeAdapterIssueKind =
  | 'connect-error'
  | 'connection-lost'
  | 'dispatch-rejected'
  | 'dispatch-error'
  | 'close-error'
  | 'retry-error'

export type RuntimeAdapterIssue = Readonly<{
  kind: RuntimeAdapterIssueKind
  message: string
  invocation?: ScadaDeviceActionInvocation
}>

export type RuntimeAdapterStatusListener = (status: RuntimeAdapterStatus) => void
export type RuntimeAdapterIssueListener = (issue: RuntimeAdapterIssue) => void

export type RuntimeAdapterValueBatch = Readonly<Record<string, RuntimeValue>>

export type RuntimeAdapterTransportContext = Readonly<{
  signal: AbortSignal
  publish(values: RuntimeAdapterValueBatch): void
}>

/**
 * One live protocol connection owned by a RuntimeAdapterTransport.
 *
 * `closed` settles when the connection is no longer usable. Resolution means an
 * unclassified disconnect; rejection may expose a transport-specific failure.
 * The managed adapter never replays outbound invocations after either outcome.
 */
export interface RuntimeAdapterConnection {
  readonly closed: Promise<void>
  dispatch(invocation: ScadaDeviceActionInvocation): void | Promise<void>
  close(): void | Promise<void>
}

/**
 * Protocol-specific code implements this narrow factory. It may represent MQTT,
 * WebSocket, HTTP streaming, a platform SDK, or another transport, but those
 * details must not leak into SCADA component contracts or runtime semantics.
 *
 * `connect()` must observe the provided AbortSignal so a stopped RuntimeDataSource
 * does not retain live connection work indefinitely.
 */
export interface RuntimeAdapterTransport {
  connect(context: RuntimeAdapterTransportContext): Promise<RuntimeAdapterConnection>
}

/** Return a retry delay in milliseconds, or null to enter terminal `failed`. */
export type RuntimeAdapterRetryPolicy = (
  consecutiveFailures: number,
  error: unknown,
) => number | null

export type RuntimeAdapterDelay = (
  delayMs: number,
  signal: AbortSignal,
) => Promise<void>

export type ManagedRuntimeAdapterOptions = Readonly<{
  id: string
  transport: RuntimeAdapterTransport
  retryPolicy: RuntimeAdapterRetryPolicy
  delay?: RuntimeAdapterDelay
}>

type ConnectionClosedOutcome =
  | Readonly<{ kind: 'aborted' }>
  | Readonly<{ kind: 'closed'; error?: unknown }>

function describeError(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return error
  }

  return 'Unknown runtime adapter error'
}

function createStatus(
  state: RuntimeAdapterState,
  connectionAttempt: number,
  consecutiveFailures: number,
  lastError: string | null,
): RuntimeAdapterStatus {
  return Object.freeze({
    state,
    connectionAttempt,
    consecutiveFailures,
    lastError,
  })
}

function createIssue(
  kind: RuntimeAdapterIssueKind,
  message: string,
  invocation?: ScadaDeviceActionInvocation,
): RuntimeAdapterIssue {
  return Object.freeze({
    kind,
    message,
    ...(invocation ? { invocation } : {}),
  })
}

export function runtimeAdapterDelay(
  delayMs: number,
  signal: AbortSignal,
): Promise<void> {
  if (!Number.isFinite(delayMs) || delayMs < 0) {
    return Promise.reject(new Error('Runtime adapter retry delay must be finite and non-negative'))
  }

  if (signal.aborted || delayMs === 0) {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', onAbort)
      globalThis.clearTimeout(timer)
      resolve()
    }
    const onAbort = () => finish()
    const timer = globalThis.setTimeout(finish, delayMs)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Protocol-neutral lifecycle owner that adapts one transport into the already
 * accepted inbound RuntimeDataSource and outbound ScadaDeviceActionDispatcher
 * host boundaries.
 *
 * Safety rules:
 * - inbound batches publish atomically through RuntimeValueStore.setMany()
 * - stale connection attempts cannot publish after retry/stop
 * - outbound invocations are accepted only while connected
 * - rejected/failed outbound invocations are never queued or replayed
 * - reconnect policy is host-owned and deterministic/testable
 */
export class ManagedRuntimeAdapter {
  readonly id: string
  readonly dataSource: RuntimeDataSource
  readonly actionDispatcher: ScadaDeviceActionDispatcher

  private readonly transport: RuntimeAdapterTransport
  private readonly retryPolicy: RuntimeAdapterRetryPolicy
  private readonly delay: RuntimeAdapterDelay
  private readonly statusListeners = new Set<RuntimeAdapterStatusListener>()
  private readonly issueListeners = new Set<RuntimeAdapterIssueListener>()

  private status = createStatus('stopped', 0, 0, null)
  private values: RuntimeValueStore | null = null
  private runController: AbortController | null = null
  private currentRunId: number | null = null
  private nextRunId = 0
  private publishAttempt = 0
  private activeConnection: RuntimeAdapterConnection | null = null

  constructor(options: ManagedRuntimeAdapterOptions) {
    if (options.id.trim().length === 0) {
      throw new Error('Runtime adapter id must not be empty')
    }

    this.id = options.id
    this.transport = options.transport
    this.retryPolicy = options.retryPolicy
    this.delay = options.delay ?? runtimeAdapterDelay
    this.dataSource = Object.freeze({
      id: options.id,
      start: (values: RuntimeValueStore) => this.start(values),
    })
    this.actionDispatcher = Object.freeze({
      dispatch: (invocation: ScadaDeviceActionInvocation) => {
        this.dispatch(invocation)
      },
    })
  }

  getStatus() {
    return this.status
  }

  subscribeStatus(listener: RuntimeAdapterStatusListener) {
    this.statusListeners.add(listener)
    return () => {
      this.statusListeners.delete(listener)
    }
  }

  subscribeIssues(listener: RuntimeAdapterIssueListener) {
    this.issueListeners.add(listener)
    return () => {
      this.issueListeners.delete(listener)
    }
  }

  private start(values: RuntimeValueStore) {
    if (this.runController) {
      throw new Error(`Runtime adapter ${this.id} is already started`)
    }

    const runId = ++this.nextRunId
    const controller = new AbortController()
    this.currentRunId = runId
    this.runController = controller
    this.values = values
    this.publishAttempt = 0
    this.activeConnection = null
    this.setStatus(createStatus('connecting', 0, 0, null))
    void this.run(runId, controller.signal)

    let stopped = false
    return () => {
      if (stopped) return
      stopped = true
      this.stop(runId)
    }
  }

  private stop(runId: number) {
    if (this.currentRunId !== runId) {
      return
    }

    const connection = this.activeConnection
    this.activeConnection = null
    this.publishAttempt = 0
    this.values = null
    this.currentRunId = null
    this.runController?.abort()
    this.runController = null

    if (connection) {
      this.closeConnection(connection)
    }

    this.setStatus(createStatus('stopped', this.status.connectionAttempt, 0, null))
  }

  private async run(runId: number, signal: AbortSignal) {
    let connectionAttempt = 0
    let consecutiveFailures = 0
    let lastError: string | null = null

    while (this.isActive(runId, signal)) {
      connectionAttempt += 1
      const attempt = connectionAttempt
      this.publishAttempt = attempt
      this.setStatus(
        createStatus('connecting', attempt, consecutiveFailures, lastError),
      )

      let connection: RuntimeAdapterConnection
      try {
        connection = await this.transport.connect({
          signal,
          publish: (batch) => {
            if (
              this.isActive(runId, signal)
              && this.publishAttempt === attempt
            ) {
              this.values?.setMany(batch)
            }
          },
        })
      } catch (error) {
        if (!this.isActive(runId, signal)) {
          return
        }

        this.publishAttempt = 0
        consecutiveFailures += 1
        lastError = describeError(error)
        this.emitIssue(
          createIssue(
            'connect-error',
            `Runtime adapter ${this.id} connection attempt ${attempt} failed: ${lastError}`,
          ),
        )

        const shouldRetry = await this.waitForRetry(
          runId,
          signal,
          connectionAttempt,
          consecutiveFailures,
          error,
        )
        if (!shouldRetry) return
        continue
      }

      if (!this.isActive(runId, signal)) {
        this.publishAttempt = 0
        this.closeConnection(connection)
        return
      }

      this.activeConnection = connection
      consecutiveFailures = 0
      lastError = null
      this.setStatus(createStatus('connected', attempt, 0, null))

      const outcome = await this.waitForConnectionClosed(connection, signal)
      if (this.activeConnection === connection) {
        this.activeConnection = null
      }
      if (this.publishAttempt === attempt) {
        this.publishAttempt = 0
      }

      if (outcome.kind === 'aborted' || !this.isActive(runId, signal)) {
        return
      }

      const error = outcome.error ?? new Error('Runtime adapter connection closed')
      consecutiveFailures = 1
      lastError = describeError(error)
      this.emitIssue(
        createIssue(
          'connection-lost',
          `Runtime adapter ${this.id} connection lost: ${lastError}`,
        ),
      )

      const shouldRetry = await this.waitForRetry(
        runId,
        signal,
        connectionAttempt,
        consecutiveFailures,
        error,
      )
      if (!shouldRetry) return
    }
  }

  private async waitForRetry(
    runId: number,
    signal: AbortSignal,
    connectionAttempt: number,
    consecutiveFailures: number,
    error: unknown,
  ) {
    let delayMs: number | null

    try {
      delayMs = this.retryPolicy(consecutiveFailures, error)
    } catch (retryError) {
      this.failRetryPolicy(connectionAttempt, consecutiveFailures, retryError)
      return false
    }

    if (delayMs === null) {
      this.setStatus(
        createStatus(
          'failed',
          connectionAttempt,
          consecutiveFailures,
          describeError(error),
        ),
      )
      return false
    }

    if (!Number.isFinite(delayMs) || delayMs < 0) {
      this.failRetryPolicy(
        connectionAttempt,
        consecutiveFailures,
        new Error('Runtime adapter retry policy returned an invalid delay'),
      )
      return false
    }

    this.setStatus(
      createStatus(
        'retrying',
        connectionAttempt,
        consecutiveFailures,
        describeError(error),
      ),
    )

    try {
      await this.delay(delayMs, signal)
    } catch (retryError) {
      if (!this.isActive(runId, signal)) {
        return false
      }
      this.failRetryPolicy(connectionAttempt, consecutiveFailures, retryError)
      return false
    }

    return this.isActive(runId, signal)
  }

  private failRetryPolicy(
    connectionAttempt: number,
    consecutiveFailures: number,
    error: unknown,
  ) {
    const message = describeError(error)
    this.emitIssue(
      createIssue(
        'retry-error',
        `Runtime adapter ${this.id} retry lifecycle failed: ${message}`,
      ),
    )
    this.setStatus(
      createStatus('failed', connectionAttempt, consecutiveFailures, message),
    )
  }

  private dispatch(invocation: ScadaDeviceActionInvocation) {
    const connection = this.activeConnection
    if (!connection || this.status.state !== 'connected') {
      this.emitIssue(
        createIssue(
          'dispatch-rejected',
          `Runtime adapter ${this.id} rejected ${invocation.action}: adapter is ${this.status.state}`,
          invocation,
        ),
      )
      return
    }

    try {
      const result = connection.dispatch(invocation)
      void Promise.resolve(result).catch((error) => {
        this.emitIssue(
          createIssue(
            'dispatch-error',
            `Runtime adapter ${this.id} failed to dispatch ${invocation.action}: ${describeError(error)}`,
            invocation,
          ),
        )
      })
    } catch (error) {
      this.emitIssue(
        createIssue(
          'dispatch-error',
          `Runtime adapter ${this.id} failed to dispatch ${invocation.action}: ${describeError(error)}`,
          invocation,
        ),
      )
    }
  }

  private closeConnection(connection: RuntimeAdapterConnection) {
    try {
      const result = connection.close()
      void Promise.resolve(result).catch((error) => {
        this.emitIssue(
          createIssue(
            'close-error',
            `Runtime adapter ${this.id} connection close failed: ${describeError(error)}`,
          ),
        )
      })
    } catch (error) {
      this.emitIssue(
        createIssue(
          'close-error',
          `Runtime adapter ${this.id} connection close failed: ${describeError(error)}`,
        ),
      )
    }
  }

  private waitForConnectionClosed(
    connection: RuntimeAdapterConnection,
    signal: AbortSignal,
  ): Promise<ConnectionClosedOutcome> {
    if (signal.aborted) {
      return Promise.resolve({ kind: 'aborted' })
    }

    return new Promise((resolve) => {
      let settled = false
      const finish = (outcome: ConnectionClosedOutcome) => {
        if (settled) return
        settled = true
        signal.removeEventListener('abort', onAbort)
        resolve(outcome)
      }
      const onAbort = () => finish({ kind: 'aborted' })
      signal.addEventListener('abort', onAbort, { once: true })
      connection.closed.then(
        () => finish({ kind: 'closed' }),
        (error) => finish({ kind: 'closed', error }),
      )
    })
  }

  private isActive(runId: number, signal: AbortSignal) {
    return this.currentRunId === runId && !signal.aborted
  }

  private setStatus(status: RuntimeAdapterStatus) {
    if (
      this.status.state === status.state
      && this.status.connectionAttempt === status.connectionAttempt
      && this.status.consecutiveFailures === status.consecutiveFailures
      && this.status.lastError === status.lastError
    ) {
      return
    }

    this.status = status
    for (const listener of [...this.statusListeners]) {
      listener(status)
    }
  }

  private emitIssue(issue: RuntimeAdapterIssue) {
    for (const listener of [...this.issueListeners]) {
      listener(issue)
    }
  }
}
