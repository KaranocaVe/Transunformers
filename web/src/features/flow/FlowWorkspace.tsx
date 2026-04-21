import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Background, ReactFlow, ReactFlowProvider, type Edge, type Node } from 'reactflow'

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

type FlowLayoutState = {
  nodes: Node<GraphNodeData>[]
  edges: Edge[]
  status: 'idle' | 'loading' | 'ready'
}

export function FlowWorkspace({ selectedModelId }: { selectedModelId?: string }) {
  const { t } = useTranslation()
  const setGraphMode = useExplorerStore((state) => state.setGraphMode)
  const layoutDirection = useExplorerStore((state) => state.layoutDirection)
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

  useEffect(() => {
    if (!traceAvailable || !flowGraph.layoutRoot || flowGraph.nodes.length === 0) {
      setLayoutState({ nodes: [], edges: [], status: 'idle' })
      return
    }

    const requestId = layoutRequestRef.current + 1
    layoutRequestRef.current = requestId
    setLayoutState((current) => ({ ...current, status: 'loading' }))

    const runtimeNodes: Node<GraphNodeData>[] = flowGraph.nodes.map((node) => ({
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
        branchHint: 'sequential',
      },
      width: node.width,
      height: node.height,
      draggable: false,
      selectable: true,
    }))

    const runtimeEdges: Edge[] = flowGraph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'flow',
      data: { kind: 'flow', branchHint: 'sequential' },
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
        data-graph-node-count={layoutState.nodes.length}
        data-graph-edge-count={layoutState.edges.length}
    >
      <div className="h-12 border-b border-border bg-panel-bg flex items-center justify-between px-4 shrink-0 z-20">
        <h1 className="font-semibold text-sm text-text-main flex items-center gap-2" data-testid="workspace-title">
          {manifest?.model.safe_id ?? '...'}
          <span className="text-[10px] uppercase font-mono bg-border/50 text-text-muted px-1.5 py-0.5 rounded">{t('workspace.flowMode')}</span>
        </h1>
        <Button size="sm" variant="bordered" onPress={() => setGraphMode('structure')}>
          {t('workspace.structureMode')}
        </Button>
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
          <div className="h-full w-full" data-testid="graph-canvas">
            <ReactFlow
              nodes={layoutState.nodes}
              edges={layoutState.edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView
              proOptions={{ hideAttribution: true }}
              minZoom={0.1}
              maxZoom={4}
            >
              <Background />
            </ReactFlow>
          </div>
        </ReactFlowProvider>
      </div>
    </div>
  )
}
