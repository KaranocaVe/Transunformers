import { Position, type Edge, type Node } from 'reactflow'

import type { GraphNodeData, TreeNode } from './types'
import { splitCollapsedNode } from './tree'

export type GraphBuildOptions = {
  expanded: Record<string, boolean>
  autoDepth: number
  viewMode: 'compact' | 'full'
  splitSize: number
}

export type Stage =
  | 'input'
  | 'encoder'
  | 'decoder'
  | 'block'
  | 'norm'
  | 'head'
  | 'aux'

const resolveNodeText = (node: TreeNode) =>
  `${node.name} ${node.className ?? ''} ${node.path} ${(node.tags ?? []).join(' ')}`.toLowerCase()

const getNodeSize = (node: TreeNode) => {
  const label = node.name
  const baseWidth = Math.max(220, Math.min(380, 170 + label.length * 7))
  if (node.kind === 'collapsed') {
    return { width: baseWidth, height: 66 }
  }
  if (node.children.length > 0) {
    return { width: Math.max(baseWidth, 300), height: 100 }
  }
  return { width: baseWidth, height: 62 }
}

const shouldExpandNode = (
  node: TreeNode,
  options: GraphBuildOptions,
): boolean => {
  if (options.expanded[node.id] === true) {
    return true
  }
  if (options.expanded[node.id] === false) {
    return false
  }
  if (node.kind === 'collapsed') {
    return false
  }
  return node.depth < options.autoDepth
}

const resolveOrderIndex = (node: TreeNode) => {
  if (node.index !== null && node.index !== undefined) {
    return node.index
  }
  if (node.indexStart !== null && node.indexStart !== undefined) {
    return node.indexStart
  }
  return null
}

const resolveExplicitStage = (node: TreeNode): Stage | null => {
  const text = resolveNodeText(node)
  const tags = node.tags ?? []

  if (
    tags.includes('head') ||
    text.includes('lm_head') ||
    text.includes('classifier') ||
    text.includes('logits') ||
    text.includes('proj_out') ||
    text.includes('projection') ||
    text.includes('pooler') ||
    text.includes('prediction') ||
    text.includes('output')
  ) {
    return 'head'
  }
  if (
    tags.includes('embedding') ||
    text.includes('embedding') ||
    text.includes('embed') ||
    text.includes('token') ||
    text.includes('patch') ||
    text.includes('position')
  ) {
    return 'input'
  }
  if (tags.includes('decoder') || text.includes('decoder')) {
    return 'decoder'
  }
  if (tags.includes('encoder') || text.includes('encoder')) {
    return 'encoder'
  }
  if (tags.includes('norm') || text.includes('norm')) {
    return 'norm'
  }
  if (
    tags.includes('attention') ||
    tags.includes('mlp') ||
    text.includes('attn') ||
    text.includes('transformer') ||
    text.includes('block') ||
    /layer(?!norm)/.test(text)
  ) {
    return 'block'
  }
  return null
}

const resolveParamCount = (node: TreeNode) =>
  node.parameters?.total?.count ?? node.parameters?.self?.count ?? 0

const resolveStage = (node: TreeNode, cache: Map<string, Stage>): Stage => {
  const cached = cache.get(node.id)
  if (cached) {
    return cached
  }
  const explicit = resolveExplicitStage(node)
  if (explicit) {
    cache.set(node.id, explicit)
    return explicit
  }
  if (node.children.length > 0) {
    let bestStage: Stage | null = null
    let bestCount = -1
    for (const child of node.children) {
      const childStage = resolveStage(child, cache)
      const count = resolveParamCount(child)
      if (count > bestCount) {
        bestStage = childStage
        bestCount = count
      }
    }
    if (bestStage) {
      cache.set(node.id, bestStage)
      return bestStage
    }
  }
  cache.set(node.id, 'aux')
  return 'aux'
}

