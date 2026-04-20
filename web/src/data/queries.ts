import { useQuery } from '@tanstack/react-query'

import { modelDataClient } from './client'
import type { ModelIndex, ModelManifest, ModelChunkData } from './types'

type ModelQueryOptions = {
  gcTime?: number
}

export const useModelIndex = () =>
  useQuery<ModelIndex>({
    queryKey: ['models', modelDataClient.baseUrl, 'index'],
    queryFn: ({ signal }) => modelDataClient.getIndex(signal),
  })

export const useModelManifest = (identifier?: string, options?: ModelQueryOptions) =>
  useQuery<ModelManifest>({
    queryKey: ['models', modelDataClient.baseUrl, 'manifest', identifier],
    queryFn: ({ signal }) => modelDataClient.getManifest(identifier ?? '', signal),
    enabled: Boolean(identifier),
    gcTime: options?.gcTime,
  })

export const useModelGroup = (identifier?: string, group?: string) =>
  useQuery<Record<string, ModelChunkData>>({
    queryKey: ['models', modelDataClient.baseUrl, 'group', identifier, group],
    queryFn: ({ signal }) => modelDataClient.getGroup(identifier ?? '', group ?? '', { signal }),
    enabled: Boolean(identifier && group),
  })

export const useModelChunk = (
  identifier?: string,
  chunkKey?: string,
  options?: ModelQueryOptions,
) =>
  useQuery<ModelChunkData>({
    queryKey: ['models', modelDataClient.baseUrl, 'chunk', identifier, chunkKey],
    queryFn: ({ signal }) =>
      modelDataClient.getChunk(identifier ?? '', chunkKey ?? '', {
        signal,
      }),
    enabled: Boolean(identifier && chunkKey),
    gcTime: options?.gcTime,
  })

