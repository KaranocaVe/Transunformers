import type { RawTraceNode } from '../../data/types'
import type { TreeNode } from '../graph/types'

export type TraceTreeNode = {
  id: string
  label: string
  modulePath: string
  depth: number
  children: TraceTreeNode[]
  inputCount: number
  outputCount: number
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
  }>
  edges: Array<{ id: string; source: string; target: string }>
  rootId?: string
  rootModulePath?: string
  layoutRoot?: TreeNode | null
}

export type RawTraceTree = RawTraceNode
