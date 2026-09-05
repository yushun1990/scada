export async function readPersistedComponent(page) {
  return page.evaluate(async () => {
    const componentId = decodeURIComponent(
      window.location.hash.replace(/^#\/components\//, '').split('/')[0],
    )
    if (!componentId || componentId === 'new') {
      throw new Error(`Persisted component id missing from ${window.location.hash}`)
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
        const transaction = database.transaction('components', 'readonly')
        const request = transaction.objectStore('components').get(componentId)
        request.addEventListener('success', () => resolve(request.result ?? null), { once: true })
        request.addEventListener(
          'error',
          () => reject(request.error ?? new Error('Failed to read component fixture record')),
          { once: true },
        )
      })

      if (!record || typeof record.document !== 'string') {
        throw new Error(`Persisted component ${componentId} missing`)
      }

      return {
        id: componentId,
        document: JSON.parse(record.document),
      }
    } finally {
      database.close()
    }
  })
}

export async function writePersistedComponent(page, document) {
  return page.evaluate(async (nextDocument) => {
    const componentId = decodeURIComponent(
      window.location.hash.replace(/^#\/components\//, '').split('/')[0],
    )
    if (!componentId || componentId === 'new') {
      throw new Error(`Persisted component id missing from ${window.location.hash}`)
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
        const transaction = database.transaction('components', 'readonly')
        const request = transaction.objectStore('components').get(componentId)
        request.addEventListener('success', () => resolve(request.result ?? null), { once: true })
        request.addEventListener(
          'error',
          () => reject(request.error ?? new Error('Failed to read component fixture record')),
          { once: true },
        )
      })

      if (!record || typeof record.document !== 'string') {
        throw new Error(`Persisted component ${componentId} missing`)
      }

      const updatedAt = new Date().toISOString()
      const persistedDocument = {
        ...nextDocument,
        id: componentId,
        updatedAt,
      }

      await new Promise((resolve, reject) => {
        const transaction = database.transaction('components', 'readwrite')
        transaction.objectStore('components').put({
          ...record,
          id: componentId,
          document: JSON.stringify(persistedDocument),
          updatedAt,
        })
        transaction.addEventListener('complete', () => resolve(), { once: true })
        transaction.addEventListener(
          'abort',
          () => reject(transaction.error ?? new Error('Failed to persist component fixture')),
          { once: true },
        )
        transaction.addEventListener(
          'error',
          () => reject(transaction.error ?? new Error('Failed to persist component fixture')),
          { once: true },
        )
      })

      return persistedDocument
    } finally {
      database.close()
    }
  }, document)
}

export async function saveAndWait(page) {
  const beforeHash = await page.evaluate(() => window.location.hash)
  let beforeUpdatedAt = null

  if (beforeHash !== '#/components/new') {
    try {
      const before = await readPersistedComponent(page)
      beforeUpdatedAt = before.document?.updatedAt ?? null
    } catch {
      // The save result itself is the authority; a missing pre-save record is not.
    }
  }

  await page.getByRole('button', { name: '保存' }).click()

  const deadline = Date.now() + 30_000
  let lastError = null
  while (Date.now() < deadline) {
    const currentHash = await page.evaluate(() => window.location.hash)
    const hasPersistedRoute = /^#\/components\/[^/]+$/.test(currentHash)
      && currentHash !== '#/components/new'

    if (hasPersistedRoute) {
      try {
        const persisted = await readPersistedComponent(page)
        const updatedAt = persisted.document?.updatedAt ?? null
        if (beforeHash === '#/components/new' || updatedAt !== beforeUpdatedAt) {
          await page.getByText('Component Editor', { exact: true }).waitFor()
          return persisted
        }
      } catch (error) {
        lastError = error
      }
    }

    await page.waitForTimeout(50)
  }

  const detail = lastError instanceof Error ? `: ${lastError.message}` : ''
  throw new Error(`Timed out waiting for persisted component save${detail}`)
}
