import { Button, Spinner } from '@heroui/react'
import { useNavigate } from '@tanstack/react-router'
import { formatNumber } from '../utils/format'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ReactFlow, {
  ReactFlowProvider,
  type Edge,
  type Node,
  useReactFlow,
} from 'reactflow'
import { modelDataClient, useModelChunk, useModelManifest } from '../../data'
import { useExplorerStore } from '../explorer/store'
import { NodeInspector } from '../inspector/NodeInspector'
import { FlowEdge } from './FlowEdge'
import { GroupNode } from './GroupNode'
import { ModuleNode } from './ModuleNode'
import { buildGraph } from './graph-builder'
import { layoutGraph } from './elk-layout'
import { applySelectedNodeToLayoutNodes } from './selection'
import { normalizeTree } from './tree'
import type { GraphNodeData, RawNode } from './types'
import { Maximize2, Search, Info } from 'lucide-react'
import { branchLabelMap, quantityLabelMap, roleLabelMap } from './visuals'

const nodeTypes = { module: ModuleNode, group: GroupNode }
const edgeTypes = { flow: FlowEdge }
const graphQueryGcTime = 0

type LayoutState = {
  nodes: Node<GraphNodeData>[]
  edges: Edge[]
  revision: number
  status: 'idle' | 'loading' | 'ready'
  modelId?: string
}

const isGraphNodeSelectable = (node: GraphNodeData) => {
  if (!node.hasChildren) {
    return true
  }

  if (node.kind !== 'collapsed') {
    return false
  }

  return !node.isExpanded
}

// ... (NodeBox helpers logic inline)





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
  const { t } = useTranslation()
  const { fitView, getZoom } = useReactFlow()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const lastFitKeyRef = useRef<string | undefined>(undefined)
  const ignoreNextMoveRef = useRef(false)
  const fitFrameRef = useRef<number | undefined>(undefined)
  const zoomRef = useRef(1)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

  const commitZoom = (nextZoom: number) => {
    if (Math.abs(nextZoom - zoomRef.current) < 0.02) return
    zoomRef.current = nextZoom
    onZoomChange(nextZoom)
  }

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const updateSize = (width: number, height: number) => {
      const nextWidth = Math.round(width)
      const nextHeight = Math.round(height)
      setContainerSize((current) => {
        if (current.width === nextWidth && current.height === nextHeight) {
          return current
        }
        return { width: nextWidth, height: nextHeight }
      })
    }

    updateSize(element.clientWidth, element.clientHeight)

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      updateSize(entry.contentRect.width, entry.contentRect.height)
    })
    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    return () => {
      if (fitFrameRef.current !== undefined) {
        cancelAnimationFrame(fitFrameRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!fitViewKey || loading || nodes.length === 0) return
    if (containerSize.width === 0 || containerSize.height === 0) return

    const nextFitKey = `${fitViewKey}:${containerSize.width}x${containerSize.height}`
    if (lastFitKeyRef.current === nextFitKey) return
    lastFitKeyRef.current = nextFitKey

    const fitNodes = nodes
    let innerFrame: number | undefined
    fitFrameRef.current = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(() => {
        ignoreNextMoveRef.current = true
        fitView({ padding: 0.2, nodes: fitNodes, duration: 800 })
        requestAnimationFrame(() => {
          zoomRef.current = getZoom()
        })
      })
    })

    return () => {
      if (fitFrameRef.current !== undefined) {
        cancelAnimationFrame(fitFrameRef.current)
        fitFrameRef.current = undefined
      }
      if (innerFrame !== undefined) {
        cancelAnimationFrame(innerFrame)
      }
    }
  }, [containerSize.height, containerSize.width, fitViewKey, getZoom, loading, nodes, fitView])

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full bg-screen"
      data-testid="graph-canvas"
      data-container-width={containerSize.width}
      data-container-height={containerSize.height}
    >
      {loading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-screen/50 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3">
             <Spinner size="lg" />
             <p className="text-xs font-mono text-text-muted">{t('workspace.initializing')}</p>
            </div>
         </div>
       )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={(_, node) => onNodeClick(node.data)}
        onNodeDoubleClick={(_, node) => onNodeDoubleClick(node.data)}
        onPaneClick={onClearSelection}
        onMoveEnd={(_, viewport) => !ignoreNextMoveRef.current && commitZoom(viewport.zoom)}
        onMoveStart={() => { ignoreNextMoveRef.current = false }}
        minZoom={0.1}
        maxZoom={4}
        proOptions={{ hideAttribution: true }}
      />
    </div>
  )
}

