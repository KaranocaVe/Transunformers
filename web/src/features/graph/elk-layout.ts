import ELK from 'elkjs/lib/elk.bundled.js'
import type { Edge, Node } from 'reactflow'

import {
  DEFAULT_GRAPH_NODE_SIZE,
  FLOW_EDGE_ROUTING_OWNER,
  toGraphNodeFrameStyle,
  type FlowEdgeData,
  type GraphRoutePoint,
  type GraphRouteSection,
} from './graph-builder'
import { resolveFlowMode } from './graph-builder'
import type { TreeNode } from './types'

const elk = new ELK()

const ROOT_LAYOUT_OPTIONS: Record<string, string> = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.spacing.nodeNode': '26',
  'elk.spacing.edgeNode': '14',
  'elk.spacing.edgeEdge': '8',
  'elk.layered.spacing.nodeNodeBetweenLayers': '26',
  'elk.layered.spacing.edgeNodeBetweenLayers': '16',
  'elk.layered.spacing.edgeEdgeBetweenLayers': '12',
  'elk.layered.nodePlacement.favorStraightEdges': 'true',
  'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.contentAlignment': 'H_CENTER V_TOP',
}

const CONTAINER_LAYOUT_OPTIONS: Record<string, string> = {
  'elk.algorithm': 'layered',
  'elk.spacing.nodeNode': '20',
  'elk.spacing.edgeNode': '14',
  'elk.spacing.edgeEdge': '10',
  'elk.layered.spacing.nodeNodeBetweenLayers': '24',
  'elk.layered.spacing.edgeNodeBetweenLayers': '16',
  'elk.layered.spacing.edgeEdgeBetweenLayers': '12',
  'elk.layered.nodePlacement.favorStraightEdges': 'true',
  'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.contentAlignment': 'H_CENTER V_TOP',
  'elk.nodeSize.constraints': 'MINIMUM_SIZE',
  'elk.padding': '[top=44,left=24,bottom=28,right=24]',
}

const resolveNumericDimension = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return null
}

const resolveNodeFrameSize = <T,>(node: Pick<Node<T>, 'style' | 'width' | 'height'>) => {
  const styledWidth = resolveNumericDimension(node.style?.width)
  const styledHeight = resolveNumericDimension(node.style?.height)

  return {
    width: styledWidth ?? node.width ?? DEFAULT_GRAPH_NODE_SIZE.width,
    height: styledHeight ?? node.height ?? DEFAULT_GRAPH_NODE_SIZE.height,
  }
}

type ElkGraphNode = {
  id: string
  width?: number
  height?: number
  x?: number
  y?: number
  children?: ElkGraphNode[]
  layoutOptions?: Record<string, string>
  edges?: ElkGraphEdge[]
}

type ElkGraphEdge = {
  id: string
  sources: string[]
  targets: string[]
  container?: string
  sections?: {
    startPoint: { x: number; y: number }
    endPoint: { x: number; y: number }
    bendPoints?: { x: number; y: number }[]
  }[]
}

type LayoutInfo = {
  x: number
  y: number
  width: number
  height: number
}

type EdgeLayoutInfo = {
  id: string
  sections: GraphRouteSection[]
  points: GraphRoutePoint[]
}

const buildElkTree = (
  node: TreeNode,
  sizeById: Map<string, { width: number; height: number }>,
): ElkGraphNode => {
  const size = sizeById.get(node.id) ?? DEFAULT_GRAPH_NODE_SIZE
  const hasChildren = node.children.length > 0
  const flowMode = hasChildren ? resolveFlowMode(node, node.children) : null

  const elkNode: ElkGraphNode = {
    id: node.id,
    width: size.width,
    height: size.height,
  }

  if (hasChildren) {
    const orderedChildren =
      flowMode?.mode === 'indexed' ? flowMode.order : node.children
    const layoutOptions: Record<string, string> = {
      ...CONTAINER_LAYOUT_OPTIONS,
      'elk.direction': flowMode?.mode === 'parallel' ? 'RIGHT' : 'DOWN',
    }
    if (flowMode?.mode === 'parallel') {
      // ELK crashes on compound parent→child branch routing when model-order constraints
      // are forced inside the same parallel container, so keep the explicit order hint only
      // for indexed/sequential child flows.
      delete layoutOptions['elk.layered.considerModelOrder.strategy']
    }
    elkNode.layoutOptions = {
      ...layoutOptions,
    }
    elkNode.children = orderedChildren.map((child) => buildElkTree(child, sizeById))
  }

  return elkNode
}

const withPointOffset = (
  point: GraphRoutePoint,
  offset: { x: number; y: number },
): GraphRoutePoint => ({
  x: point.x + offset.x,
  y: point.y + offset.y,
})

const withSectionOffset = (
  section: GraphRouteSection,
  offset: { x: number; y: number },
): GraphRouteSection => ({
  startPoint: withPointOffset(section.startPoint, offset),
  endPoint: withPointOffset(section.endPoint, offset),
  bendPoints: section.bendPoints?.map((bendPoint) => withPointOffset(bendPoint, offset)),
})

