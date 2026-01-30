import { Spinner } from '@heroui/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  type Edge,
  type Node,
  useReactFlow,
} from 'reactflow'

import { useModelChunk, useModelManifest } from '../../data'
import { useExplorerStore } from '../explorer/store'
import { NodeInspector } from '../inspector/NodeInspector'
import { FlowEdge } from './FlowEdge'
import { GroupNode } from './GroupNode'
import { ModuleNode } from './ModuleNode'
import { buildGraph } from './graph-builder'
import { layoutGraph } from './elk-layout'
import { normalizeTree } from './tree'
import type { GraphNodeData, RawNode } from './types'

const nodeTypes = { module: ModuleNode, group: GroupNode }
const edgeTypes = { flow: FlowEdge }


function GraphCanvas({
  nodes,
  edges,
  loading,
  onNodeClick,
  onNodeDoubleClick,
  onZoomChange,
  onClearSelection,
  fitViewKey,
}: {
  nodes: Node<GraphNodeData>[]
  edges: Edge[]
  loading: boolean
  onNodeClick: (node: GraphNodeData) => void
  onNodeDoubleClick: (node: GraphNodeData) => void
  onZoomChange: (zoom: number) => void
  onClearSelection: () => void
  fitViewKey?: string
}) {
  const { fitView, getZoom } = useReactFlow()
  const lastFitKeyRef = useRef<string | undefined>(undefined)
  const ignoreNextMoveRef = useRef(false)
  const zoomRef = useRef(1)

  const commitZoom = (nextZoom: number, force = false) => {
    if (!force && Math.abs(nextZoom - zoomRef.current) < 0.02) {
      return
    }
    zoomRef.current = nextZoom
    onZoomChange(nextZoom)
  }

  useEffect(() => {
    if (!fitViewKey || nodes.length === 0) {
      return
    }
    if (lastFitKeyRef.current === fitViewKey) {
      return
    }
    lastFitKeyRef.current = fitViewKey
    const fitNodes = nodes
    const handle = requestAnimationFrame(() => {
      ignoreNextMoveRef.current = true
      fitView({ padding: 0.2, nodes: fitNodes })
      requestAnimationFrame(() => {
        zoomRef.current = getZoom()
      })
    })
    return () => cancelAnimationFrame(handle)
  }, [fitViewKey, nodes, fitView, getZoom, onZoomChange])

  return (
    <div className="relative h-full w-full" data-testid="graph-canvas">
      {loading ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-sm">
          <Spinner size="lg" />
        </div>
      ) : null}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={(_, node) => {
          onNodeClick(node.data)
        }}
        onNodeDoubleClick={(_, node) => {
          onNodeDoubleClick(node.data)
        }}
        onPaneClick={onClearSelection}
        onMoveEnd={() => {
          if (ignoreNextMoveRef.current) {
            ignoreNextMoveRef.current = false
            return
          }
          commitZoom(getZoom())
        }}
        onInit={(instance) => {
          zoomRef.current = instance.getZoom()
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="rgba(15, 23, 42, 0.08)" gap={32} />
        <MiniMap
          pannable
          nodeColor={(node) =>
            node.data.kind === 'group'
              ? '#e2e8f0'
              : node.data.kind === 'collapsed'
              ? '#f4b866'
              : node.data.kind === 'leaf'
                ? '#94a3b8'
                : '#14b8a6'
          }
        />
        <Controls
          position="bottom-right"
          onFitView={() => {
            ignoreNextMoveRef.current = true
            fitView({ padding: 0.2 })
            requestAnimationFrame(() => {
              zoomRef.current = getZoom()
            })
          }}
        />
      </ReactFlow>
    </div>
  )
}

export function ModelWorkspace() {
  const { t } = useTranslation()
  const {
    selectedModelId,
    expandedNodes,
    setSelectedNodeId,
    selectedNodeId,
    zoom,
    setZoom,
    toggleExpanded,
  } = useExplorerStore()

  const { data: manifest } = useModelManifest(selectedModelId)
  const treeChunkKey = useMemo(() => {
    if (!selectedModelId) return undefined
    const items = manifest?.chunks?.items
    if (!items || items.length === 0) {
      return 'modules.compact_tree'
    }
    const hasCompact = items.some(
      (item) => item.key === 'modules.compact_tree' && item.present,
    )
    return hasCompact ? 'modules.compact_tree' : 'modules.tree'
  }, [selectedModelId, manifest])
  const fullQuery = useModelChunk(selectedModelId, treeChunkKey)
  const [configRequested, setConfigRequested] = useState(false)
  const configQuery = useModelChunk(
    selectedModelId,
    configRequested ? 'model.config' : undefined,
  )

  useEffect(() => {
    setConfigRequested(false)
  }, [selectedModelId])

  const viewMode: 'compact' | 'full' =
    treeChunkKey === 'modules.compact_tree' ? 'compact' : 'full'

  const autoDepth = 2

  const treeRaw = fullQuery.data
  const loadError = treeRaw || fullQuery.isLoading ? null : fullQuery.error
  const treeRoot = useMemo(() => {
    if (!treeRaw || typeof treeRaw !== 'object') return null
    return normalizeTree(treeRaw as RawNode, {
      collapseRepeats: viewMode === 'compact',
    })
  }, [treeRaw, viewMode])
  const graph = useMemo(() => {
    if (!treeRoot) return null
    return buildGraph(treeRoot, {
      expanded: expandedNodes,
      autoDepth,
      viewMode,
      splitSize: 8,
    })
  }, [treeRoot, expandedNodes, viewMode, autoDepth])

  const [layoutedNodes, setLayoutedNodes] = useState<Node<GraphNodeData>[]>([])
  const [layoutedEdges, setLayoutedEdges] = useState<Edge[]>([])
  const [layouting, setLayouting] = useState(false)
  const previousLayoutRef = useRef<Node<GraphNodeData>[]>([])

  useEffect(() => {
    setLayoutedNodes([])
    setLayoutedEdges([])
  }, [selectedModelId])

  useEffect(() => {
    previousLayoutRef.current = layoutedNodes
  }, [layoutedNodes])

  useEffect(() => {
    if (!graph) {
      setLayoutedNodes([])
      setLayoutedEdges([])
      return
    }
    let active = true
    setLayouting(true)
    layoutGraph(graph.nodes, graph.layoutEdges, graph.layoutRoot)
      .then((nextNodes) => {
        if (!active) return
        const prevNodes = previousLayoutRef.current
        const anchorId = graph.layoutRoot.id
        const prevAnchor = prevNodes.find((node) => node.id === anchorId)
        const nextAnchor = nextNodes.find((node) => node.id === anchorId)
        let adjustedNodes = nextNodes
        if (prevAnchor && nextAnchor) {
          const dx = prevAnchor.position.x - nextAnchor.position.x
          const dy = prevAnchor.position.y - nextAnchor.position.y
          if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
            adjustedNodes = nextNodes.map((node) => ({
              ...node,
              position: {
                x: node.position.x + dx,
                y: node.position.y + dy,
              },
            }))
          }
        }
        setLayoutedNodes(adjustedNodes)
        setLayoutedEdges(graph.edges)
      })
      .finally(() => {
        if (active) {
          setLayouting(false)
        }
      })
    return () => {
      active = false
    }
  }, [graph])

  const selectedNode = selectedNodeId ? graph?.nodeMap.get(selectedNodeId) : undefined
  const renderNodes = useMemo(
    () =>
      layoutedNodes.map((node) => ({
        ...node,
        selected: node.id === selectedNodeId,
      })),
    [layoutedNodes, selectedNodeId],
  )

  useEffect(() => {
    if (selectedNodeId && graph && !graph.nodeMap.has(selectedNodeId)) {
      setSelectedNodeId(undefined)
    }
  }, [graph, selectedNodeId, setSelectedNodeId])

  if (!selectedModelId) {
    return (
      <div
        className="grid-backdrop flex h-full items-center justify-center rounded-3xl border border-slate-200 bg-white/70 p-8 text-center text-sm text-slate-500"
        data-testid="workspace-empty"
      >
        {t('workspace.empty')}
      </div>
    )
  }

  const modelMeta = manifest?.model

  return (
    <div
      className="grid-backdrop relative flex h-full flex-col gap-3 overflow-hidden rounded-3xl border border-slate-200 bg-white/70 p-4"
      data-testid="workspace"
    >
      <div className="flex flex-1 gap-3 overflow-hidden">
        <div className="relative flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white/90">
          <ReactFlowProvider>
            <GraphCanvas
              nodes={renderNodes}
              edges={layoutedEdges}
              loading={layouting || fullQuery.isLoading}
              onNodeClick={(node) => {
                if (node.hasChildren && node.kind !== 'collapsed') return
                setSelectedNodeId(node.id)
              }}
              onNodeDoubleClick={(node) => {
                if (node.kind === 'collapsed') return
                toggleExpanded(node.id)
              }}
              onZoomChange={(nextZoom) => {
                if (Math.abs(nextZoom - zoom) < 0.02) {
                  return
                }
                setZoom(nextZoom)
              }}
              onClearSelection={() => setSelectedNodeId(undefined)}
              fitViewKey={selectedModelId}
            />
          </ReactFlowProvider>
          {loadError ? (
            <div className="absolute left-4 top-4 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] text-rose-700">
              {t('status.error')}
            </div>
          ) : null}
          {fullQuery.isLoading ? (
            <div className="absolute left-4 top-4 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] text-amber-700">
              {t('workspace.loadingFull')}
            </div>
          ) : null}
        </div>

        <div className="w-80 shrink-0">
          <NodeInspector
            node={selectedNode}
            model={modelMeta}
            config={configQuery.data as Record<string, unknown>}
            isConfigLoading={configQuery.isLoading}
            onRequestConfig={() => setConfigRequested(true)}
            viewMode={viewMode}
          />
        </div>
      </div>
    </div>
  )
}