const isParallelContainer = (node: TreeNode) => {
  const text = resolveNodeText(node)
  const tags = (node.tags ?? []).map((tag) => tag.toLowerCase())
  return (
    tags.some((tag) => ['experts', 'expert', 'router', 'moe'].includes(tag)) ||
    text.includes('experts') ||
    text.includes('expert') ||
    text.includes('router') ||
    text.includes('moe') ||
    text.includes('mixture') ||
    text.includes('mixture_of_experts')
  )
}

const resolveSequentialOrder = (children: TreeNode[]) => {
  const indexed = children
    .map((child, originalIndex) => ({
      child,
      originalIndex,
      order: resolveOrderIndex(child),
    }))
    .filter((item) => item.order !== null)
  if (indexed.length < 2) {
    return children
  }
  if (indexed.length !== children.length) {
    return children
  }
  return [...indexed]
    .sort((a, b) => {
      if (a.order === null || b.order === null) {
        return a.originalIndex - b.originalIndex
      }
      if (a.order === b.order) {
        return a.originalIndex - b.originalIndex
      }
      return a.order - b.order
    })
    .map((item) => item.child)
}

const resolveBranchKey = (node: TreeNode) => {
  const text = resolveNodeText(node)
  const tags = (node.tags ?? []).map((tag) => tag.toLowerCase())
  const hasTag = (values: string[]) => tags.some((tag) => values.includes(tag))
  if (
    hasTag(['vision', 'visual', 'image', 'video']) ||
    text.includes('vision') ||
    text.includes('visual') ||
    text.includes('image') ||
    text.includes('video')
  ) {
    return 'vision'
  }
  if (hasTag(['text', 'language']) || text.includes('text') || text.includes('language')) {
    return 'text'
  }
  if (
    hasTag(['audio', 'speech', 'whisper']) ||
    text.includes('audio') ||
    text.includes('speech') ||
    text.includes('whisper')
  ) {
    return 'audio'
  }
  return null
}

const isConnectorNode = (node: TreeNode) => {
  const text = resolveNodeText(node)
  const tags = (node.tags ?? []).map((tag) => tag.toLowerCase())
  const hasTag = (values: string[]) => tags.some((tag) => values.includes(tag))
  return (
    hasTag([
      'connector',
      'fusion',
      'adapter',
      'bridge',
      'projector',
      'projection',
      'align',
      'alignment',
      'merge',
      'multimodal',
      'cross_attn',
      'cross-attn',
      'qformer',
      'q_former',
    ]) ||
    text.includes('connector') ||
    text.includes('fusion') ||
    text.includes('adapter') ||
    text.includes('bridge') ||
    text.includes('projector') ||
    text.includes('projection') ||
    text.includes('align') ||
    text.includes('alignment') ||
    text.includes('merge') ||
    text.includes('multimodal') ||
    text.includes('multi_modal') ||
    text.includes('cross_attn') ||
    text.includes('cross-attn') ||
    text.includes('crossattn') ||
    text.includes('qformer') ||
    text.includes('q_former')
  )
}

const hasParallelBranches = (children: TreeNode[]) => {
  const resolved = children.map((child) => ({
    child,
    key: resolveBranchKey(child),
  }))
  const keys = resolved
    .map((item) => item.key)
    .filter(Boolean) as string[]
  if (keys.length < 2) {
    return false
  }
  const hasConnector = resolved.some(
    (item) => !item.key && isConnectorNode(item.child),
  )
  if (hasConnector) {
    return false
  }
  return new Set(keys).size >= 2
}

export const resolveFlowMode = (
  parent: TreeNode,
  children: TreeNode[],
  _stageCache?: Map<string, Stage>,
):
  | { mode: 'indexed'; order: TreeNode[] }
  | { mode: 'parallel' } => {
  if (children.length < 2) {
    return { mode: 'indexed', order: children }
  }

  if (isParallelContainer(parent)) {
    return { mode: 'parallel' }
  }

  if (hasParallelBranches(children)) {
    return { mode: 'parallel' }
  }

  return { mode: 'indexed', order: resolveSequentialOrder(children) }
}

