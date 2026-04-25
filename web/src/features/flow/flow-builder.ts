import { getGraphNodeSize } from '../graph/graph-builder'
import type { TreeNode } from '../graph/types'
import type { FlowGraph, TraceTreeNode } from './flow-types'

const X_GAP = 220
const Y_GAP = 96

type BranchHint = 'sequential' | 'parallel' | 'bridge'

type FlowRuntimeNode = FlowGraph['nodes'][number]

type FlowState = {
  entryIds: string[]
  exitIds: string[]
}

const inferTags = (node: TraceTreeNode) => {
  const text = `${node.modulePath} ${node.label}`.toLowerCase()
  const tags: string[] = []
  if (/embed|input|token|patch|position/.test(text)) tags.push('input')
  if (/attn|attention|query|key|value/.test(text)) tags.push('attention')
  if (/router|gate/.test(text)) tags.push('router')
  if (/expert|moe/.test(text)) tags.push('expert')
  if (/bridge|fusion|adapter|projector|qformer/.test(text)) tags.push('bridge')
  if (/norm/.test(text)) tags.push('norm')
  return tags.slice(0, 3)
}

const unique = <T,>(items: T[]) => [...new Set(items)]

const edgeId = (source: string, target: string) => `flow:${source}=>${target}`

const addEdge = (edges: Map<string, FlowGraph['edges'][number]>, source: string, target: string) => {
  if (source === target) {
    return
  }

  edges.set(edgeId(source, target), { id: edgeId(source, target), source, target })
}

const connectMany = (
  edges: Map<string, FlowGraph['edges'][number]>,
  sources: string[],
  targets: string[],
) => {
  unique(sources).forEach((source) => {
    unique(targets).forEach((target) => addEdge(edges, source, target))
  })
}

const isLeaf = (node: TraceTreeNode) => node.children.length === 0

const hasParallelChildren = (node: TraceTreeNode) => {
  if (node.children.length < 2) {
    return false
  }

  const signatures = node.children
    .map((child) => child.primaryInputSignature)
    .filter((value): value is string => Boolean(value))

  if (signatures.length < 2) {
    return false
  }

  const repeated = signatures.some((signature, index) => signatures.indexOf(signature) !== index)
  if (!repeated) {
    return false
  }

  if (!node.primaryInputSignature) {
    return true
  }

  return signatures.some((signature) => signature === node.primaryInputSignature)
}

const isVisibleRuntimeNode = (node: TraceTreeNode, isRoot: boolean) => {
  if (isRoot) {
    return false
  }

  return (
    isLeaf(node) ||
    node.depth === 1 ||
    node.inputArgCount > 1 ||
    hasParallelChildren(node)
  )
}

const summarizeShapeChange = (node: TraceTreeNode) => {
  if (node.primaryInputSignature && node.primaryOutputSignature) {
    if (node.primaryInputSignature === node.primaryOutputSignature) {
      return node.primaryOutputSignature
    }

    return `${node.primaryInputSignature} → ${node.primaryOutputSignature}`
  }

  return node.primaryOutputSignature ?? node.primaryInputSignature ?? 'runtime step'
}

const resolveBranchHint = (node: TraceTreeNode): BranchHint => {
  if (node.inputArgCount > 1) {
    return 'bridge'
  }

  if (hasParallelChildren(node)) {
    return 'parallel'
  }

  return 'sequential'
}

const toLayoutLeaf = (node: FlowRuntimeNode): TreeNode => ({
  id: node.id,
  name: node.label,
  path: node.modulePath,
  className: node.modulePath,
  kind: 'module',
  depth: node.depth,
  tags: node.tags,
  summaryLines: node.summaryLines,
  children: [],
})

