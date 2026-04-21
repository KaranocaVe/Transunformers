import assert from 'node:assert/strict'
import test from 'node:test'
import { Position, type Node } from 'reactflow'

import { useExplorerStore } from '../src/features/explorer/store.ts'
import {
  FLOW_EDGE_ROUTING_OWNER,
  buildGraph,
  getGraphNodeSize,
  type FlowEdgeData,
  type GraphRouteSection,
} from '../src/features/graph/graph-builder.ts'
import { flattenRouteSections } from '../src/features/graph/elk-layout.ts'
import { buildFlowEdgePath } from '../src/features/graph/FlowEdge.tsx'
import { layoutGraph } from '../src/features/graph/elk-layout.ts'
import { applySelectedNodeToLayoutNodes } from '../src/features/graph/selection.ts'
import { normalizeTree } from '../src/features/graph/tree.ts'
import type { RawNode } from '../src/features/graph/types.ts'

const resetExplorerStore = () => {
  useExplorerStore.setState(useExplorerStore.getInitialState())
}

const buildTestGraph = (tree: RawNode, viewMode: 'compact' | 'full' = 'compact') =>
  buildGraph(normalizeTree(tree, { collapseRepeats: viewMode === 'compact' }), {
    expanded: useExplorerStore.getState().expandedNodes,
    autoDepth: 2,
    viewMode,
    splitSize: 8,
  })

const readStyleDimension = (value: unknown) => {
  assert.equal(typeof value, 'number', 'expected node style dimensions to be numeric')
  return value
}

const boxesOverlap = (
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number },
) =>
  first.x < second.x + second.width &&
  first.x + first.width > second.x &&
  first.y < second.y + second.height &&
  first.y + first.height > second.y

test.beforeEach(() => {
  resetExplorerStore()
})

test('selection updates only replace the previously selected and next selected layout nodes', () => {
  const makeNode = (id: string): Node => ({
    id,
    type: 'module',
    position: { x: 0, y: 0 },
    data: { id, label: id, depth: 0, path: id, hasChildren: false, isExpandable: false, isExpanded: false },
  })

  const originalNodes = [makeNode('alpha'), makeNode('beta'), makeNode('gamma')]

  const withBetaSelected = applySelectedNodeToLayoutNodes(originalNodes, undefined, 'beta')
  assert.notStrictEqual(withBetaSelected, originalNodes)
  assert.strictEqual(withBetaSelected[0], originalNodes[0])
  assert.notStrictEqual(withBetaSelected[1], originalNodes[1])
  assert.strictEqual(withBetaSelected[2], originalNodes[2])
  assert.equal(withBetaSelected[1]?.selected, true)

  const withGammaSelected = applySelectedNodeToLayoutNodes(withBetaSelected, 'beta', 'gamma')
  assert.notStrictEqual(withGammaSelected, withBetaSelected)
  assert.strictEqual(withGammaSelected[0], withBetaSelected[0])
  assert.notStrictEqual(withGammaSelected[1], withBetaSelected[1])
  assert.notStrictEqual(withGammaSelected[2], withBetaSelected[2])
  assert.equal(withGammaSelected[1]?.selected, false)
  assert.equal(withGammaSelected[2]?.selected, true)

  assert.strictEqual(
    applySelectedNodeToLayoutNodes(withGammaSelected, 'gamma', 'gamma'),
    withGammaSelected,
  )
})

