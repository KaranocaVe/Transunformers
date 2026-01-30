import ELK from 'elkjs/lib/elk.bundled.js'
import type { Edge, Node } from 'reactflow'

import { resolveFlowMode } from './graph-builder'
import type { TreeNode } from './types'

const elk = new ELK()

const ROOT_LAYOUT_OPTIONS: Record<string, string> = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.spacing.nodeNode': '48',
  'elk.spacing.edgeNode': '18',
  'elk.spacing.edgeEdge': '14',
  'elk.layered.spacing.nodeNodeBetweenLayers': '52',
  'elk.layered.spacing.edgeNodeBetweenLayers': '30',
  'elk.layered.spacing.edgeEdgeBetweenLayers': '24',
  'elk.layered.nodePlacement.favorStraightEdges': 'true',
  'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.contentAlignment': 'H_CENTER V_TOP',
}

const CONTAINER_LAYOUT_OPTIONS: Record<string, string> = {
  'elk.algorithm': 'layered',
  'elk.spacing.nodeNode': '40',
  'elk.spacing.edgeNode': '16',
  'elk.spacing.edgeEdge': '12',
  'elk.layered.spacing.nodeNodeBetweenLayers': '44',
  'elk.layered.spacing.edgeNodeBetweenLayers': '24',
  'elk.layered.spacing.edgeEdgeBetweenLayers': '18',
  'elk.layered.nodePlacement.favorStraightEdges': 'true',
  'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.contentAlignment': 'H_CENTER V_TOP',
  'elk.nodeSize.constraints': 'MINIMUM_SIZE',
  'elk.padding': '[top=110,left=40,bottom=40,right=40]',
}

type ElkGraphNode = {
  id: string
  width?: number
  height?: number
  x?: number
  y?: number
  children?: ElkGraphNode[]
  layoutOptions?: Record<string, string>
}

type LayoutInfo = {
  x: number
  y: number
  width: number
  height: number
}

const buildParentIndex = (node: TreeNode) => {
  const parentById = new Map<string, string | null>()
  const walk = (current: TreeNode, parentId: string | null) => {
    parentById.set(current.id, parentId)
    current.children.forEach((child) => walk(child, current.id))
  }
  walk(node, null)
  return parentById
}

const isAncestor = (
  ancestorId: string,
  nodeId: string,
  parentById: Map<string, string | null>,
) => {
  let current = parentById.get(nodeId) ?? null
  while (current) {
    if (current === ancestorId) {
      return true
    }
    current = parentById.get(current) ?? null
  }
  return false
}

const buildElkTree = (
  node: TreeNode,
  sizeById: Map<string, { width: number; height: number }>,
): ElkGraphNode => {
  const size = sizeById.get(node.id) ?? { width: 220, height: 60 }
  const hasChildren = node.children.length > 0 && node.kind !== 'collapsed'
  const flowMode = hasChildren ? resolveFlowMode(node, node.children) : null

  const elkNode: ElkGraphNode = {
    id: node.id,
    width: size.width,
    height: size.height,
  }

  if (hasChildren) {
    const orderedChildren =
      flowMode?.mode === 'indexed' ? flowMode.order : node.children
    elkNode.layoutOptions = {
      ...CONTAINER_LAYOUT_OPTIONS,
      'elk.direction': flowMode?.mode === 'parallel' ? 'RIGHT' : 'DOWN',
    }
    elkNode.children = orderedChildren.map((child) => buildElkTree(child, sizeById))
  }

  return elkNode
}

const buildParallelLayoutEdges = (node: TreeNode): Edge[] => {
  const edges: Edge[] = []
  if (node.children.length > 1) {
    const flowMode = resolveFlowMode(node, node.children)
    if (flowMode.mode === 'parallel') {
      const ordered = node.children
      for (let index = 0; index < ordered.length - 1; index += 1) {
        const source = ordered[index]
        const target = ordered[index + 1]
        edges.push({
          id: `layout:parallel:${node.id}:${source.id}=>${target.id}`,
          source: source.id,
          target: target.id,
        })
      }
    }
  }
  node.children.forEach((child) => {
    edges.push(...buildParallelLayoutEdges(child))
  })
  return edges
}

const collectLayout = (
  node: ElkGraphNode,
  offsetX: number,
  offsetY: number,
  into: Map<string, LayoutInfo>,
) => {
  const x = (node.x ?? 0) + offsetX
  const y = (node.y ?? 0) + offsetY
  const width = node.width ?? 0
  const height = node.height ?? 0
  into.set(node.id, { x, y, width, height })
  node.children?.forEach((child) => collectLayout(child, x, y, into))
}

const normalizePositions = <T>(
  nodes: Node<T>[],
  layoutInfo: Map<string, LayoutInfo>,
  padding = 40,
) => {
  if (nodes.length === 0) {
    return nodes
  }
  let minX = Infinity
  let minY = Infinity
  nodes.forEach((node) => {
    const info = layoutInfo.get(node.id)
    if (!info) return
    minX = Math.min(minX, info.x)
    minY = Math.min(minY, info.y)
  })
  const offsetX = minX < padding ? padding - minX : 0
  const offsetY = minY < padding ? padding - minY : 0
  if (offsetX === 0 && offsetY === 0) {
    return nodes
  }
  return nodes.map((node) => ({
    ...node,
    position: {
      x: node.position.x + offsetX,
      y: node.position.y + offsetY,
    },
  }))
}

export const layoutGraph = async <T>(
  nodes: Node<T>[],
  edges: Edge[],
  root: TreeNode | null,
): Promise<Node<T>[]> => {
  if (!root) {
    return nodes
  }

  const sizeById = new Map(
    nodes.map((node) => [
      node.id,
      { width: node.width ?? 220, height: node.height ?? 60 },
    ]),
  )

  const parentById = buildParentIndex(root)
  const layoutEdges = edges.filter(
    (edge) =>
      !isAncestor(edge.source, edge.target, parentById) &&
      !isAncestor(edge.target, edge.source, parentById),
  )
  const parallelEdges = buildParallelLayoutEdges(root)
    .filter(
      (edge) =>
        !isAncestor(edge.source, edge.target, parentById) &&
        !isAncestor(edge.target, edge.source, parentById),
    )

  const rootNode = buildElkTree(root, sizeById)
  const graph = {
    ...rootNode,
    layoutOptions: {
      ...(rootNode.layoutOptions ?? {}),
      ...ROOT_LAYOUT_OPTIONS,
      'elk.direction': 'DOWN',
    },
    edges: layoutEdges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  }
  for (const edge of parallelEdges) {
    graph.edges.push({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })
  }

  const layout = await elk.layout(graph)
  const layoutInfo = new Map<string, LayoutInfo>()
  collectLayout(layout as ElkGraphNode, 0, 0, layoutInfo)

  const positioned = nodes.map((node) => {
    const info = layoutInfo.get(node.id)
    if (!info) {
      return node
    }
    const next: Node<T> = {
      ...node,
      position: { x: info.x, y: info.y },
      width: info.width,
      height: info.height,
    }
    if (node.type === 'group') {
      next.style = {
        ...(node.style ?? {}),
        width: info.width,
        height: info.height,
      }
    }
    return next
  })

  return normalizePositions(positioned, layoutInfo)
}
