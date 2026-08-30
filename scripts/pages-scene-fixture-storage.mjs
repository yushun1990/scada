function workIdFromHash(hash) {
  const segments = hash
    .replace(/^#\/?/, '')
    .split('/')
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment))
  return segments[0] === 'scada' ? segments[1] ?? null : null
}

async function readSceneRecord(page) {
  return page.evaluate(async () => {
    const segments = window.location.hash
      .replace(/^#\/?/, '')
      .split('/')
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment))
    const workId = segments[0] === 'scada' ? segments[1] ?? null : null

    if (!workId) {
      throw new Error(`SCADA work id missing from ${window.location.hash}`)
    }

    const database = await new Promise((resolve, reject) => {
      const request = window.indexedDB.open('scada-editor-lab', 2)
      request.addEventListener('success', () => resolve(request.result), { once: true })
      request.addEventListener(
        'error',
        () => reject(request.error ?? new Error('Failed to open IndexedDB fixture database')),
        { once: true },
      )
    })

    try {
      const record = await new Promise((resolve, reject) => {
        const transaction = database.transaction('scenes', 'readonly')
        const request = transaction.objectStore('scenes').get(workId)
        request.addEventListener('success', () => resolve(request.result ?? null), { once: true })
        request.addEventListener(
          'error',
          () => reject(request.error ?? new Error('Failed to read scene fixture record')),
          { once: true },
        )
      })

      if (!record || typeof record.document !== 'string') {
        return { workId, record: null }
      }

      return {
        workId,
        record: {
          id: record.id,
          document: record.document,
          updatedAt: record.updatedAt,
        },
      }
    } finally {
      database.close()
    }
  })
}

export async function readPersistedScene(page) {
  const { workId, record } = await readSceneRecord(page)
  if (!record) {
    throw new Error(`Persisted scene ${workId} missing`)
  }

  return {
    id: workId,
    document: JSON.parse(record.document),
    updatedAt: record.updatedAt,
  }
}

export async function writePersistedScene(page, document) {
  return page.evaluate(async (nextDocument) => {
    const segments = window.location.hash
      .replace(/^#\/?/, '')
      .split('/')
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment))
    const workId = segments[0] === 'scada' ? segments[1] ?? null : null

    if (!workId) {
      throw new Error(`SCADA work id missing from ${window.location.hash}`)
    }

    const database = await new Promise((resolve, reject) => {
      const request = window.indexedDB.open('scada-editor-lab', 2)
      request.addEventListener('success', () => resolve(request.result), { once: true })
      request.addEventListener(
        'error',
        () => reject(request.error ?? new Error('Failed to open IndexedDB fixture database')),
        { once: true },
      )
    })

    try {
      const existing = await new Promise((resolve, reject) => {
        const transaction = database.transaction('scenes', 'readonly')
        const request = transaction.objectStore('scenes').get(workId)
        request.addEventListener('success', () => resolve(request.result ?? null), { once: true })
        request.addEventListener(
          'error',
          () => reject(request.error ?? new Error('Failed to read scene fixture record')),
          { once: true },
        )
      })

      if (!existing || typeof existing.document !== 'string') {
        throw new Error(`Persisted scene ${workId} missing`)
      }

      const updatedAt = new Date().toISOString()
      await new Promise((resolve, reject) => {
        const transaction = database.transaction('scenes', 'readwrite')
        transaction.objectStore('scenes').put({
          ...existing,
          id: workId,
          document: JSON.stringify(nextDocument),
          updatedAt,
        })
        transaction.addEventListener('complete', () => resolve(), { once: true })
        transaction.addEventListener(
          'abort',
          () => reject(transaction.error ?? new Error('Failed to persist scene fixture')),
          { once: true },
        )
        transaction.addEventListener(
          'error',
          () => reject(transaction.error ?? new Error('Failed to persist scene fixture')),
          { once: true },
        )
      })

      return nextDocument
    } finally {
      database.close()
    }
  }, document)
}

export async function saveSceneAndWait(page) {
  const hash = await page.evaluate(() => window.location.hash)
  const workId = workIdFromHash(hash)
  if (!workId) {
    throw new Error(`SCADA work id missing from ${hash}`)
  }

  const before = await readSceneRecord(page)
  const previousUpdatedAt = before.record?.updatedAt ?? null

  await page.getByRole('button', { name: '保存', exact: true }).click()

  await page.waitForFunction(
    async ({ targetWorkId, previous }) => {
      const database = await new Promise((resolve, reject) => {
        const request = window.indexedDB.open('scada-editor-lab', 2)
        request.addEventListener('success', () => resolve(request.result), { once: true })
        request.addEventListener(
          'error',
          () => reject(request.error ?? new Error('Failed to open IndexedDB fixture database')),
          { once: true },
        )
      })

      try {
        const record = await new Promise((resolve, reject) => {
          const transaction = database.transaction('scenes', 'readonly')
          const request = transaction.objectStore('scenes').get(targetWorkId)
          request.addEventListener('success', () => resolve(request.result ?? null), { once: true })
          request.addEventListener(
            'error',
            () => reject(request.error ?? new Error('Failed to read saved scene fixture record')),
            { once: true },
          )
        })
        return Boolean(
          record &&
          typeof record.document === 'string' &&
          typeof record.updatedAt === 'string' &&
          record.updatedAt !== previous,
        )
      } finally {
        database.close()
      }
    },
    { targetWorkId: workId, previous: previousUpdatedAt },
  )
}