test('collapsed stack nodes switch from module cards to container groups when explicitly expanded', () => {
  const tree: RawNode = {
    name: 'model',
    path: 'model',
    children: [
      {
        name: 'encoder',
        path: 'model.encoder',
        children: Array.from({ length: 3 }, (_, index) => ({
          name: String(index),
          path: `model.encoder.${index}`,
          class: 'LayerBlock',
          index,
          children: [
            {
              name: 'self_attn',
              path: `model.encoder.${index}.self_attn`,
              class: 'SelfAttention',
              children: [],
            },
          ],
        })),
      },
    ],
  }

  const initialGraph = buildTestGraph(tree)
  const collapsedNode = Array.from(initialGraph.nodeMap.values()).find(
    (node) => node.kind === 'collapsed',
  )

  assert.ok(collapsedNode, 'expected a collapsed stack node in the compact graph')
  const initialRenderedNode = initialGraph.nodes.find((node) => node.id === collapsedNode.id)

  assert.ok(initialRenderedNode, 'expected the collapsed stack node to have a rendered node')
  assert.equal(collapsedNode.isExpandable, true)
  assert.equal(collapsedNode.isExpanded, false)
  assert.equal(initialRenderedNode.type, 'module')
  assert.equal(initialRenderedNode.zIndex, 2)

  useExplorerStore.getState().toggleExpanded(collapsedNode.id, collapsedNode.isExpanded)

  const expandedGraph = buildTestGraph(tree)
  const expandedCollapsedNode = expandedGraph.nodeMap.get(collapsedNode.id)
  const expandedRenderedNode = expandedGraph.nodes.find((node) => node.id === collapsedNode.id)

  assert.ok(expandedCollapsedNode, 'expected the collapsed stack node to remain in the graph')
  assert.ok(expandedRenderedNode, 'expected the expanded collapsed stack node to have a rendered node')
  assert.equal(expandedCollapsedNode.isExpanded, true)
  assert.equal(expandedCollapsedNode.hasChildren, true)
  assert.equal(expandedRenderedNode.type, 'group')
  assert.equal(expandedRenderedNode.zIndex, 1)
  assert.equal(expandedRenderedNode.draggable, false)
  assert.equal(expandedRenderedNode.selectable, false)
  assert.ok(
    Array.from(expandedGraph.nodeMap.keys()).some((id) => id.startsWith(`${collapsedNode.id}::`)),
    'expected expanding the collapsed stack node to materialize split child nodes',
  )
})

test('buildGraph derives branch hints, summary lines, and edge branch metadata for parallel structures', () => {
  const tree: RawNode = {
    name: 'model',
    path: 'model',
    children: [
      {
        name: 'experts',
        path: 'model.experts',
        tags: ['moe'],
        children: [
          {
            name: 'vision_tower',
            path: 'model.experts.vision_tower',
            tags: ['vision'],
            parameters: { total: { count: 1_500_000_000, size_bytes: 0, trainable: 750_000_000 } },
            children: [],
          },
          {
            name: 'text_tower',
            path: 'model.experts.text_tower',
            tags: ['text'],
            parameters: { total: { count: 800_000_000, size_bytes: 0, trainable: 800_000_000 } },
            children: [],
          },
        ],
      },
    ],
  }

  const graph = buildTestGraph(tree, 'full')
  const expertsNode = graph.nodeMap.get('model.experts')
  const firstFlowEdge = graph.edges.find((edge) => edge.id.startsWith('flow:')) as (typeof graph.edges)[number] & {
    data?: FlowEdgeData
  }

  assert.ok(expertsNode, 'expected experts group node')
  assert.equal(expertsNode.branchHint, 'parallel')
  assert.ok(expertsNode.summaryLines?.some((line) => line.includes('P')))
  assert.equal(expertsNode.parameterScale, 'large')
  assert.ok(firstFlowEdge?.data)
  assert.equal(firstFlowEdge.data?.branchHint, 'parallel')
})

test('first explicit collapse overrides auto-depth expansion until the model changes', () => {
  const tree: RawNode = {
    name: 'model',
    path: 'model',
    children: [
      {
        name: 'encoder',
        path: 'model.encoder',
        children: [
          { name: 'layer0', path: 'model.encoder.layer0', children: [] },
          { name: 'layer1', path: 'model.encoder.layer1', children: [] },
        ],
      },
    ],
  }

  useExplorerStore.getState().setSelectedModelId('model-a')

  const initialGraph = buildTestGraph(tree, 'full')
  const encoderNode = initialGraph.nodeMap.get('model.encoder')

  assert.ok(encoderNode, 'expected encoder node to be present')
  assert.equal(encoderNode.isExpanded, true)
  assert.equal(initialGraph.nodeMap.has('model.encoder.layer0'), true)

  useExplorerStore.getState().toggleExpanded(encoderNode.id, encoderNode.isExpanded)

  const collapsedGraph = buildTestGraph(tree, 'full')
  const collapsedEncoderNode = collapsedGraph.nodeMap.get('model.encoder')

  assert.ok(collapsedEncoderNode, 'expected encoder node after explicit collapse')
  assert.equal(collapsedEncoderNode.isExpanded, false)
  assert.equal(collapsedGraph.nodeMap.has('model.encoder.layer0'), false)
  assert.equal(useExplorerStore.getState().expandedNodes['model.encoder'], false)

  const relayoutGraph = buildTestGraph(tree, 'full')
  assert.equal(relayoutGraph.nodeMap.get('model.encoder')?.isExpanded, false)

  useExplorerStore.getState().setSelectedModelId('model-a')

  const sameModelGraph = buildTestGraph(tree, 'full')
  assert.equal(useExplorerStore.getState().expandedNodes['model.encoder'], false)
  assert.equal(sameModelGraph.nodeMap.get('model.encoder')?.isExpanded, false)

  useExplorerStore.getState().setSelectedModelId('other-model')

  const resetGraph = buildTestGraph(tree, 'full')
  assert.deepEqual(useExplorerStore.getState().expandedNodes, {})
  assert.equal(resetGraph.nodeMap.get('model.encoder')?.isExpanded, true)
})

