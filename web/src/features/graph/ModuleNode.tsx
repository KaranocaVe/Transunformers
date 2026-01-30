import React from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import { formatNumber } from '../utils/format'
import type { GraphNodeData } from './types'

// Helper to get a clean badge label
const resolveBadge = (data: GraphNodeData) => {
  if (data.kind === 'collapsed') return `x${data.repeat ?? 0}`
  if (data.tags && data.tags.length > 0) return data.tags[0]
  return data.kind ?? 'module'
}


export function ModuleNode({ data, selected }: NodeProps<GraphNodeData>) {
  const params = data.parameters?.total?.count
  const buffers = data.buffers?.total?.count
  const badge = resolveBadge(data)
  const isCollapsed = data.kind === 'collapsed'
  
  return (
    <div
      data-node-id={data.id}
      data-testid="module-node"
      className={`
        relative rounded-md border text-xs transition-all duration-200
        ${selected 
          ? 'bg-panel-bg border-brand-primary ring-1 ring-brand-primary shadow-lg' 
          : 'bg-panel-bg border-border hover:border-brand-primary/50'
        }
        ${isCollapsed ? 'opacity-90' : ''}
      `}
      style={{ minWidth: '160px', maxWidth: '240px' }}
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
        <div className={`px-3 py-2 border-b ${selected ? 'border-brand-primary/20 bg-brand-primary/5' : 'border-border bg-black/5 dark:bg-white/5'}`}>
          <div className="flex items-center justify-between gap-2 mb-0.5">
             <span className="font-mono text-[10px] uppercase tracking-wider text-text-dim">{badge}</span>
             {isCollapsed && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
          </div>
          <div className="font-semibold text-sm text-text-main truncate" title={data.label}>
             {data.label}
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
        </div>
      </div>
    </div>
  )
}
