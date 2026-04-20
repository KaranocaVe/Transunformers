import type { Node } from 'reactflow'

import type { GraphNodeData } from './types'

export const applySelectedNodeToLayoutNodes = (
  nodes: Node<GraphNodeData>[],
  previousSelectedNodeId?: string,
  nextSelectedNodeId?: string,
) => {
  if (previousSelectedNodeId === nextSelectedNodeId) {
    return nodes
  }

  const touchedIds = new Set<string>()
  if (previousSelectedNodeId) {
    touchedIds.add(previousSelectedNodeId)
  }
  if (nextSelectedNodeId) {
    touchedIds.add(nextSelectedNodeId)
  }
  if (touchedIds.size === 0) {
    return nodes
  }

  let changed = false
  const nextNodes = nodes.map((node) => {
    if (!touchedIds.has(node.id)) {
      return node
    }

    const selected = node.id === nextSelectedNodeId
    if (node.selected === selected) {
      return node
    }

    changed = true
    return {
      ...node,
      selected,
    }
  })

  return changed ? nextNodes : nodes
}