const appendUniquePoint = (
  points: GraphRoutePoint[],
  point: GraphRoutePoint,
) => {
  const last = points.at(-1)
  if (last && last.x === point.x && last.y === point.y) {
    return
  }
  points.push(point)
}

const absolutizeRouteSections = (
  sections: NonNullable<ElkGraphEdge['sections']>,
  offset: { x: number; y: number },
): GraphRouteSection[] =>
  sections.map((section) => ({
    startPoint: withPointOffset(section.startPoint, offset),
    endPoint: withPointOffset(section.endPoint, offset),
    bendPoints: section.bendPoints?.map((bendPoint) => withPointOffset(bendPoint, offset)),
  }))

export const flattenRouteSections = (
  sections: GraphRouteSection[],
): GraphRoutePoint[] => {
  const points: GraphRoutePoint[] = []
  sections.forEach((section) => {
    appendUniquePoint(points, section.startPoint)
    section.bendPoints?.forEach((bendPoint) => appendUniquePoint(points, bendPoint))
    appendUniquePoint(points, section.endPoint)
  })
  return points
}

const collectNodeLayout = (
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

  node.children?.forEach((child) => collectNodeLayout(child, x, y, into))
}

const collectEdgeLayout = (
  node: ElkGraphNode,
  nodeLayoutInfo: Map<string, LayoutInfo>,
  edgeInto: Map<string, EdgeLayoutInfo>,
) => {
  const nodeOffset = nodeLayoutInfo.get(node.id) ?? { x: 0, y: 0, width: 0, height: 0 }

  node.edges?.forEach((edge) => {
    if (!edge.sections || edge.sections.length === 0) {
      return
    }

    const containerOffset = edge.container
      ? nodeLayoutInfo.get(edge.container) ?? nodeOffset
      : nodeOffset
    const sections = absolutizeRouteSections(edge.sections, containerOffset)
    edgeInto.set(edge.id, {
      id: edge.id,
      sections,
      points: flattenRouteSections(sections),
    })
  })

  node.children?.forEach((child) => collectEdgeLayout(child, nodeLayoutInfo, edgeInto))
}



export const layoutGraph = async <T>(
  nodes: Node<T>[],
  edges: Edge[],
  root: TreeNode | null,
  options?: { direction?: 'DOWN' | 'RIGHT' }
): Promise<{ nodes: Node<T>[]; edges: Edge[] }> => {
  if (!root) {
    return { nodes, edges }
  }

  const direction = options?.direction ?? 'DOWN'

  const sizeById = new Map(
    nodes.map((node) => [
      node.id,
      resolveNodeFrameSize(node),
    ]),
  )

  const rootNode = buildElkTree(root, sizeById)
  const graph = {
    id: `${rootNode.id}::__layout_root`,
    layoutOptions: {
      ...ROOT_LAYOUT_OPTIONS,
      'elk.direction': direction,
    },
    children: [rootNode],
    // ELK routes the exact visible edge set from buildGraph; there are no layout-only extras.
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  }

  const layout = await elk.layout(graph)
  const layoutInfo = new Map<string, LayoutInfo>()
  const edgeLayoutInfo = new Map<string, EdgeLayoutInfo>()
  collectNodeLayout(layout as ElkGraphNode, 0, 0, layoutInfo)
  collectEdgeLayout(layout as ElkGraphNode, layoutInfo, edgeLayoutInfo)

  const positionedNodes = nodes.map((node) => {
    const info = layoutInfo.get(node.id)
    if (!info) {
      return node
    }
    const next: Node<T> = {
      ...node,
      position: { x: info.x, y: info.y },
      width: info.width,
      height: info.height,
      style: {
        ...(node.style ?? {}),
        ...toGraphNodeFrameStyle(info),
      },
    }
    return next
  })

  // Apply normalization manually to both nodes and edges
  let minX = Infinity
  let minY = Infinity
  
  if (positionedNodes.length > 0) {
      positionedNodes.forEach(node => {
          minX = Math.min(minX, node.position.x)
          minY = Math.min(minY, node.position.y)
      })
      
      const padding = 20
      const offsetX = minX < padding ? padding - minX : 0
      const offsetY = minY < padding ? padding - minY : 0
      
      if (offsetX !== 0 || offsetY !== 0) {
           positionedNodes.forEach(node => {
               node.position.x += offsetX
               node.position.y += offsetY
           })
           // Keep route sections and flattened points in sync after normalization.
           edgeLayoutInfo.forEach(info => {
               info.sections = info.sections.map((section) =>
                 withSectionOffset(section, { x: offsetX, y: offsetY }),
               )
               info.points = flattenRouteSections(info.sections)
           })
       }
   }

  const routedEdges = edges.map((edge) => {
      const info = edgeLayoutInfo.get(edge.id)
      if (info) {
          return {
              ...edge,
              data: {
                ...(edge.data as Record<string, unknown> | undefined),
                kind: 'flow',
                routingOwner: FLOW_EDGE_ROUTING_OWNER,
                route: {
                  owner: FLOW_EDGE_ROUTING_OWNER,
                  sections: info.sections,
                  points: info.points,
                },
              } as FlowEdgeData,
          }
      }
      return edge
   })

  return { nodes: positionedNodes, edges: routedEdges }
}
