import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Background, ReactFlow, ReactFlowProvider, type Edge, type Node, useReactFlow } from 'reactflow'
import { Maximize2, Minimize2 } from 'lucide-react'

import { Button, Spinner } from '@heroui/react'
import { useModelManifest, useModelTraceSummary } from '../../data/queries'
import { useExplorerStore } from '../explorer/store'
import { FlowEdge } from '../graph/FlowEdge'
import { layoutGraph } from '../graph/elk-layout'
import { ModuleNode } from '../graph/ModuleNode'
import type { GraphNodeData } from '../graph/types'
import { buildFlowGraph } from './flow-builder'
import { normalizeTraceTree } from './flow-normalize'

const nodeTypes = { module: ModuleNode }
const edgeTypes = { flow: FlowEdge }
const flowQueryGcTime = 0

function FlowCanvas({
  nodes,
  edges,
  fitViewKey,
}: {
  nodes: Node<GraphNodeData>[]
  edges: Edge[]
  fitViewKey?: string
}) {
  const { fitView } = useReactFlow()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const fitFrameRef = useRef<number | undefined>(undefined)
  const lastFitKeyRef = useRef<string | undefined>(undefined)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

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
    if (!fitViewKey || nodes.length === 0) return
    if (containerSize.width === 0 || containerSize.height === 0) return

    const nextFitKey = `${fitViewKey}:${containerSize.width}x${containerSize.height}`
    if (lastFitKeyRef.current === nextFitKey) return
    lastFitKeyRef.current = nextFitKey

    let innerFrame: number | undefined
    fitFrameRef.current = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(() => {
        fitView({ padding: 0.2, nodes, duration: 600 })
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
  }, [containerSize.height, containerSize.width, fitView, fitViewKey, nodes])

  return (
    <div ref={containerRef} className="h-full w-full" data-testid="graph-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        proOptions={{ hideAttribution: true }}
        minZoom={0.1}
        maxZoom={4}
      >
        <Background />
      </ReactFlow>
    </div>
  )
}

type FlowLayoutState = {
  nodes: Node<GraphNodeData>[]
  edges: Edge[]
  status: 'idle' | 'loading' | 'ready'
}

