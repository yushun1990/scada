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
  await page.getByRole('button', { name: '保存' }).click()
  await page.getByText('组件已保存', { exact: true }).waitFor()
}
