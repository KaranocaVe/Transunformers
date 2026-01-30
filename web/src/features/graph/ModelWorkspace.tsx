import { Button, Spinner } from '@heroui/react'
import { formatNumber } from '../utils/format'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ReactFlow, {
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
import { Maximize2, Search } from 'lucide-react'

const nodeTypes = { module: ModuleNode, group: GroupNode }
const edgeTypes = { flow: FlowEdge }

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
  const { fitView, getZoom } = useReactFlow()
  const lastFitKeyRef = useRef<string | undefined>(undefined)
  const ignoreNextMoveRef = useRef(false)
  const zoomRef = useRef(1)

  const commitZoom = (nextZoom: number) => {
    if (Math.abs(nextZoom - zoomRef.current) < 0.02) return
    zoomRef.current = nextZoom
    onZoomChange(nextZoom)
  }

  useEffect(() => {
    if (!fitViewKey || nodes.length === 0) return
    if (lastFitKeyRef.current === fitViewKey) return
    lastFitKeyRef.current = fitViewKey
    const fitNodes = nodes
    requestAnimationFrame(() => {
      ignoreNextMoveRef.current = true
      fitView({ padding: 0.2, nodes: fitNodes, duration: 800 })
      requestAnimationFrame(() => { zoomRef.current = getZoom() })
    })
  }, [fitViewKey, nodes, fitView, getZoom, onZoomChange])

  return (
    <div className="relative h-full w-full bg-screen" data-testid="graph-canvas">
      {loading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-screen/50 backdrop-blur-sm">
           <div className="flex flex-col items-center gap-3">
             <Spinner size="lg" />
             <p className="text-xs font-mono text-text-muted">INITIALIZING...</p>
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
        onMoveEnd={(e, viewport) => !ignoreNextMoveRef.current && commitZoom(viewport.zoom)}
        onMoveStart={() => { ignoreNextMoveRef.current = false }}
        minZoom={0.1}
        maxZoom={4}
        proOptions={{ hideAttribution: true }}
        fitView
      />
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
    toggleExpanded,
  } = useExplorerStore()

  const { data: manifest } = useModelManifest(selectedModelId)
  
  const treeChunkKey = useMemo(() => {
    if (!selectedModelId) return undefined
    const items = manifest?.chunks?.items
    if (!items || items.length === 0) return 'modules.compact_tree'
    const hasCompact = items.some(item => item.key === 'modules.compact_tree' && item.present)
    return hasCompact ? 'modules.compact_tree' : 'modules.tree'
  }, [selectedModelId, manifest])

  const fullQuery = useModelChunk(selectedModelId, treeChunkKey)

  
  // Removed config related logic here

  const viewMode = treeChunkKey === 'modules.compact_tree' ? 'compact' : 'full'
  const autoDepth = 2

  const treeRaw = fullQuery.data
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
      setTimeout(() => {
        setLayoutedNodes([])
        setLayoutedEdges([])
      }, 0)
  }, [selectedModelId])

  useEffect(() => { previousLayoutRef.current = layoutedNodes }, [layoutedNodes])

  useEffect(() => {
    if (!graph) {
      setTimeout(() => { setLayoutedNodes([]); setLayoutedEdges([]) }, 0)
      return
    }
    let active = true
    setTimeout(() => { setLayouting(true) }, 0)
    layoutGraph(graph.nodes, graph.layoutEdges, graph.layoutRoot)
      .then(({ nodes: nextNodes, edges: nextEdges }) => {
        if (!active) return
        setLayoutedNodes(nextNodes)
        setLayoutedEdges(nextEdges)
      })
      .finally(() => { if (active) setLayouting(false) })
    return () => { active = false }
  }, [graph])

  const selectedNode = selectedNodeId ? graph?.nodeMap.get(selectedNodeId) : undefined
  const renderNodes = useMemo(() => layoutedNodes.map(n => ({ ...n, selected: n.id === selectedNodeId })), [layoutedNodes, selectedNodeId])

  useEffect(() => {
    if (selectedNodeId && graph && !graph.nodeMap.has(selectedNodeId)) {
      setSelectedNodeId(undefined)
    }
  }, [graph, selectedNodeId, setSelectedNodeId])

  if (!selectedModelId) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-bg text-center" data-testid="workspace-empty">
        <div className="max-w-xs space-y-3">
           <div className="mx-auto h-12 w-12 rounded bg-panel-border/50 flex items-center justify-center text-text-muted">
             <Search size={24} />
           </div>
           <h3 className="text-text-main font-medium text-sm">No Model Selected</h3>
           <p className="text-xs text-text-muted">{t('workspace.empty')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col bg-bg" data-testid="workspace">
      {/* Workspace Toolbar */}
      <div className="h-12 border-b border-border bg-panel-bg flex items-center justify-between px-4 shrink-0 z-20">
        <div className="flex items-center gap-3">
           <h1 className="font-semibold text-sm text-text-main flex items-center gap-2">
             {manifest?.model.safe_id ?? '...'}
             <span className="text-[10px] uppercase font-mono bg-border/50 text-text-muted px-1.5 py-0.5 rounded">Graph</span>
           </h1>
        </div>
        
        <div className="flex items-center gap-2">
           <Button size="sm" variant="light" isIconOnly className="text-text-muted hover:text-text-main">
              <Maximize2 size={16} />
           </Button>
           {manifest && (
            <div className="flex items-center gap-3 text-xs font-mono text-text-muted border-l border-border pl-3 ml-2">
               <div>{formatNumber(manifest.model.parameters?.count ?? 0)} Params</div>
            </div>
           )}
        </div>
      </div>

      <div className="flex-1 flex min-h-0 relative">
        {/* Graph Area */}
        <div className="flex-1 min-w-0 h-full relative">
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
              onZoomChange={() => {}}
              onClearSelection={() => setSelectedNodeId(undefined)}
              fitViewKey={selectedModelId}
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
}
