import type { FlowGraph, TraceTreeNode } from './flow-types'
import type { TreeNode } from '../graph/types'

const NODE_WIDTH = 220
const NODE_HEIGHT = 76
const X_GAP = 220
const Y_GAP = 96

const inferRole = (node: TraceTreeNode): 'input' | 'block' | 'head' => {
  if (node.depth <= 1) return 'input'
  if (node.children.length === 0) return 'head'
  return 'block'
}

const inferTags = (node: TraceTreeNode) => {
  const text = `${node.modulePath} ${node.label}`.toLowerCase()
  const tags: string[] = []
  if (/embed|input|token|patch/.test(text)) tags.push('input')
  if (/attn|attention/.test(text)) tags.push('attention')
  if (/router|gate/.test(text)) tags.push('router')
  if (/expert|moe/.test(text)) tags.push('expert')
  if (/bridge|fusion|adapter|projector|qformer/.test(text)) tags.push('bridge')
  return tags.slice(0, 2)
}

export const buildFlowGraph = (root: TraceTreeNode | null): FlowGraph => {
  if (!root) {
    return { nodes: [], edges: [], layoutRoot: null }
  }

  const nodes: FlowGraph['nodes'] = []
  const edges: FlowGraph['edges'] = []
  let row = 0

  const toLayoutTree = (node: TraceTreeNode): TreeNode => ({
    id: node.id,
    name: node.label,
    path: node.modulePath,
    className: node.modulePath,
    kind: 'module',
    depth: node.depth,
    tags: inferTags(node),
    children: node.children.map(toLayoutTree),
  })

  const walk = (node: TraceTreeNode) => {
    const currentRow = row++
    const role = inferRole(node)
    const tags = inferTags(node)
    nodes.push({
      id: node.id,
      label: node.label,
      modulePath: node.modulePath,
      depth: node.depth,
      role,
      tags,
      summaryLines: [
        node.inputCount > 0 ? `${node.inputCount} in` : '—',
        node.outputCount > 0 ? `${node.outputCount} out` : '—',
      ],
      x: node.depth * X_GAP,
      y: currentRow * Y_GAP,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    })

    node.children.forEach((child) => {
      edges.push({ id: `trace:${node.id}=>${child.id}`, source: node.id, target: child.id })
      walk(child)
    })
  }

  walk(root)

  return { nodes, edges, rootId: root.id, rootModulePath: root.modulePath, layoutRoot: toLayoutTree(root) }
}