test('buildGraph seeds React Flow node frames from the shared sizing contract', () => {
  const tree: RawNode = {
    name: 'model',
    path: 'model',
    children: [
      {
        name: 'encoder',
        path: 'model.encoder',
        children: [
          {
            name: 'attention_output_projection_with_a_significantly_longer_label',
            path: 'model.encoder.attention_output_projection_with_a_significantly_longer_label',
            class: 'ProjectionBlock',
            parameters: { total: { count: 4096, size_bytes: 0, trainable: 4096 } },
            children: [],
          },
        ],
      },
    ],
  }

  const normalizedTree = normalizeTree(tree, { collapseRepeats: false })
  const targetTreeNode = normalizedTree.children[0]?.children[0]

  assert.ok(targetTreeNode, 'expected long-label node in normalized tree')

  const graph = buildGraph(normalizedTree, {
    expanded: useExplorerStore.getState().expandedNodes,
    autoDepth: 2,
    viewMode: 'full',
    splitSize: 8,
  })
  const renderedNode = graph.nodes.find(
    (node) => node.id === targetTreeNode.path,
  )

  assert.ok(renderedNode, 'expected long-label node in graph output')

  const expectedSize = getGraphNodeSize(targetTreeNode)
  assert.equal(renderedNode.width, expectedSize.width)
  assert.equal(renderedNode.height, expectedSize.height)
  assert.equal(readStyleDimension(renderedNode.style?.width), expectedSize.width)
  assert.equal(readStyleDimension(renderedNode.style?.height), expectedSize.height)
})

test('layoutGraph keeps long-label siblings separated and inside their group bounds', async () => {
  const tree: RawNode = {
    name: 'model',
    path: 'model',
    children: [
      {
        name: 'encoder_group_with_a_label_that_should_define_the_minimum_container_width',
        path: 'model.encoder',
        children: [
          {
            name: 'attention_output_projection_with_a_significantly_longer_label',
            path: 'model.encoder.attention_output_projection_with_a_significantly_longer_label',
            class: 'ProjectionBlock',
            parameters: { total: { count: 4096, size_bytes: 0, trainable: 4096 } },
            children: [],
          },
          {
            name: 'feed_forward_output_projection_with_a_significantly_longer_label',
            path: 'model.encoder.feed_forward_output_projection_with_a_significantly_longer_label',
            class: 'ProjectionBlock',
            parameters: { total: { count: 4096, size_bytes: 0, trainable: 4096 } },
            children: [],
          },
        ],
      },
    ],
  }

  const graph = buildTestGraph(tree, 'full')
  const { nodes } = await layoutGraph(graph.nodes, graph.layoutEdges, graph.layoutRoot, {
    direction: 'DOWN',
  })

  const groupNode = nodes.find((node) => node.id === 'model.encoder')
  const firstChild = nodes.find(
    (node) => node.id === 'model.encoder.attention_output_projection_with_a_significantly_longer_label',
  )
  const secondChild = nodes.find(
    (node) => node.id === 'model.encoder.feed_forward_output_projection_with_a_significantly_longer_label',
  )

  assert.ok(groupNode, 'expected encoder group node after layout')
  assert.ok(firstChild, 'expected first long-label child after layout')
  assert.ok(secondChild, 'expected second long-label child after layout')

  const firstBox = {
    x: firstChild.position.x,
    y: firstChild.position.y,
    width: firstChild.width ?? 0,
    height: firstChild.height ?? 0,
  }
  const secondBox = {
    x: secondChild.position.x,
    y: secondChild.position.y,
    width: secondChild.width ?? 0,
    height: secondChild.height ?? 0,
  }

  assert.equal(boxesOverlap(firstBox, secondBox), false)

  const groupRight = groupNode.position.x + (groupNode.width ?? 0)
  const groupBottom = groupNode.position.y + (groupNode.height ?? 0)

  for (const child of [firstChild, secondChild]) {
    const childRight = child.position.x + (child.width ?? 0)
    const childBottom = child.position.y + (child.height ?? 0)

    assert.ok(child.position.x >= groupNode.position.x)
    assert.ok(child.position.y >= groupNode.position.y)
    assert.ok(childRight <= groupRight)
    assert.ok(childBottom <= groupBottom)
    assert.equal(readStyleDimension(child.style?.width), child.width)
    assert.equal(readStyleDimension(child.style?.height), child.height)
  }
})

