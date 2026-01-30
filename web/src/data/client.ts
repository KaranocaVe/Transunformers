import { resolveDataBaseUrl, joinUrl } from './config'
import { decompressToText, inferCompressionFromPath } from './compression'
import type {
  ModelIndex,
  ModelIndexEntry,
  ModelManifest,
  ModelChunkKey,
  ModelChunkData,
  ChunkManifest,
} from './types'

type ModelIdentifier = string | ModelIndexEntry
type ManifestCache = Map<string, ModelManifest>
type ChunkCache = Map<string, Map<ModelChunkKey, ModelChunkData>>

const parseJson = <T>(text: string, url: string): T => {
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`Failed to parse JSON from ${url}`)
  }
}

const isPathLike = (value: string) =>
  value.includes('/') ||
  value.endsWith('.json') ||
  value.endsWith('.json.gz') ||
  value.endsWith('.json.zst')

const getModelDir = (modelPath: string) => {
  const parts = modelPath.split('/')
  if (parts.length <= 1) {
    return ''
  }
  return parts.slice(0, -1).join('/')
}

const resolveChunkCompression = (chunkPath: string, manifest?: ChunkManifest) => {
  if (manifest?.compression) {
    return manifest.compression
  }
  return inferCompressionFromPath(chunkPath)
}

export class ModelDataClient {
  readonly baseUrl: string

  private indexCache: ModelIndex | null = null
  private indexById = new Map<string, ModelIndexEntry>()
  private indexBySafeId = new Map<string, ModelIndexEntry>()
  private manifestCache: ManifestCache = new Map()
  private chunkCache: ChunkCache = new Map()

  constructor(baseUrl = resolveDataBaseUrl()) {
    this.baseUrl = baseUrl
  }

  private async fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
    const response = await fetch(url, { signal })
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    const contentType = response.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      return (await response.json()) as T
    }
    const text = await response.text()
    return parseJson<T>(text, url)
  }

  private async fetchCompressedJson<T>(
    url: string,
    compression: ReturnType<typeof resolveChunkCompression>,
    signal?: AbortSignal,
  ): Promise<T> {
    const response = await fetch(url, { signal })
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    const contentEncoding = (response.headers.get('content-encoding') ?? '').toLowerCase()
    const decodedByBrowser =
      (compression === 'gzip' && contentEncoding.includes('gzip')) ||
      (compression === 'zstd' && contentEncoding.includes('zstd'))
    if (compression === 'none' || decodedByBrowser) {
      const text = await response.text()
      return parseJson<T>(text, url)
    }
    const buffer = await response.arrayBuffer()
    const text = await decompressToText(buffer, compression)
    return parseJson<T>(text, url)
  }

  private buildIndexMaps(index: ModelIndex) {
    this.indexById.clear()
    this.indexBySafeId.clear()
    for (const entry of index.models) {
      this.indexById.set(entry.id, entry)
      this.indexBySafeId.set(entry.safe_id, entry)
    }
  }

  private async resolveEntry(identifier: ModelIdentifier) {
    if (typeof identifier !== 'string') {
      return identifier
    }
    if (isPathLike(identifier)) {
      return null
    }
    await this.getIndex()
    return this.indexById.get(identifier) ?? this.indexBySafeId.get(identifier) ?? null
  }

  private async resolveModelPath(identifier: ModelIdentifier) {
    if (typeof identifier !== 'string') {
      return identifier.path
    }
    if (isPathLike(identifier)) {
      return identifier
    }
    const entry = await this.resolveEntry(identifier)
    if (!entry) {
      throw new Error(`Unknown model identifier: ${identifier}`)
    }
    return entry.path
  }

  async getIndex(signal?: AbortSignal) {
    if (this.indexCache) {
      return this.indexCache
    }
    const url = joinUrl(this.baseUrl, 'index.json')
    const index = await this.fetchJson<ModelIndex>(url, signal)
    this.indexCache = index
    this.buildIndexMaps(index)
    return index
  }

  async getModelEntry(identifier: ModelIdentifier) {
    const entry = await this.resolveEntry(identifier)
    if (!entry) {
      if (typeof identifier === 'string' && isPathLike(identifier)) {
        return null
      }
      throw new Error(`Unknown model identifier: ${String(identifier)}`)
    }
    return entry
  }

  async getManifest(identifier: ModelIdentifier, signal?: AbortSignal) {
    const modelPath = await this.resolveModelPath(identifier)
    const cached = this.manifestCache.get(modelPath)
    if (cached) {
      return cached
    }
    const url = joinUrl(this.baseUrl, modelPath)
    const compression = inferCompressionFromPath(modelPath)
    const manifest =
      compression === 'none'
        ? await this.fetchJson<ModelManifest>(url, signal)
        : await this.fetchCompressedJson<ModelManifest>(url, compression, signal)
    this.manifestCache.set(modelPath, manifest)
    return manifest
  }





  async getChunk(
    identifier: ModelIdentifier,
    chunkKey: ModelChunkKey,
    options?: { signal?: AbortSignal; manifest?: ModelManifest },
  ) {
    const modelPath = await this.resolveModelPath(identifier)
    const cachedForModel = this.chunkCache.get(modelPath)
    const cachedChunk = cachedForModel?.get(chunkKey)
    if (cachedChunk !== undefined) {
      return cachedChunk
    }
    const manifest = options?.manifest ?? (await this.getManifest(identifier, options?.signal))
    if (!manifest.chunks) {
      throw new Error(`Model ${modelPath} does not use chunked layout`)
    }
    const item = manifest.chunks.items.find((entry) => entry.key === chunkKey)
    if (!item || !item.present) {
      throw new Error(`Chunk ${chunkKey} not found for ${modelPath}`)
    }
    const modelDir = getModelDir(modelPath)
    const chunkPath = joinUrl(modelDir, item.path)
    const url = joinUrl(this.baseUrl, chunkPath)
    const compression = resolveChunkCompression(item.path, manifest.chunks)
    const chunk = await this.fetchCompressedJson<ModelChunkData>(
      url,
      compression,
      options?.signal,
    )
    if (!cachedForModel) {
      this.chunkCache.set(modelPath, new Map([[chunkKey, chunk]]))
    } else {
      cachedForModel.set(chunkKey, chunk)
    }
    return chunk
  }

  async getGroup(
    identifier: ModelIdentifier,
    group: string,
    options?: { signal?: AbortSignal; manifest?: ModelManifest },
  ) {
    const manifest = options?.manifest ?? (await this.getManifest(identifier, options?.signal))
    if (!manifest.chunks) {
      return { full: manifest }
    }
    const keys = manifest.chunks.groups[group]
    if (!keys || keys.length === 0) {
      throw new Error(`Chunk group ${group} not found`)
    }
    const chunks = await Promise.all(
      keys.map((key) => this.getChunk(identifier, key, { ...options, manifest })),
    )
    return Object.fromEntries(keys.map((key, index) => [key, chunks[index]]))
  }

  releaseModel(identifier: ModelIdentifier) {
    const modelPath =
      typeof identifier === 'string' && !isPathLike(identifier)
        ? this.indexById.get(identifier)?.path ?? this.indexBySafeId.get(identifier)?.path
        : typeof identifier === 'string'
          ? identifier
          : identifier.path
    if (!modelPath) {
      return
    }
    this.chunkCache.delete(modelPath)
  }

  clearCache() {
    this.indexCache = null
    this.indexById.clear()
    this.indexBySafeId.clear()
    this.manifestCache.clear()
    this.chunkCache.clear()
  }
}

export const modelDataClient = new ModelDataClient()
