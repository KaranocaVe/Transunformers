import React from 'react'
import { useTranslation } from 'react-i18next'
import { Handle, Position, type NodeProps } from 'reactflow'
import { formatNumber } from '../utils/format'
import { useExplorerStore } from '../explorer/store'
import type { GraphNodeData } from './types'
import { branchLabelMap, getNodeTone, roleLabelMap } from './visuals'

// Helper to get a clean badge label
const resolveBadge = (data: GraphNodeData) => {
  if (data.kind === 'collapsed') return `x${data.repeat ?? 0}`
  if (data.tags && data.tags.length > 0) return data.tags[0]
  return data.kind ?? 'module'
}


export function ModuleNode({ data, selected }: NodeProps<GraphNodeData>) {
  const { t } = useTranslation()
  const graphColorMode = useExplorerStore((state) => state.graphColorMode)
  const params = data.parameters?.total?.count
  const buffers = data.buffers?.total?.count
  const badge = resolveBadge(data)
  const isCollapsed = data.kind === 'collapsed'
  const tone = getNodeTone(data, graphColorMode)
  const roleLabel = data.role ? t(roleLabelMap[data.role]) : null
  const branchLabel = data.branchHint ? t(branchLabelMap[data.branchHint]) : null
  const trainablePercent =
    data.trainableRatio !== null && data.trainableRatio !== undefined
      ? Math.round(data.trainableRatio * 100)
      : null
  
  return (
    <div
      data-id={data.id}
      data-node-id={data.id}
      data-path={data.path}
      data-kind={data.kind ?? 'module'}
      data-label={data.label}
      data-expandable={data.isExpandable ? 'true' : 'false'}
      data-expanded={data.isExpanded ? 'true' : 'false'}
      data-has-children={data.hasChildren ? 'true' : 'false'}
      data-selected={selected ? 'true' : 'false'}
      data-testid="module-node"
      className={`
        relative h-full w-full overflow-hidden rounded-md border text-xs transition-all duration-200
        ${selected 
          ? 'bg-panel-bg border-brand-primary ring-1 ring-brand-primary shadow-lg' 
          : `bg-panel-bg ${tone.frame} hover:border-brand-primary/50`
        }
        ${isCollapsed ? 'opacity-90' : ''}
      `}
    >
      {/* Handles */}
      {[Position.Top, Position.Bottom, Position.Left, Position.Right].map((pos) => (
        <React.Fragment key={pos}>
            <Handle
                id={`target-${pos}`}
                type="target"
                position={pos}
                isConnectable={false}
                className="opacity-0 w-full h-full border-none bg-transparent"
             />
             <Handle
                id={`source-${pos}`}
                type="source"
                position={pos}
                isConnectable={false}
                className="opacity-0 w-full h-full border-none bg-transparent"
             />
        </React.Fragment>
      ))}

      {/* Stacked effect for collapsed */}
      {isCollapsed && (
        <div className="absolute inset-x-1 -bottom-1 h-2 rounded-b-md border-x border-b border-border bg-panel-bg -z-10" />
      )}
      
      <div className="flex flex-col">
        {/* Header */}
        <div className={`px-3 py-2 border-b ${selected ? 'border-brand-primary/20 bg-brand-primary/5' : `${tone.header} border-border`}`}>
          <div className="mb-1 flex items-center justify-between gap-2">
             <div className="flex items-center gap-1.5 overflow-hidden">
               <span className={`rounded-full px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${tone.badge}`}>{badge}</span>
               {roleLabel && <span className={`truncate text-[10px] font-medium ${tone.text}`}>{roleLabel}</span>}
             </div>
              {isCollapsed && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
           </div>
           <div className="font-semibold text-sm text-text-main truncate" title={data.label}>
              {data.label}
           </div>
           <div className="mt-1 flex flex-wrap gap-1.5">
             {branchLabel ? (
               <span className="rounded-full bg-border/40 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-[0.12em] text-text-muted">
                 {branchLabel}
               </span>
             ) : null}
              {data.parameterScale && params ? (
                <span className="rounded-full bg-bg px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-[0.12em] text-text-muted">
                  P {data.parameterScale}
                </span>
             ) : null}
             {data.bufferScale && data.bufferScale !== 'none' ? (
               <span className="rounded-full bg-bg px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-[0.12em] text-text-muted">
                 B {data.bufferScale}
               </span>
             ) : null}
             {trainablePercent !== null ? (
               <span className="rounded-full bg-bg px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-[0.12em] text-text-muted">
                 T {trainablePercent}%
               </span>
             ) : null}
           </div>
        </div>

        {/* Body */}
        <div className="p-3 space-y-1.5">
           {data.className && (
             <div className="font-mono text-[11px] text-text-muted truncate" title={data.className}>
               {data.className}
             </div>
           )}
           
           {(params || buffers) && (
              <div className="flex items-center gap-3 pt-1 text-[11px] font-mono text-text-dim">
                 {params ? <span>{formatNumber(params)} P</span> : null}
                 {buffers ? <span>{formatNumber(buffers)} B</span> : null}
              </div>
            )}

            {data.summaryLines && data.summaryLines.length > 0 ? (
              <div className="space-y-0.5 pt-1 text-[10px] text-text-muted">
                {data.summaryLines.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            ) : null}
         </div>
       </div>
     </div>
  )
}