const resolveChildren = (
  node: TreeNode,
  options: GraphBuildOptions,
  expand: boolean,
): TreeNode[] => {
  if (options.viewMode === 'full') {
    return node.children
  }
  if (node.kind === 'collapsed') {
    return expand ? splitCollapsedNode(node, options.splitSize) : []
  }
  return node.children
}

export const buildGraph = (
  root: TreeNode,
  options: GraphBuildOptions,
): {
  nodes: Node<GraphNodeData>[]
  edges: Edge[]
  layoutEdges: Edge[]
  nodeMap: Map<string, GraphNodeData>
  layoutRoot: TreeNode
  layout: 'elk'
} => {
  const nodes: Node<GraphNodeData>[] = []
  const structureEdges: Edge[] = []
  const flowEdges: Edge[] = []
  const nodeMap = new Map<string, GraphNodeData>()
  const stageCache = new Map<string, Stage>()

  const createStructureEdge = (source: string, target: string): Edge => ({
    id: `structure:${source}=>${target}`,
    source,
    target,
    type: 'straight',
    data: { kind: 'structure' },
    className: 'edge-structure',
  })

  const createFlowEdge = (source: string, target: string): Edge => ({
    id: `flow:${source}=>${target}`,
    source,
    target,
    type: 'flow',
    data: { kind: 'flow' },
    className: 'edge-flow',
  })

  const resolveGraphTree = (node: TreeNode, depth: number): TreeNode => {
    const nextNode = { ...node, depth }
    const expand = shouldExpandNode(nextNode, options)
    const children = expand ? resolveChildren(nextNode, options, expand) : []
    return {
      ...nextNode,
      children: children.map((child) =>
        resolveGraphTree({ ...child, depth: depth + 1 }, depth + 1),
      ),
    }
  }

  const layoutRoot = resolveGraphTree(root, 0)

  const visit = (node: TreeNode) => {
    const label = node.name
    const size = getNodeSize(node)
    const stage = resolveStage(node, stageCache)
    const isContainer = node.children.length > 0 && node.kind !== 'collapsed'
    const data: GraphNodeData = {
      id: node.id,
      label,
      className: node.className,
      kind: node.kind,
      role: stage,
      depth: node.depth,
      path: node.path,
      index: node.index,
      indexStart: node.indexStart,
      indexEnd: node.indexEnd,
      repeat: node.repeat,
      parameters: node.parameters,
      buffers: node.buffers,
      parameterDetails: node.parameterDetails,
      bufferDetails: node.bufferDetails,
      tags: node.tags,
      synthetic: node.synthetic,
      hasChildren: node.children.length > 0 || node.kind === 'collapsed',
    }
    nodeMap.set(node.id, data)
    nodes.push({
      id: node.id,
      type: isContainer ? 'group' : 'module',
      data,
      position: { x: 0, y: 0 },
      width: size.width,
      height: size.height,
      zIndex: isContainer ? 1 : 2,
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      draggable: !isContainer,
      selectable: !isContainer,
      focusable: !isContainer,
    })

    if (node.children.length === 0) {
      return
    }

    const children = node.children
    const flowMode = resolveFlowMode(node, children, stageCache)

    if (flowMode.mode === 'indexed') {
      const ordered = flowMode.order
      for (let index = 0; index < ordered.length - 1; index += 1) {
        const from = ordered[index]
        const to = ordered[index + 1]
        const edge = createFlowEdge(from.id, to.id)
        flowEdges.push(edge)
      }
    }

    for (const child of children) {
      if (flowMode.mode === 'parallel') {
        flowEdges.push(createFlowEdge(node.id, child.id))
      } else {
        structureEdges.push(createStructureEdge(node.id, child.id))
      }
      visit(child)
    }
  }

  visit(layoutRoot)

  const edges = [...structureEdges, ...flowEdges]
  return { nodes, edges, layoutEdges: flowEdges, nodeMap, layoutRoot, layout: 'elk' }
}
