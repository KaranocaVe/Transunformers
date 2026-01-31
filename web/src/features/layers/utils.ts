import type { TreeNode } from '../graph/types'

export interface FlatLayer {
  id: string
  path: string
  className?: string
  params: number
  buffers: number
  depth: number
}

export function flattenTree(node: TreeNode, result: FlatLayer[] = []) {
  const params = node.parameters?.total?.count ?? node.parameters?.self?.count ?? 0
  const buffers = node.buffers?.total?.count ?? node.buffers?.self?.count ?? 0
  
  // Add self if it has parameters or is a leaf
  if (params > 0 || (node.children.length === 0)) {
      result.push({
          id: node.id,
          path: node.path,
          className: node.className ?? undefined,
          params,
          buffers,
          depth: node.depth
      })
  }

  for (const child of node.children) {
      flattenTree(child, result)
  }
  
  return result
}
