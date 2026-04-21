import { resolveDataBaseUrl, joinUrl } from './config'
import { decompressToText, inferCompressionFromPath } from './compression'
import type {
  ModelIndex,
  ModelIndexEntry,
  ModelManifest,
  ModelChunkKey,
  ModelChunkData,
  ChunkManifest,
  RawTraceNode,
} from './types'

type ModelIdentifier = string | ModelIndexEntry
type ManifestCache = Map<string, ModelManifest>
type ChunkCache = Map<string, Map<ModelChunkKey, ModelChunkData>>
type ReleaseModelOptions = {
  includeManifest?: boolean
}

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
  private cacheEpoch = 0
  private manifestCacheEpochs = new Map<string, number>()
  private chunkCacheEpochs = new Map<string, number>()

  constructor(baseUrl = resolveDataBaseUrl()) {
    this.baseUrl = baseUrl
  }

  private getManifestCacheEpoch(modelPath: string) {
    return this.manifestCacheEpochs.get(modelPath) ?? 0
  }

  private getChunkCacheEpoch(modelPath: string) {
    return this.chunkCacheEpochs.get(modelPath) ?? 0
  }

  private isManifestCacheCurrent(
    modelPath: string,
    snapshot: { cacheEpoch: number; manifestEpoch: number },
    signal?: AbortSignal,
  ) {
    return (
      !signal?.aborted &&
      this.cacheEpoch === snapshot.cacheEpoch &&
      this.getManifestCacheEpoch(modelPath) === snapshot.manifestEpoch
    )
  }

  private isChunkCacheCurrent(
    modelPath: string,
    snapshot: { cacheEpoch: number; chunkEpoch: number },
    signal?: AbortSignal,
  ) {
    return (
      !signal?.aborted &&
      this.cacheEpoch === snapshot.cacheEpoch &&
      this.getChunkCacheEpoch(modelPath) === snapshot.chunkEpoch
    )
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

  private async resolveEntry(identifier: ModelIdentifier, signal?: AbortSignal) {
    if (typeof identifier !== 'string') {
      return identifier
    }
    await this.getIndex(signal)
    const indexed = this.indexById.get(identifier) ?? this.indexBySafeId.get(identifier) ?? null
    if (indexed) {
      return indexed
    }
    if (isPathLike(identifier)) {
      return null
    }
    return null
  }

  private async resolveModelPath(identifier: ModelIdentifier, signal?: AbortSignal): Promise<string> {
    if (typeof identifier !== 'string') {
      return identifier.path
    }
    const entry = await this.resolveEntry(identifier, signal)
    if (entry) {
      return entry.path
    }
    if (isPathLike(identifier)) {
      return identifier
    }
    throw new Error(`Unknown model identifier: ${identifier}`)
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

  async getModelEntry(identifier: ModelIdentifier, signal?: AbortSignal) {
    const entry = await this.resolveEntry(identifier, signal)
    if (!entry) {
      if (typeof identifier === 'string' && isPathLike(identifier)) {
        return null
      }
      throw new Error(`Unknown model identifier: ${String(identifier)}`)
    }
    return entry
  }

  async getManifest(identifier: ModelIdentifier, signal?: AbortSignal) {
    const modelPath = await this.resolveModelPath(identifier, signal)
    const cached = this.manifestCache.get(modelPath)
    if (cached) {
      return cached
    }
    const cacheSnapshot = {
      cacheEpoch: this.cacheEpoch,
      manifestEpoch: this.getManifestCacheEpoch(modelPath),
    }
    const url = joinUrl(this.baseUrl, modelPath)
    const compression = inferCompressionFromPath(modelPath)
    const manifest =
      compression === 'none'
        ? await this.fetchJson<ModelManifest>(url, signal)
        : await this.fetchCompressedJson<ModelManifest>(url, compression, signal)
    if (this.isManifestCacheCurrent(modelPath, cacheSnapshot, signal)) {
      this.manifestCache.set(modelPath, manifest)
    }
    return manifest
  }





  async getChunk(
    identifier: ModelIdentifier,
    chunkKey: ModelChunkKey,
    options?: { signal?: AbortSignal; manifest?: ModelManifest },
  ) {
    const modelPath = await this.resolveModelPath(identifier, options?.signal)
    const cachedForModel = this.chunkCache.get(modelPath)
    const cachedChunk = cachedForModel?.get(chunkKey)
    if (cachedChunk !== undefined) {
      return cachedChunk
    }
    const cacheSnapshot = {
      cacheEpoch: this.cacheEpoch,
      chunkEpoch: this.getChunkCacheEpoch(modelPath),
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
    if (this.isChunkCacheCurrent(modelPath, cacheSnapshot, options?.signal)) {
      if (!cachedForModel) {
        this.chunkCache.set(modelPath, new Map([[chunkKey, chunk]]))
      } else {
        cachedForModel.set(chunkKey, chunk)
      }
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

  async getTraceSummary(
    identifier: ModelIdentifier,
    options?: { signal?: AbortSignal; manifest?: ModelManifest },
  ) {
    const manifest = options?.manifest ?? (await this.getManifest(identifier, options?.signal))
    const summaryFile = manifest.trace?.summary_file
    if (!manifest.trace?.enabled || !summaryFile) {
      return null
    }

    const modelPath = await this.resolveModelPath(identifier, options?.signal)
    const modelDir = getModelDir(modelPath)
    const tracePath = joinUrl(modelDir, summaryFile)
    const url = joinUrl(this.baseUrl, tracePath)
    const compression = inferCompressionFromPath(summaryFile)
    return compression === 'none'
      ? this.fetchJson<RawTraceNode>(url, options?.signal)
      : this.fetchCompressedJson<RawTraceNode>(url, compression, options?.signal)
  }

  releaseModel(identifier: ModelIdentifier, options?: ReleaseModelOptions) {
    const modelPath =
      typeof identifier === 'string' && !isPathLike(identifier)
        ? this.indexById.get(identifier)?.path ?? this.indexBySafeId.get(identifier)?.path
        : typeof identifier === 'string'
          ? identifier
          : identifier.path
    if (!modelPath) {
      return
    }
    const includeManifest = options?.includeManifest ?? true
    if (includeManifest) {
      this.manifestCacheEpochs.set(modelPath, this.getManifestCacheEpoch(modelPath) + 1)
      this.manifestCache.delete(modelPath)
    }
    this.chunkCacheEpochs.set(modelPath, this.getChunkCacheEpoch(modelPath) + 1)
    this.chunkCache.delete(modelPath)
  }

  clearCache() {
    this.cacheEpoch += 1
    this.indexCache = null
    this.indexById.clear()
    this.indexBySafeId.clear()
    this.manifestCache.clear()
    this.chunkCache.clear()
    this.manifestCacheEpochs.clear()
    this.chunkCacheEpochs.clear()
  }
}

export const modelDataClient = new ModelDataClient()