export const buildFlowGraph = (root: TraceTreeNode | null): FlowGraph => {
  if (!root) {
    return { nodes: [], edges: [], layoutRoot: null }
  }

  const nodes = new Map<string, FlowRuntimeNode>()
  const edges = new Map<string, FlowGraph['edges'][number]>()
  let row = 0

  const ensureNode = (node: TraceTreeNode) => {
    const branchHint = resolveBranchHint(node)
    if (nodes.has(node.id)) {
      return
    }

    const currentRow = row++
    const draft: FlowRuntimeNode = {
      id: node.id,
      label: node.label,
      modulePath: node.modulePath,
      depth: node.depth,
      role: 'block',
      tags: inferTags(node),
      summaryLines: [
        summarizeShapeChange(node),
        node.inputKwargKeys.length > 0
          ? `kwargs: ${node.inputKwargKeys.slice(0, 2).join(', ')}`
          : `${Math.max(node.inputTensorCount, node.inputArgCount)} in · ${node.outputTensorCount} out`,
      ],
      x: node.depth * X_GAP,
      y: currentRow * Y_GAP,
      width: 0,
      height: 0,
      branchHint,
    }

    const size = getGraphNodeSize(toLayoutLeaf(draft))
    draft.width = size.width
    draft.height = size.height
    nodes.set(node.id, draft)
  }

  const visit = (node: TraceTreeNode, isRoot = false): FlowState => {
    const visible = isVisibleRuntimeNode(node, isRoot)
    const childStates = node.children.map((child) => visit(child))
    const parallelChildren = hasParallelChildren(node)

    if (visible) {
      ensureNode(node)

      if (childStates.length === 0) {
        return { entryIds: [node.id], exitIds: [node.id] }
      }

      if (parallelChildren) {
        childStates.forEach((childState) => {
          connectMany(edges, [node.id], childState.entryIds)
        })

        return {
          entryIds: [node.id],
          exitIds: unique(childStates.flatMap((childState) => childState.exitIds)),
        }
      }

      connectMany(edges, [node.id], childStates[0]?.entryIds ?? [])
      for (let index = 1; index < childStates.length; index += 1) {
        connectMany(edges, childStates[index - 1]?.exitIds ?? [], childStates[index]?.entryIds ?? [])
      }

      return {
        entryIds: [node.id],
        exitIds: childStates.at(-1)?.exitIds ?? [node.id],
      }
    }

    if (childStates.length === 0) {
      return { entryIds: [], exitIds: [] }
    }

    if (parallelChildren) {
      return {
        entryIds: unique(childStates.flatMap((childState) => childState.entryIds)),
        exitIds: unique(childStates.flatMap((childState) => childState.exitIds)),
      }
    }

    for (let index = 1; index < childStates.length; index += 1) {
      connectMany(edges, childStates[index - 1]?.exitIds ?? [], childStates[index]?.entryIds ?? [])
    }

    return {
      entryIds: childStates[0]?.entryIds ?? [],
      exitIds: childStates.at(-1)?.exitIds ?? [],
    }
  }

  visit(root, true)

  const indegree = new Map<string, number>()
  const outdegree = new Map<string, number>()
  nodes.forEach((_, id) => {
    indegree.set(id, 0)
    outdegree.set(id, 0)
  })
  edges.forEach((edge) => {
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1)
    outdegree.set(edge.source, (outdegree.get(edge.source) ?? 0) + 1)
  })

  const finalizedNodes: FlowRuntimeNode[] = [...nodes.values()].map((node) => {
    const role: FlowRuntimeNode['role'] =
      (indegree.get(node.id) ?? 0) === 0
        ? 'input'
        : (outdegree.get(node.id) ?? 0) === 0
          ? 'head'
          : 'block'

    return {
      ...node,
      role,
    }
  })

  const layoutRoot: TreeNode = {
    id: `${root.id}::__flow_root`,
    name: root.label,
    path: root.modulePath,
    className: root.modulePath,
    kind: 'module',
    depth: 0,
    tags: ['flow'],
    children: finalizedNodes.map(toLayoutLeaf),
  }

  return {
    nodes: finalizedNodes,
    edges: [...edges.values()],
    rootId: root.id,
    rootModulePath: root.modulePath,
    layoutRoot,
  }
}
