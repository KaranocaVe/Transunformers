import { gunzipSync, strFromU8 } from 'fflate'

export type CompressionFormat = 'none' | 'gzip' | 'zstd'

const hasDecompressionStream = typeof DecompressionStream !== 'undefined'
type ZstdInstance = { decompress: (input: Uint8Array) => Uint8Array }
let zstdPromise: Promise<ZstdInstance> | null = null

const decodeText = (buffer: ArrayBuffer) =>
  new TextDecoder('utf-8', { fatal: false }).decode(buffer)

const loadZstd = async (): Promise<ZstdInstance> => {
  if (!zstdPromise) {
    const loader = import('@hpcc-js/wasm/zstd') as Promise<{
      Zstd: { load: () => Promise<ZstdInstance> }
    }>
    zstdPromise = loader.then((module) => module.Zstd.load())
  }
  return zstdPromise
}

export const inferCompressionFromPath = (path: string): CompressionFormat => {
  const lower = path.toLowerCase()
  if (lower.endsWith('.json.gz') || lower.endsWith('.gz')) {
    return 'gzip'
  }
  if (lower.endsWith('.json.zst') || lower.endsWith('.zst')) {
    return 'zstd'
  }
  return 'none'
}

export const decompressToText = async (
  buffer: ArrayBuffer,
  format: CompressionFormat,
) => {
  if (format === 'none') {
    return decodeText(buffer)
  }
  if (format === 'gzip') {
    if (hasDecompressionStream) {
      const stream = new Blob([buffer])
        .stream()
        .pipeThrough(new DecompressionStream('gzip'))
      return new Response(stream).text()
    }
    const output = gunzipSync(new Uint8Array(buffer))
    return strFromU8(output)
  }
  const zstd = await loadZstd()
  const output = zstd.decompress(new Uint8Array(buffer))
  return strFromU8(output)
}