export const ModelWorkspace = memo(function ModelWorkspace({
  containerWidth,
}: {
  containerWidth?: number
}) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const selectedModelId = useExplorerStore((state) => state.selectedModelId)
  const expandedNodes = useExplorerStore((state) => state.expandedNodes)
  const setSelectedNodeId = useExplorerStore((state) => state.setSelectedNodeId)
  const selectedNodeId = useExplorerStore((state) => state.selectedNodeId)
  const toggleExpanded = useExplorerStore((state) => state.toggleExpanded)
  const layoutDirection = useExplorerStore((state) => state.layoutDirection)
  const preferredViewMode = useExplorerStore((state) => state.viewMode)
  const graphColorMode = useExplorerStore((state) => state.graphColorMode)
  const showGraphLegend = useExplorerStore((state) => state.showGraphLegend)
  const setShowGraphLegend = useExplorerStore((state) => state.setShowGraphLegend)

  const { data: manifest, isLoading: manifestLoading } = useModelManifest(selectedModelId, {
    gcTime: graphQueryGcTime,
  })
  const isChunked = Boolean(manifest?.chunks?.items?.length)

  const { compactTree, fullTree } = useMemo(() => {
    const modules = manifest?.modules as Record<string, unknown> | undefined
    return {
      compactTree: modules?.compact_tree,
      fullTree: modules?.tree,
    }
  }, [manifest])
  
  const treeChunkKey = useMemo(() => {
    if (!selectedModelId || !isChunked) return undefined
    const items = manifest?.chunks?.items ?? []
    const hasCompact = items.some(item => item.key === 'modules.compact_tree' && item.present)
    const hasFull = items.some(item => item.key === 'modules.tree' && item.present)
    if (preferredViewMode === 'compact') {
      if (hasCompact) return 'modules.compact_tree'
      if (hasFull) return 'modules.tree'
    } else {
      if (hasFull) return 'modules.tree'
      if (hasCompact) return 'modules.compact_tree'
    }
    return undefined
  }, [selectedModelId, isChunked, manifest, preferredViewMode])

  const treeQuery = useModelChunk(selectedModelId, treeChunkKey, {
    gcTime: graphQueryGcTime,
  })

  
  // Removed config related logic here

  const fallbackTreeRaw = useMemo(() => {
    if (preferredViewMode === 'compact') {
      return compactTree ?? fullTree
    }
    return fullTree ?? compactTree
  }, [compactTree, fullTree, preferredViewMode])

  const treeRaw = isChunked ? treeQuery.data : fallbackTreeRaw
  const usingCompactTree = isChunked
    ? treeChunkKey === 'modules.compact_tree'
    : Boolean(compactTree && fallbackTreeRaw === compactTree)
  const viewMode = usingCompactTree ? 'compact' : 'full'
  const autoDepth = 2

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

  const [layoutState, setLayoutState] = useState<LayoutState>({
    nodes: [],
    edges: [],
    revision: 0,
    status: 'idle',
    modelId: undefined,
  })
  const layoutRequestRef = useRef(0)
  const appliedSelectedNodeIdRef = useRef<string | undefined>(selectedNodeId)
  const latestSelectedNodeIdRef = useRef<string | undefined>(selectedNodeId)

  useEffect(() => {
    return () => {
      if (selectedModelId) {
        modelDataClient.releaseModel(selectedModelId)
      }
    }
  }, [selectedModelId])

  useEffect(() => {
    if (!selectedModelId || !treeChunkKey) {
      return
    }

    return () => {
      modelDataClient.releaseModel(selectedModelId, { includeManifest: false })
    }
  }, [selectedModelId, treeChunkKey])

  useEffect(() => {
    latestSelectedNodeIdRef.current = selectedNodeId
  }, [selectedNodeId])

  useEffect(() => {
    if (!graph) {
      layoutRequestRef.current += 1
      appliedSelectedNodeIdRef.current = undefined
      setLayoutState((current) => {
        if (
          current.nodes.length === 0 &&
          current.edges.length === 0 &&
          current.status === 'idle' &&
          current.modelId === selectedModelId
        ) {
          return current
        }
        return {
          nodes: [],
          edges: [],
          revision: current.revision,
          status: 'idle',
          modelId: selectedModelId,
        }
      })
      return
    }

    const requestId = layoutRequestRef.current + 1
    layoutRequestRef.current = requestId

    setLayoutState((current) => ({
      nodes: current.modelId === selectedModelId ? current.nodes : [],
      edges: current.modelId === selectedModelId ? current.edges : [],
      revision: current.revision,
      status: 'loading',
      modelId: selectedModelId,
    }))

    let cancelled = false

    layoutGraph(graph.nodes, graph.layoutEdges, graph.layoutRoot, { direction: layoutDirection })
      .then(({ nodes: nextNodes, edges: nextEdges }) => {
        if (cancelled || layoutRequestRef.current !== requestId) return
        const selectableSelectedNodeId =
          latestSelectedNodeIdRef.current && graph.nodeMap.get(latestSelectedNodeIdRef.current)
            ? isGraphNodeSelectable(graph.nodeMap.get(latestSelectedNodeIdRef.current)!)
              ? latestSelectedNodeIdRef.current
              : undefined
            : undefined

        const selectedLayoutNodes = applySelectedNodeToLayoutNodes(
          nextNodes,
          undefined,
          selectableSelectedNodeId,
        )
        appliedSelectedNodeIdRef.current = selectableSelectedNodeId
        setLayoutState((current) => ({
          nodes: selectedLayoutNodes,
          edges: nextEdges,
          revision: current.revision + 1,
          status: 'ready',
          modelId: selectedModelId,
        }))
      })
      .catch(() => {
        if (cancelled || layoutRequestRef.current !== requestId) return
        setLayoutState((current) => ({
          ...current,
          nodes: [],
          edges: [],
          status: 'ready',
          modelId: selectedModelId,
        }))
      })

    return () => {
      cancelled = true
    }
  }, [graph, layoutDirection, selectedModelId])

  useEffect(() => {
    if (!selectedNodeId || !graph) {
      return
    }

    const selectedGraphNode = graph.nodeMap.get(selectedNodeId)
    if (!selectedGraphNode) {
      setSelectedNodeId(undefined)
      return
    }

    if (!isGraphNodeSelectable(selectedGraphNode)) {
      setSelectedNodeId(undefined)
    }
  }, [graph, selectedNodeId, setSelectedNodeId])

  useEffect(() => {
    setLayoutState((current) => {
      const nextNodes = applySelectedNodeToLayoutNodes(
        current.nodes,
        appliedSelectedNodeIdRef.current,
        selectedNodeId,
      )
      if (nextNodes === current.nodes) {
        return current
      }
      return {
        ...current,
        nodes: nextNodes,
      }
    })
    appliedSelectedNodeIdRef.current = selectedNodeId
  }, [selectedNodeId])

  const selectedNode = selectedNodeId ? graph?.nodeMap.get(selectedNodeId) : undefined
  const inspectorOpen = Boolean(selectedNode)
  const loading = Boolean(selectedModelId) && (layoutState.status === 'loading' || manifestLoading || treeQuery.isLoading)
  const fitViewKey = useMemo(() => {
    if (layoutState.status !== 'ready' || layoutState.nodes.length === 0 || !selectedModelId) {
      return undefined
    }
    return [
      selectedModelId,
      layoutState.revision,
      layoutDirection,
      viewMode,
      containerWidth ?? 'auto',
      inspectorOpen ? 'inspector-open' : 'inspector-closed',
    ].join(':')
  }, [
    containerWidth,
    inspectorOpen,
    layoutDirection,
    layoutState.nodes.length,
    layoutState.revision,
    layoutState.status,
    selectedModelId,
    viewMode,
  ])
  const legendRoles = ['input', 'encoder', 'decoder', 'block', 'norm', 'head', 'aux'] as const

  if (selectedModelId && isChunked && treeQuery.error) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-bg text-center" data-testid="workspace-error">
        <div className="max-w-md space-y-2">
          <h3 className="text-text-main font-medium text-sm">{t('workspace.loadError')}</h3>
          <p className="text-xs text-text-muted">{String(treeQuery.error)}</p>
          <p className="text-[10px] font-mono text-text-dim">
            Chunk: {treeChunkKey ?? 'unknown'}
          </p>
        </div>
      </div>
    )
  }

  if (!selectedModelId) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-bg text-center" data-testid="workspace-empty">
        <div className="max-w-sm space-y-4">
           <div className="mx-auto h-12 w-12 rounded bg-panel-border/50 flex items-center justify-center text-text-muted">
             <Search size={24} />
           </div>
           <h3 className="text-text-main font-medium text-sm">{t('workspace.emptyTitle')}</h3>
           <p className="text-xs text-text-muted">{t('workspace.empty')}</p>
           <div className="flex justify-center">
             <Button size="sm" variant="bordered" onPress={() => navigate({ to: '/overview' })}>
               {t('common.openOverview')}
             </Button>
           </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex h-full w-full flex-col bg-bg"
      data-testid="workspace"
      data-layout-status={loading ? 'loading' : 'ready'}
      data-layout-revision={layoutState.revision}
      data-selected-model-id={selectedModelId ?? ''}
      data-layout-direction={layoutDirection}
      data-view-mode={viewMode}
      data-inspector-open={inspectorOpen ? 'true' : 'false'}
      data-graph-node-count={layoutState.nodes.length}
      data-graph-edge-count={layoutState.edges.length}
    >
      {/* Workspace Toolbar */}
      <div className="h-12 border-b border-border bg-panel-bg flex items-center justify-between px-4 shrink-0 z-20">
        <div className="flex items-center gap-3">
           <h1 className="font-semibold text-sm text-text-main flex items-center gap-2" data-testid="workspace-title">
              {manifest?.model.safe_id ?? '...'}
              <span className="text-[10px] uppercase font-mono bg-border/50 text-text-muted px-1.5 py-0.5 rounded">{t('workspace.titleBadge')}</span>
             </h1>
        </div>
        
        <div className="flex items-center gap-2">
           <Button
             size="sm"
             variant={showGraphLegend ? 'solid' : 'light'}
             className={showGraphLegend ? 'bg-brand-primary text-white' : 'text-text-muted hover:text-text-main'}
             startContent={<Info size={14} />}
             onPress={() => setShowGraphLegend(!showGraphLegend)}
           >
              {showGraphLegend ? t('settings.legendHide') : t('settings.legendShow')}
            </Button>
           <Button size="sm" variant="light" isIconOnly className="text-text-muted hover:text-text-main">
               <Maximize2 size={16} />
            </Button>
           {manifest && (
            <div className="flex items-center gap-3 text-xs font-mono text-text-muted border-l border-border pl-3 ml-2">
               <div>{t('workspace.params', { value: formatNumber(manifest.model.parameters?.count ?? 0) })}</div>
             </div>
            )}
        </div>
      </div>

      <div className="flex-1 flex min-h-0 relative">
        {/* Graph Area */}
        <div className="flex-1 min-w-0 h-full relative">
          {showGraphLegend && (
            <div className="pointer-events-none absolute right-3 top-3 z-10 w-72 rounded-2xl border border-border bg-panel-bg/94 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.12)] backdrop-blur-sm">
              <div className="mb-3 flex items-center gap-2 text-xs font-medium text-text-main">
                <Info size={14} className="text-brand-primary" />
                {t('workspace.guideTitle')}
              </div>
              <div className="space-y-4 text-[11px] text-text-muted">
                <div>
                  <div className="mb-2 font-mono uppercase tracking-[0.14em] text-text-dim">{t('workspace.guideCurrentView')}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-border bg-bg px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.12em] text-text-dim">{t('workspace.guideLayout')}</div>
                      <div className="mt-1 text-text-main">{layoutDirection === 'DOWN' ? t('settings.layoutVertical') : t('settings.layoutHorizontal')}</div>
                    </div>
                    <div className="rounded-xl border border-border bg-bg px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.12em] text-text-dim">{t('workspace.guideDensity')}</div>
                      <div className="mt-1 text-text-main">{viewMode === 'full' ? t('workspace.guideFull') : t('workspace.guideCompact')}</div>
                    </div>
                    <div className="col-span-2 rounded-xl border border-border bg-bg px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.12em] text-text-dim">{t('workspace.guideColorMode')}</div>
                      <div className="mt-1 text-text-main">{t(quantityLabelMap[graphColorMode])}</div>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="mb-2 font-mono uppercase tracking-[0.14em] text-text-dim">{t('workspace.guideNodeRoles')}</div>
                  <div className="space-y-1.5">
                    {legendRoles.map((role) => (
                      <div key={role} className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${role === 'input' ? 'bg-cyan-500' : role === 'encoder' ? 'bg-indigo-500' : role === 'decoder' ? 'bg-violet-500' : role === 'block' ? 'bg-emerald-500' : role === 'norm' ? 'bg-amber-500' : role === 'head' ? 'bg-rose-500' : 'bg-slate-500'}`} />
                        <span className="text-text-main">{t(roleLabelMap[role])}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 font-mono uppercase tracking-[0.14em] text-text-dim">{t('workspace.guideFlowCues')}</div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2"><span className="h-px w-6 bg-[#6366f1]" /><span className="text-text-main">{t(branchLabelMap.sequential)}</span></div>
                    <div className="flex items-center gap-2"><span className="h-px w-6 border-t-2 border-dashed border-[#8b5cf6]" /><span className="text-text-main">{t(branchLabelMap.parallel)}</span></div>
                    <div className="flex items-center gap-2"><span className="h-px w-6 border-t-2 border-dashed border-[#f59e0b]" /><span className="text-text-main">{t(branchLabelMap.bridge)}</span></div>
                    <div className="pt-1 leading-5 text-text-muted">{t('workspace.guideDescription')}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
          <ReactFlowProvider>
            <GraphCanvas
              nodes={layoutState.nodes}
              edges={layoutState.edges}
              loading={loading}
              onNodeClick={(node) => {
                if (!isGraphNodeSelectable(node)) return
                setSelectedNodeId(node.id)
              }}
              onNodeDoubleClick={(node) => {
                if (!node.isExpandable) return
                toggleExpanded(node.id, node.isExpanded)
              }}
              onZoomChange={() => {}}
              onClearSelection={() => setSelectedNodeId(undefined)}
              fitViewKey={fitViewKey}
            />
          </ReactFlowProvider>
        </div>

        {/* Inspector Sidebar (Right) */}
        {selectedNode && (
          <div className="w-80 border-l border-border bg-panel-bg shrink-0 flex flex-col h-full overflow-hidden transition-all duration-300">
             <NodeInspector
                key={selectedNode.id}
                node={selectedNode}
                model={manifest?.model}
                viewMode={viewMode}
              />
          </div>
        )}
      </div>
    </div>
  )
})
