export type ModelIndexEntry = {
  id: string
  safe_id: string
  path: string
  status: string
  model_type?: string | null
  config_class?: string | null
  mapping_names?: string[] | null
  module_count?: number | null
  parameter_count?: number | null
  buffer_count?: number | null
  tags?: string[] | null
  [key: string]: unknown
}

export type ModelIndex = {
  count: number
  models: ModelIndexEntry[]
}

export type ChunkItem = {
  key: string
  path: string
  present: boolean
  size_bytes: number
}

export type ChunkManifest = {
  layout: string
  base_dir: string
  compression: 'none' | 'gzip' | 'zstd'
  groups: Record<string, string[]>
  items: ChunkItem[]
}

export type ModelSummary = {
  class?: string | null
  config_class?: string | null
  model_type?: string | null
  parameters?: {
    count: number
    size_bytes: number
    trainable: number
  }
  buffers?: {
    count: number
    size_bytes: number
    trainable: number
  }
  [key: string]: unknown
}

export type ModelManifest = {
  schema_version: string
  generated_at: string
  status: string
  warnings: string[]
  runtime?: Record<string, unknown>
  model: ModelSummary
  modules?: { module_count?: number; [key: string]: unknown }

  chunks?: ChunkManifest
  [key: string]: unknown
}



export type ModelChunkKey = string
export type ModelChunkData = Record<string, unknown> | unknown[] | unknown
