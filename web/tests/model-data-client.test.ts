import assert from 'node:assert/strict'
import test from 'node:test'

import { ModelDataClient } from '../src/data/client.ts'
import type { ModelManifest } from '../src/data/types.ts'

const indexFixture = {
  count: 1,
  models: [
    {
      id: 'alpha-model',
      safe_id: 'AlphaModel',
      path: 'alpha-model/model.json',
      status: 'ok',
    },
  ],
}

const manifestFixture: ModelManifest = {
  schema_version: '1.0',
  generated_at: '2026-04-20T00:00:00Z',
  status: 'ok',
  warnings: [],
  model: {
    safe_id: 'AlphaModel',
  },
  modules: {
    module_count: 1,
  },
  chunks: {
    layout: 'flat',
    base_dir: 'chunks',
    compression: 'none',
    groups: {
      modules: ['modules.compact_tree', 'modules.tree'],
    },
    items: [
      {
        key: 'modules.compact_tree',
        path: 'chunks/modules.compact_tree.json',
        present: true,
        size_bytes: 12,
      },
      {
        key: 'modules.tree',
        path: 'chunks/modules.tree.json',
        present: true,
        size_bytes: 12,
      },
    ],
  },
}

const flushMicrotasks = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

const waitFor = async (predicate: () => boolean, message: string, timeoutMs = 1_000) => {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return
    }
    await flushMicrotasks()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  assert.fail(message)
}

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json',
    },
  })

const createAbortError = () => new DOMException('The operation was aborted.', 'AbortError')

const createDeferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve
    reject = innerReject
  })
  return { promise, resolve, reject }
}

const isAbortError = (error: unknown) => error instanceof DOMException && error.name === 'AbortError'

test('getManifest forwards abort signals through model path resolution', async () => {
  const client = new ModelDataClient('https://example.test/data/models')
  const controller = new AbortController()
  const seenSignals: Array<AbortSignal | null | undefined> = []

  const originalFetch = globalThis.fetch
  globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
    seenSignals.push(init?.signal)
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(createAbortError()), { once: true })
    })
  }) as typeof fetch

  try {
    const manifestPromise = client.getManifest('alpha-model', controller.signal)
    controller.abort()

    await assert.rejects(manifestPromise, isAbortError)
    assert.deepEqual(seenSignals, [controller.signal])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('releaseModel clears manifest cache and ignores late manifest responses', async () => {
  const client = new ModelDataClient('https://example.test/data/models')
  const manifestResponse = createDeferred<Response>()
  let manifestFetches = 0

  const originalFetch = globalThis.fetch
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/index.json')) {
      return Promise.resolve(jsonResponse(indexFixture))
    }
    if (url.endsWith('/alpha-model/model.json')) {
      manifestFetches += 1
      if (manifestFetches === 1) {
        return manifestResponse.promise
      }
      return Promise.resolve(jsonResponse(manifestFixture))
    }
    throw new Error(`Unexpected fetch: ${url}`)
  }) as typeof fetch

  try {
    const firstManifestPromise = client.getManifest('alpha-model')
    await waitFor(
      () => manifestFetches === 1,
      'expected the initial manifest request to start before releasing the cache',
    )

    client.releaseModel('alpha-model')
    manifestResponse.resolve(jsonResponse(manifestFixture))

    const firstManifest = await firstManifestPromise
    assert.equal(firstManifest.model.safe_id, 'AlphaModel')

    const secondManifest = await client.getManifest('alpha-model')
    assert.equal(secondManifest.model.safe_id, 'AlphaModel')
    assert.equal(manifestFetches, 2)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('chunk cache release ignores late chunk responses during graph view transitions', async () => {
  const client = new ModelDataClient('https://example.test/data/models')
  const firstChunkResponse = createDeferred<Response>()
  let chunkFetches = 0

  const originalFetch = globalThis.fetch
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/index.json')) {
      return Promise.resolve(jsonResponse(indexFixture))
    }
    if (url.endsWith('/alpha-model/model.json')) {
      return Promise.resolve(jsonResponse(manifestFixture))
    }
    if (url.endsWith('/alpha-model/chunks/modules.compact_tree.json')) {
      chunkFetches += 1
      if (chunkFetches === 1) {
        return firstChunkResponse.promise
      }
      return Promise.resolve(jsonResponse({ tree: 'fresh-compact-tree' }))
    }
    throw new Error(`Unexpected fetch: ${url}`)
  }) as typeof fetch

  try {
    const firstChunkPromise = client.getChunk('alpha-model', 'modules.compact_tree')
    await waitFor(
      () => chunkFetches === 1,
      'expected the initial chunk request to start before releasing the chunk cache',
    )

    client.releaseModel('alpha-model', { includeManifest: false })
    firstChunkResponse.resolve(jsonResponse({ tree: 'stale-compact-tree' }))

    const firstChunk = await firstChunkPromise
    assert.deepEqual(firstChunk, { tree: 'stale-compact-tree' })

    const secondChunk = await client.getChunk('alpha-model', 'modules.compact_tree')
    assert.deepEqual(secondChunk, { tree: 'fresh-compact-tree' })
    assert.equal(chunkFetches, 2)
  } finally {
    globalThis.fetch = originalFetch
  }
})
