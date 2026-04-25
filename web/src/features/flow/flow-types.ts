import type { RawTraceNode } from '../../data/types'
import type { TreeNode } from '../graph/types'

export type TraceTensorSummary = {
  dtype?: string | null
  shape?: string | null
  signature: string
}

export type TraceTreeNode = {
  id: string
  label: string
  modulePath: string
  depth: number
  children: TraceTreeNode[]
  inputArgCount: number
  inputKwargKeys: string[]
  inputTensorCount: number
  outputTensorCount: number
  inputTensors: TraceTensorSummary[]
  outputTensors: TraceTensorSummary[]
  primaryInputSignature?: string | null
  primaryOutputSignature?: string | null
}

export type FlowGraph = {
  nodes: Array<{
    id: string
    label: string
    modulePath: string
    depth: number
    role: 'input' | 'block' | 'head'
    tags: string[]
    summaryLines: string[]
    x: number
    y: number
    width: number
    height: number
    branchHint?: 'sequential' | 'parallel' | 'bridge'
  }>
  edges: Array<{ id: string; source: string; target: string }>
  rootId?: string
  rootModulePath?: string
  layoutRoot?: TreeNode | null
}

export type RawTraceTree = RawTraceNode