test('layoutGraph routes visible parallel branch edges with distinct ELK paths', async () => {
  const tree: RawNode = {
    name: 'model',
    path: 'model',
    children: [
      {
        name: 'experts',
        path: 'model.experts',
        children: [
          {
            name: 'vision_branch',
            path: 'model.experts.vision_branch',
            class: 'VisionBranch',
            children: [],
          },
          {
            name: 'text_branch',
            path: 'model.experts.text_branch',
            class: 'TextBranch',
            children: [],
          },
        ],
      },
    ],
  }

  const graph = buildTestGraph(tree, 'full')
  const { edges } = await layoutGraph(graph.nodes, graph.layoutEdges, graph.layoutRoot, {
    direction: 'DOWN',
  })

  assert.equal(edges.length, 2)

  const routedEdges = edges.map((edge) => {
    const route = (edge.data as FlowEdgeData | undefined)?.route
    assert.ok(route, `expected ELK route data for ${edge.id}`)
    assert.equal((edge.data as FlowEdgeData | undefined)?.routingOwner, FLOW_EDGE_ROUTING_OWNER)
    assert.ok(route.sections.length > 0, `expected ELK route sections for ${edge.id}`)
    assert.ok(route.points.length >= 2, `expected ELK route points for ${edge.id}`)
    const lastPoint = route.points[route.points.length - 1]
    return {
      id: edge.id,
      startX: route.points[0]?.x ?? NaN,
      endX: lastPoint?.x ?? NaN,
      signature: route.points
        .map((point: { x: number; y: number }) => `${point.x},${point.y}`)
        .join(' -> '),
    }
  })

  assert.equal(new Set(routedEdges.map((edge) => edge.startX)).size, routedEdges.length)
  assert.equal(new Set(routedEdges.map((edge) => edge.endX)).size, routedEdges.length)
  assert.equal(new Set(routedEdges.map((edge) => edge.signature)).size, routedEdges.length)
})

test('layoutGraph keeps ELK route sections and flattened points aligned after normalization', async () => {
  const tree: RawNode = {
    name: 'model',
    path: 'model',
    children: [
      {
        name: 'experts',
        path: 'model.experts',
        children: [
          {
            name: 'vision_branch',
            path: 'model.experts.vision_branch',
            class: 'VisionBranch',
            children: [],
          },
          {
            name: 'text_branch',
            path: 'model.experts.text_branch',
            class: 'TextBranch',
            children: [],
          },
        ],
      },
    ],
  }

  const graph = buildTestGraph(tree, 'full')
  const { edges } = await layoutGraph(graph.nodes, graph.layoutEdges, graph.layoutRoot, {
    direction: 'DOWN',
  })

  for (const edge of edges) {
    const route = (edge.data as FlowEdgeData | undefined)?.route
    assert.ok(route, `expected route for ${edge.id}`)
    const flattened = flattenRouteSections(route.sections as GraphRouteSection[])
    assert.deepEqual(flattened, route.points, `expected sections and points to match for ${edge.id}`)
    assert.ok(route.points.every((point) => point.x >= 40 && point.y >= 40))
  }
})