export function FlowWorkspace({ selectedModelId }: { selectedModelId?: string }) {
  const { t } = useTranslation()
  const setGraphMode = useExplorerStore((state) => state.setGraphMode)
  const layoutDirection = useExplorerStore((state) => state.layoutDirection)
  const graphFocusMode = useExplorerStore((state) => state.graphFocusMode)
  const setGraphFocusMode = useExplorerStore((state) => state.setGraphFocusMode)
  const { data: manifest, isLoading: manifestLoading, error: manifestError } = useModelManifest(
    selectedModelId,
    { gcTime: flowQueryGcTime },
  )
  const traceAvailable = Boolean(manifest?.trace?.enabled && manifest.trace?.summary_file)
  const {
    data: traceSummary,
    isLoading: traceLoading,
    error: traceError,
  } = useModelTraceSummary(selectedModelId, {
    gcTime: flowQueryGcTime,
    enabled: Boolean(selectedModelId) && !manifestLoading && traceAvailable,
    manifest,
  })

  const traceRoot = useMemo(() => normalizeTraceTree(traceSummary), [traceSummary])
  const flowGraph = useMemo(() => buildFlowGraph(traceRoot), [traceRoot])
  const error = manifestError ?? traceError
  const [layoutState, setLayoutState] = useState<FlowLayoutState>({ nodes: [], edges: [], status: 'idle' })
  const layoutRequestRef = useRef(0)
  const isLoading = Boolean(selectedModelId) && (manifestLoading || (traceAvailable && traceLoading || layoutState.status === 'loading'))
  const fitViewKey = useMemo(() => {
    if (layoutState.status !== 'ready' || layoutState.nodes.length === 0 || !selectedModelId) {
      return undefined
    }

    return [
      selectedModelId,
      layoutDirection,
      layoutState.nodes.length,
      layoutState.edges.length,
    ].join(':')
  }, [layoutDirection, layoutState.edges.length, layoutState.nodes.length, layoutState.status, selectedModelId])

  useEffect(() => {
    if (!traceAvailable || !flowGraph.layoutRoot || flowGraph.nodes.length === 0) {
      setLayoutState({ nodes: [], edges: [], status: 'idle' })
      return
    }

    const requestId = layoutRequestRef.current + 1
    layoutRequestRef.current = requestId
    setLayoutState((current) => ({ ...current, status: 'loading' }))

    const runtimeNodes: Node<GraphNodeData>[] = flowGraph.nodes.map((node) => {
      return {
        id: node.id,
        type: 'module',
        position: { x: node.x, y: node.y },
        data: {
          id: node.id,
          label: node.label,
          className: node.modulePath,
          kind: 'module',
          role: node.role,
          depth: node.depth,
          path: node.modulePath,
          tags: node.tags,
          hasChildren: false,
          isExpandable: false,
          isExpanded: false,
          summaryLines: node.summaryLines,
          branchHint: node.branchHint,
        },
        width: node.width,
        height: node.height,
        draggable: false,
        selectable: true,
      }
    })

    const runtimeEdges: Edge[] = flowGraph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'flow',
      data: {
        kind: 'flow',
        branchHint: flowGraph.nodes.find((node) => node.id === edge.source)?.branchHint ?? 'sequential',
      },
    }))

    let cancelled = false
    layoutGraph(runtimeNodes, runtimeEdges, flowGraph.layoutRoot, { direction: layoutDirection })
      .then(({ nodes, edges }) => {
        if (cancelled || layoutRequestRef.current !== requestId) return
        setLayoutState({ nodes, edges, status: 'ready' })
      })
      .catch(() => {
        if (cancelled || layoutRequestRef.current !== requestId) return
        setLayoutState({ nodes: runtimeNodes, edges: runtimeEdges, status: 'ready' })
      })

    return () => {
      cancelled = true
    }
  }, [flowGraph, layoutDirection, traceAvailable])

  if (!selectedModelId) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-bg text-center" data-testid="workspace-empty-flow">
        <div className="max-w-md space-y-3">
          <h3 className="text-text-main font-medium text-sm">{t('common.noModelSelected')}</h3>
          <p className="text-xs text-text-muted">{t('workspace.traceUnavailableHint')}</p>
          <div className="flex justify-center">
            <Button size="sm" variant="bordered" onPress={() => setGraphMode('structure')}>
              {t('workspace.structureMode')}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-bg text-center" data-testid="workspace-error-flow">
        <div className="max-w-md space-y-2">
          <h3 className="text-text-main font-medium text-sm">{t('workspace.traceUnavailable')}</h3>
          <p className="text-xs text-text-muted">{String(error)}</p>
        </div>
      </div>
    )
  }

  if (!isLoading && (!traceAvailable || !traceRoot)) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-bg text-center" data-testid="workspace-empty-flow">
        <div className="max-w-md space-y-3">
          <h3 className="text-text-main font-medium text-sm">{t('workspace.traceUnavailable')}</h3>
          <p className="text-xs text-text-muted">{t('workspace.traceUnavailableHint')}</p>
          <div className="flex justify-center">
            <Button size="sm" variant="bordered" onPress={() => setGraphMode('structure')}>
              {t('workspace.structureMode')}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const lastExitNode = [...flowGraph.nodes].reverse().find((node) => node.role === 'head')

  return (
    <div
      className="flex h-full w-full flex-col bg-bg"
      data-testid="workspace"
      data-graph-mode="flow"
      data-layout-status={isLoading ? 'loading' : 'ready'}
      data-selected-model-id={selectedModelId}
      data-graph-focus-mode={graphFocusMode ? 'true' : 'false'}
      data-graph-node-count={layoutState.nodes.length}
      data-graph-edge-count={layoutState.edges.length}
    >
      <div className="h-12 border-b border-border bg-panel-bg flex items-center justify-between px-4 shrink-0 z-20">
        <h1 className="font-semibold text-sm text-text-main flex items-center gap-2" data-testid="workspace-title">
          {manifest?.model.safe_id ?? '...'}
          <span className="text-[10px] uppercase font-mono bg-border/50 text-text-muted px-1.5 py-0.5 rounded">{t('workspace.flowMode')}</span>
        </h1>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={graphFocusMode ? 'solid' : 'bordered'}
            className={graphFocusMode ? 'bg-brand-primary text-white' : 'border-border text-text-main hover:bg-black/5 dark:hover:bg-white/5'}
            startContent={graphFocusMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            onPress={() => setGraphFocusMode(!graphFocusMode)}
            data-testid="graph-focus-toggle"
          >
            {graphFocusMode ? t('workspace.focusExit') : t('workspace.focusEnter')}
          </Button>
          <Button size="sm" variant="bordered" onPress={() => setGraphMode('structure')}>
            {t('workspace.structureMode')}
          </Button>
        </div>
      </div>

      <div className="border-b border-border bg-panel-bg/70 px-4 py-2">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-xl border border-border bg-bg px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.12em] text-text-dim">{t('workspace.flowVisibleGraph')}</div>
              <div className="mt-1 text-sm font-medium text-text-main">{t('workspace.flowVisibleGraphValue', { nodes: layoutState.nodes.length, edges: layoutState.edges.length })}</div>
          </div>
          <div className="rounded-xl border border-border bg-bg px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.12em] text-text-dim">{t('workspace.flowSummary')}</div>
            <div className="mt-1 text-sm font-medium text-text-main truncate">{flowGraph.rootModulePath ?? '—'}</div>
          </div>
          <div className="rounded-xl border border-border bg-bg px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.12em] text-text-dim">{t('workspace.flowLeaf')}</div>
            <div className="mt-1 text-sm font-medium text-text-main truncate">{lastExitNode?.label ?? '—'}</div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        {isLoading && (
          <div
            className="absolute inset-0 z-20 flex items-center justify-center bg-screen/50 backdrop-blur-sm"
            data-testid="workspace-loading-flow"
          >
            <div className="flex flex-col items-center gap-3">
              <Spinner size="lg" />
              <p className="text-xs font-mono text-text-muted">{t('workspace.initializing')}</p>
            </div>
          </div>
        )}
        <ReactFlowProvider>
          <FlowCanvas nodes={layoutState.nodes} edges={layoutState.edges} fitViewKey={fitViewKey} />
        </ReactFlowProvider>
      </div>
    </div>
  )
}
