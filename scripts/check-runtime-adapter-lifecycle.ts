import assert from 'node:assert/strict'
import { createScadaDeviceActionInvocation } from '../src/runtime/device-action-dispatcher'
import {
  ManagedRuntimeAdapter,
  type RuntimeAdapterConnection,
  type RuntimeAdapterDelay,
  type RuntimeAdapterIssue,
  type RuntimeAdapterStatus,
  type RuntimeAdapterTransport,
  type RuntimeAdapterTransportContext,
} from '../src/runtime/managed-runtime-adapter'
import { RuntimeValueStore } from '../src/runtime/runtime-value-store'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (error?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function flushMicrotasks() {
  for (let index = 0; index < 6; index += 1) {
    await Promise.resolve()
  }
}

function createFakeConnection(options: { dispatchError?: Error } = {}) {
  const closed = deferred<void>()
  const state = {
    closeCount: 0,
    invocations: [] as ReturnType<typeof createScadaDeviceActionInvocation>[],
  }
  const api: RuntimeAdapterConnection = {
    closed: closed.promise,
    dispatch(invocation) {
      state.invocations.push(invocation)
      if (options.dispatchError) {
        return Promise.reject(options.dispatchError)
      }
    },
    close() {
      state.closeCount += 1
    },
  }

  return { api, closed, state }
}

function createControlledTransport() {
  const requests: Array<{
    context: RuntimeAdapterTransportContext
    connection: ReturnType<typeof deferred<RuntimeAdapterConnection>>
  }> = []
  const transport: RuntimeAdapterTransport = {
    connect(context) {
      const connection = deferred<RuntimeAdapterConnection>()
      requests.push({ context, connection })
      return connection.promise
    },
  }

  return { transport, requests }
}

function createControlledDelay() {
  const calls: Array<{
    delayMs: number
    signal: AbortSignal
    release(): void
  }> = []
  const delay: RuntimeAdapterDelay = (delayMs, signal) => new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', finish)
      resolve()
    }
    signal.addEventListener('abort', finish, { once: true })
    calls.push({ delayMs, signal, release: finish })
  })

  return { delay, calls }
}

const controlled = createControlledTransport()
const controlledDelay = createControlledDelay()
const adapter = new ManagedRuntimeAdapter({
  id: 'production-fixture',
  transport: controlled.transport,
  retryPolicy: (consecutiveFailures) => consecutiveFailures <= 2 ? 25 : null,
  delay: controlledDelay.delay,
})
const statuses: RuntimeAdapterStatus[] = []
const issues: RuntimeAdapterIssue[] = []
adapter.subscribeStatus((status) => statuses.push(status))
adapter.subscribeIssues((issue) => issues.push(issue))

const values = new RuntimeValueStore()
let valuePublications = 0
values.subscribe(() => {
  valuePublications += 1
})

const stop = adapter.dataSource.start(values)
assert.equal(adapter.getStatus().state, 'connecting')
assert.equal(adapter.getStatus().connectionAttempt, 1)
assert.equal(controlled.requests.length, 1)

const first = createFakeConnection()
controlled.requests[0]!.connection.resolve(first.api)
await flushMicrotasks()
assert.equal(adapter.getStatus().state, 'connected')
assert.equal(adapter.getStatus().connectionAttempt, 1)
assert.equal(adapter.getStatus().consecutiveFailures, 0)

controlled.requests[0]!.context.publish({
  'device.fixture.temperature': 21.5,
  'device.fixture.running': true,
})
assert.deepEqual(values.getSnapshot(), {
  'device.fixture.temperature': 21.5,
  'device.fixture.running': true,
})
assert.equal(valuePublications, 1, 'one inbound batch is one RuntimeValueStore publication')

const invocation = createScadaDeviceActionInvocation(
  'interaction-start',
  'device.fixture',
  'start',
  [true],
)
adapter.actionDispatcher.dispatch(invocation)
await flushMicrotasks()
assert.deepEqual(first.state.invocations, [invocation])

first.closed.reject(new Error('fixture link lost'))
await flushMicrotasks()
assert.equal(adapter.getStatus().state, 'retrying')
assert.equal(adapter.getStatus().consecutiveFailures, 1)
assert.equal(adapter.getStatus().lastError, 'fixture link lost')
assert.equal(controlledDelay.calls.length, 1)
assert.equal(controlledDelay.calls[0]!.delayMs, 25)
assert.equal(issues.at(-1)?.kind, 'connection-lost')

