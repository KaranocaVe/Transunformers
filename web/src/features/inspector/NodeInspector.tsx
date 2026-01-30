import { useMemo } from 'react'
import {
  Cpu,
  Database,
  Info,
} from 'lucide-react'
import { formatBytes, formatNumber } from '../utils/format'
import type { GraphNodeData } from '../graph/types'
import type { ModelManifest } from '../../data/types'

interface NodeInspectorProps {
  node: GraphNodeData | undefined
  model: ModelManifest['model'] | undefined
  onSwitchToFull?: () => void
  viewMode: 'compact' | 'full'
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: any
  children: React.ReactNode
}) {
  return (
    <div className="border-b border-border last:border-0">
       <div className="flex items-center gap-2 px-4 py-2 bg-panel-bg text-text-muted text-xs font-medium uppercase tracking-wider">
          <Icon size={12} />
          {title}
       </div>
       <div className="p-4 pt-2">
          {children}
       </div>
    </div>
  )
}

function PropertyRow({ label, value, truncate = false }: { label: string, value: React.ReactNode, truncate?: boolean }) {
    return (
        <div className="flex items-start justify-between gap-4 py-1.5 text-xs">
            <span className="text-text-dim flex-shrink-0">{label}</span>
            <span className={`font-mono text-text-main text-right ${truncate ? 'truncate min-w-0' : ''}`}>
                {value}
            </span>
        </div>
    )
}

export function NodeInspector({
  node,
}: NodeInspectorProps) {
  const paramDetails = useMemo(() => node?.parameterDetails ?? [], [node?.parameterDetails])
  const bufferDetails = useMemo(() => node?.bufferDetails ?? [], [node?.bufferDetails])

  if (!node) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-text-muted p-8 text-center">
         <Info size={32} className="mb-3 opacity-20" />
         <p className="text-sm">Select a module to view details</p>
      </div>
    )
  }

  const totalParams = node.parameters?.total?.count ?? 0
  const totalParamBytes = node.parameters?.total?.size_bytes ?? 0
  
  return (
    <div className="h-full flex flex-col bg-panel-bg" data-testid="inspector">
      {/* Header */}
      <div className="border-b border-border p-4 bg-panel-bg">
         <div className="flex items-center gap-2 mb-2">
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold font-mono uppercase bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
               {node.kind ?? 'MODULE'}
            </span>
         </div>
         <h2 className="font-semibold text-lg text-text-main break-words leading-snug mb-1">
           {node.label}
         </h2>
         <div className="text-xs font-mono text-text-muted break-all select-all">
           {node.className || 'Unknown Class'}
         </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-px bg-border border-b border-border">
            <div className="bg-panel-bg p-3">
                <div className="text-[10px] text-text-dim uppercase tracking-wider mb-1">Parameters</div>
                <div className="text-xl font-mono text-text-main font-medium">{formatNumber(totalParams)}</div>
            </div>
            <div className="bg-panel-bg p-3">
                <div className="text-[10px] text-text-dim uppercase tracking-wider mb-1">Size</div>
                <div className="text-xl font-mono text-text-main font-medium">{formatBytes(totalParamBytes)}</div>
            </div>
        </div>

        {/* Sections */}
        <div className="bg-panel-bg">
           <Section title="Metadata" icon={Info}>
              <PropertyRow label="Path" value={node.path} truncate />
              <PropertyRow label="Depth" value={node.depth} />
              {node.tags && node.tags.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border">
                      <div className="text-[10px] text-text-dim mb-1.5">Tags</div>
                      <div className="flex flex-wrap gap-1">
                          {node.tags.map(tag => (
                              <span key={tag} className="px-1.5 py-0.5 rounded-sm bg-border/50 text-text-muted text-[10px] font-mono border border-border">
                                  #{tag}
                              </span>
                          ))}
                      </div>
                  </div>
              )}
           </Section>

           <Section title="Parameters" icon={Database}>
              {paramDetails.length > 0 ? (
                 <div className="space-y-1">
                    {paramDetails.map(p => (
                       <div key={p.name} className="p-2 rounded border border-border bg-black/5 dark:bg-white/2 hover:border-brand-primary/30 transition-colors">
                          <div className="flex justify-between items-start mb-1">
                             <div className="font-mono text-xs text-text-main font-medium truncate pr-2" title={p.name}>{p.name}</div>
                             <div className="text-[10px] bg-border px-1 rounded text-text-muted">{formatNumber(p.numel)}</div>
                          </div>
                          <div className="flex justify-between text-[10px] text-text-dim font-mono">
                              <span>{p.dtype}</span>
                              <span>[{p.shape?.join(', ')}]</span>
                          </div>
                       </div>
                    ))}
                 </div>
              ) : <div className="text-xs text-text-dim italic text-center py-2">No Parameters</div>}
           </Section>

           <Section title="Buffers" icon={Cpu}>
              {bufferDetails.length > 0 ? (
                 <div className="space-y-1">
                    {bufferDetails.map(b => (
                       <div key={b.name} className="p-2 rounded border border-border bg-black/5 dark:bg-white/2 hover:border-brand-primary/30 transition-colors">
                          <div className="flex justify-between items-start mb-1">
                             <div className="font-mono text-xs text-text-main font-medium truncate pr-2" title={b.name}>{b.name}</div>
                             <div className="text-[10px] bg-border px-1 rounded text-text-muted">{formatNumber(b.numel)}</div>
                          </div>
                          <div className="flex justify-between text-[10px] text-text-dim font-mono">
                              <span>{b.dtype}</span>
                              <span>[{b.shape?.join(', ')}]</span>
                          </div>
                       </div>
                    ))}
                 </div>
              ) : <div className="text-xs text-text-dim italic text-center py-2">No Buffers</div>}
           </Section>
        </div>
      </div>
    </div>
  )
}