test('layoutGraph assigns visible coordinates to a single-node root graph', async () => {
  const tree: RawNode = {
    name: 'single-root',
    path: 'single-root',
    class: 'SingleRoot',
    children: [],
  }

  const graph = buildTestGraph(tree, 'full')
  const { nodes } = await layoutGraph(graph.nodes, graph.layoutEdges, graph.layoutRoot, {
    direction: 'DOWN',
  })
  const singleNode = nodes.find((node) => node.id === 'single-root')

  assert.ok(singleNode, 'expected the single root node to remain in the laid out graph')
  assert.ok(Number.isFinite(singleNode.position.x))
  assert.ok(Number.isFinite(singleNode.position.y))
  assert.ok(singleNode.position.x >= 20)
  assert.ok(singleNode.position.y >= 20)
  assert.equal(readStyleDimension(singleNode.style?.width), singleNode.width)
  assert.equal(readStyleDimension(singleNode.style?.height), singleNode.height)
})

test('layoutGraph supports expanded collapsed-stack nodes in rightward layouts', async () => {
  const tree: RawNode = {
    name: 'model',
    path: 'model',
    children: [
      {
        name: 'encoder',
        path: 'model.encoder',
        children: Array.from({ length: 12 }, (_, index) => ({
          name: String(index),
          path: `model.encoder.${index}`,
          class: 'LayerBlock',
          index,
          children: [
            {
              name: 'self_attn',
              path: `model.encoder.${index}.self_attn`,
              class: 'SelfAttention',
              children: [],
            },
          ],
        })),
      },
    ],
  }

  const initialGraph = buildTestGraph(tree)
  const collapsedNode = Array.from(initialGraph.nodeMap.values()).find(
    (node) => node.kind === 'collapsed',
  )

  assert.ok(collapsedNode, 'expected a collapsed stack node before expansion')

  useExplorerStore.getState().toggleExpanded(collapsedNode.id, collapsedNode.isExpanded)

  const expandedGraph = buildTestGraph(tree)
  const { nodes } = await layoutGraph(expandedGraph.nodes, expandedGraph.layoutEdges, expandedGraph.layoutRoot, {
    direction: 'RIGHT',
  })

  assert.ok(nodes.some((node) => node.id === collapsedNode.id && node.data.isExpanded === true))
  assert.ok(nodes.some((node) => node.id.startsWith(`${collapsedNode.id}::`)))
})

test('FlowEdge only uses smooth fallback when route data is intentionally absent', () => {
  const sourceX = 10
  const sourceY = 20
  const targetX = 110
  const targetY = 120

  const routedPath = buildFlowEdgePath({
    id: 'flow:routed',
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    data: {
      kind: 'flow',
      routingOwner: FLOW_EDGE_ROUTING_OWNER,
      route: {
        owner: FLOW_EDGE_ROUTING_OWNER,
        sections: [
          {
            startPoint: { x: 12, y: 24 },
            endPoint: { x: 48, y: 72 },
            bendPoints: [{ x: 12, y: 48 }],
          },
        ],
        points: [
          { x: 12, y: 24 },
          { x: 12, y: 48 },
          { x: 48, y: 72 },
        ],
      },
    },
  })
  assert.equal(routedPath, 'M 12 24 L 12 48 L 48 72')

  const sectionOnlyPath = buildFlowEdgePath({
    id: 'flow:section-only',
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    data: {
      kind: 'flow',
      routingOwner: FLOW_EDGE_ROUTING_OWNER,
      route: {
        owner: FLOW_EDGE_ROUTING_OWNER,
        sections: [
          {
            startPoint: { x: 14, y: 28 },
            endPoint: { x: 52, y: 80 },
            bendPoints: [{ x: 14, y: 60 }],
          },
        ],
        points: [],
      },
    },
  })
  assert.equal(sectionOnlyPath, 'M 14 28 L 14 60 L 52 80')

  const guardedPath = buildFlowEdgePath({
    id: 'flow:missing-route',
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    data: {
      kind: 'flow',
      routingOwner: FLOW_EDGE_ROUTING_OWNER,
    },
  })
  assert.equal(guardedPath, `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`)

  const fallbackPath = buildFlowEdgePath({
    id: 'flow:intentional-fallback',
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    data: undefined,
  })
  assert.notEqual(fallbackPath, `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`)
})