controlled.requests[0]!.context.publish({ 'device.fixture.temperature': 99 })
assert.equal(
  values.get('device.fixture.temperature'),
  21.5,
  'a stale connection cannot publish after disconnect',
)

adapter.actionDispatcher.dispatch(invocation)
assert.equal(first.state.invocations.length, 1, 'outbound effects are not queued during retry')
assert.equal(issues.at(-1)?.kind, 'dispatch-rejected')

controlledDelay.calls[0]!.release()
await flushMicrotasks()
assert.equal(controlled.requests.length, 2)
assert.equal(adapter.getStatus().state, 'connecting')
assert.equal(adapter.getStatus().connectionAttempt, 2)

const second = createFakeConnection({ dispatchError: new Error('fixture send failed') })
controlled.requests[1]!.connection.resolve(second.api)
await flushMicrotasks()
assert.equal(adapter.getStatus().state, 'connected')
assert.equal(adapter.getStatus().lastError, null)

controlled.requests[1]!.context.publish({ 'device.fixture.temperature': 22 })
assert.equal(values.get('device.fixture.temperature'), 22)

adapter.actionDispatcher.dispatch(invocation)
await flushMicrotasks()
assert.equal(second.state.invocations.length, 1)
assert.equal(issues.at(-1)?.kind, 'dispatch-error')
assert.match(issues.at(-1)?.message ?? '', /fixture send failed/)

stop()
assert.equal(adapter.getStatus().state, 'stopped')
assert.equal(second.state.closeCount, 1, 'stop closes the current live connection exactly once')
assert.equal(controlled.requests[1]!.context.signal.aborted, true)
controlled.requests[1]!.context.publish({ 'device.fixture.temperature': 100 })
assert.equal(values.get('device.fixture.temperature'), 22, 'stopped adapter ignores stale publishes')
stop()
assert.equal(second.state.closeCount, 1, 'RuntimeDataSource stop is idempotent')

const exhausted = createControlledTransport()
const exhaustedDelay = createControlledDelay()
const exhaustedAdapter = new ManagedRuntimeAdapter({
  id: 'retry-exhaustion-fixture',
  transport: exhausted.transport,
  retryPolicy: (consecutiveFailures) => consecutiveFailures < 2 ? 5 : null,
  delay: exhaustedDelay.delay,
})
const exhaustedIssues: RuntimeAdapterIssue[] = []
exhaustedAdapter.subscribeIssues((issue) => exhaustedIssues.push(issue))
const exhaustedStop = exhaustedAdapter.dataSource.start(new RuntimeValueStore())

exhausted.requests[0]!.connection.reject(new Error('first connect failed'))
await flushMicrotasks()
assert.equal(exhaustedAdapter.getStatus().state, 'retrying')
assert.equal(exhaustedDelay.calls.length, 1)
exhaustedDelay.calls[0]!.release()
await flushMicrotasks()
assert.equal(exhausted.requests.length, 2)

exhausted.requests[1]!.connection.reject(new Error('second connect failed'))
await flushMicrotasks()
assert.equal(exhaustedAdapter.getStatus().state, 'failed')
assert.equal(exhaustedAdapter.getStatus().connectionAttempt, 2)
assert.equal(exhaustedAdapter.getStatus().consecutiveFailures, 2)
assert.equal(exhaustedAdapter.getStatus().lastError, 'second connect failed')
assert.equal(exhausted.requests.length, 2, 'terminal retry policy does not create another connection')
assert.equal(
  exhaustedIssues.filter((issue) => issue.kind === 'connect-error').length,
  2,
)

exhaustedAdapter.actionDispatcher.dispatch(invocation)
assert.equal(exhaustedIssues.at(-1)?.kind, 'dispatch-rejected')
exhaustedStop()
assert.equal(exhaustedAdapter.getStatus().state, 'stopped')

assert.throws(
  () => new ManagedRuntimeAdapter({
    id: '   ',
    transport: exhausted.transport,
    retryPolicy: () => null,
  }),
  /id must not be empty/,
)

assert.ok(
  statuses.some((status) => status.state === 'retrying'),
  'status subscribers observe reconnect lifecycle',
)

console.log(
  'Runtime adapter lifecycle checks passed: inbound batches are atomic, stale sessions are fenced, reconnect is policy-driven, outbound commands are never replayed, async dispatch failures are observable, stop is idempotent, and retry exhaustion fails closed.',
)
