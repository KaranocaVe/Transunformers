import { useQuery } from '@tanstack/react-query'

import { modelDataClient } from './client'
import type { ModelIndex, ModelManifest, ModelChunkData } from './types'

export const useModelIndex = () =>
  useQuery<ModelIndex>({
    queryKey: ['models', modelDataClient.baseUrl, 'index'],
    queryFn: () => modelDataClient.getIndex(),
  })

export const useModelManifest = (identifier?: string) =>
  useQuery<ModelManifest>({
    queryKey: ['models', modelDataClient.baseUrl, 'manifest', identifier],
    queryFn: () => modelDataClient.getManifest(identifier ?? ''),
    enabled: Boolean(identifier),
  })

export const useModelGroup = (identifier?: string, group?: string) =>
  useQuery<Record<string, ModelChunkData>>({
    queryKey: ['models', modelDataClient.baseUrl, 'group', identifier, group],
    queryFn: () => modelDataClient.getGroup(identifier ?? '', group ?? ''),
    enabled: Boolean(identifier && group),
  })

export const useModelChunk = (identifier?: string, chunkKey?: string) =>
  useQuery<ModelChunkData>({
    queryKey: ['models', modelDataClient.baseUrl, 'chunk', identifier, chunkKey],
    queryFn: () => modelDataClient.getChunk(identifier ?? '', chunkKey ?? ''),
    enabled: Boolean(identifier && chunkKey),
  })


