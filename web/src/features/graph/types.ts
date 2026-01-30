export type RawNode = {
  name: string
  path: string
  class?: string | null
  kind?: string | null
  index?: number | null
  index_start?: number | null
  index_end?: number | null
  repeat?: number | null
  tags?: string[] | null
  parameters?: {
    self?: { count: number; size_bytes: number; trainable: number }
    total?: { count: number; size_bytes: number; trainable: number }
  } | null
  buffers?: {
    self?: { count: number; size_bytes: number; trainable: number }
    total?: { count: number; size_bytes: number; trainable: number }
  } | null
  parameter_details?: Array<{
    name: string
    shape?: number[]
    numel?: number
    dtype?: string
    trainable?: boolean
  }>
  buffer_details?: Array<{
    name: string
    shape?: number[]
    numel?: number
    dtype?: string
    trainable?: boolean
  }>
  children?: RawNode[]
  collapsed?: boolean
}

export type TreeNode = {
  id: string
  name: string
  path: string
  className?: string | null
  kind?: string | null
  depth: number
  index?: number | null
  indexStart?: number | null
  indexEnd?: number | null
  repeat?: number | null
  parameters?: RawNode['parameters']
  buffers?: RawNode['buffers']
  parameterDetails?: RawNode['parameter_details']
  bufferDetails?: RawNode['buffer_details']
  tags?: string[] | null
  children: TreeNode[]
  synthetic?: boolean
}

export type GraphNodeData = {
  id: string
  label: string
  className?: string | null
  kind?: string | null
  role?: string | null
  depth: number
  path: string
  index?: number | null
  indexStart?: number | null
  indexEnd?: number | null
  repeat?: number | null
  parameters?: RawNode['parameters']
  buffers?: RawNode['buffers']
  parameterDetails?: RawNode['parameter_details']
  bufferDetails?: RawNode['buffer_details']
  tags?: string[] | null
  synthetic?: boolean
  hasChildren: boolean
  moduleCount?: number
  layerCount?: number
  lane?: string
  tagSummary?: string[]
  detailLevel?: number
  layerSegments?: Array<{
    label: string
    start: number
    end: number
    count: number
  }>
  stackId?: string
}
