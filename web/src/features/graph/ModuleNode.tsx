import { Handle, Position, type NodeProps } from 'reactflow'

import { formatNumber } from '../utils/format'
import type { GraphNodeData } from './types'

const resolveBadge = (data: GraphNodeData) => {
  if (data.kind === 'collapsed') {
    return `x${data.repeat ?? 0}`
  }
  if (data.tags && data.tags.length > 0) {
    return data.tags[0]
  }
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
      className={[
        'relative rounded-2xl border px-4 py-3 text-xs shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)]',
        'bg-white/90 backdrop-blur-sm',
        isCollapsed
          ? 'border-amber-200'
          : data.kind === 'leaf'
            ? 'border-slate-200'
            : 'border-teal-200',
        selected ? 'ring-2 ring-teal-400/60' : 'ring-0',
      ].join(' ')}
    >
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={false}
        className="opacity-0"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={false}
        className="opacity-0"
      />
      {isCollapsed ? (
        <>
          <span className="pointer-events-none absolute inset-0 translate-x-2 translate-y-2 rounded-2xl border border-amber-200/70 bg-amber-50/50" />
          <span className="pointer-events-none absolute inset-0 translate-x-1 translate-y-1 rounded-2xl border border-amber-200/80 bg-amber-50/80" />
        </>
      ) : null}
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-display text-sm text-slate-900">
              {data.label}
            </div>
            <div className="truncate text-[11px] text-slate-500">
              {data.className ?? 'Module'}
            </div>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-600">
            {badge}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
          <span>Params: {formatNumber(params)}</span>
          <span>Buffers: {formatNumber(buffers)}</span>
        </div>
      </div>
    </div>
  )
}
