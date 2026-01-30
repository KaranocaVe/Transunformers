import { Handle, Position, type NodeProps } from 'reactflow'

import { formatNumber } from '../utils/format'
import type { GraphNodeData } from './types'

export function GroupNode({ data }: NodeProps<GraphNodeData>) {
  const params = data.parameters?.total?.count
  const buffers = data.buffers?.total?.count
  const badge =
    data.tags && data.tags.length > 0
      ? data.tags[0]
      : data.kind ?? 'container'

  return (
    <div
      className="relative h-full w-full rounded-[28px] border-2 border-dashed border-slate-300/80 bg-transparent shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]"
      data-testid="group-node"
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
      <div className="absolute left-9 right-9 top-4 rounded-2xl border border-slate-200 bg-white/90 px-3 py-2 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-display text-xs text-slate-900">
              {data.label}
            </div>
            <div className="truncate text-[10px] text-slate-500">
              {data.className ?? 'Module'}
            </div>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-600">
            {badge}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
          <span>Params: {formatNumber(params)}</span>
          <span>Buffers: {formatNumber(buffers)}</span>
        </div>
      </div>
    </div>
  )
}
