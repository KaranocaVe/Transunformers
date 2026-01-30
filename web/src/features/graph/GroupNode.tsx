import React from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import type { GraphNodeData } from './types'

export function GroupNode({ data }: NodeProps<GraphNodeData>) {
  return (
    <div
      className="group relative h-full w-full rounded-lg border border-dashed border-border bg-black/5 dark:bg-white/2 transition-colors hover:border-text-muted hover:bg-black/5 dark:hover:bg-white/5"
      data-testid="group-node"
    >
      {/* Handles */}
      {[Position.Top, Position.Bottom, Position.Left, Position.Right].map((pos) => (
        <React.Fragment key={pos}>
            <Handle
                id={`target-${pos}`}
                type="target"
                position={pos}
                isConnectable={false}
                className="opacity-0"
             />
             <Handle
                id={`source-${pos}`}
                type="source"
                position={pos}
                isConnectable={false}
                className="opacity-0"
             />
        </React.Fragment>
      ))}

      {/* Label */}
      <div className="absolute -top-3 left-2 px-1 bg-screen">
          <div className="text-[10px] font-mono font-semibold text-text-muted uppercase tracking-wider flex items-center gap-2">
            {data.label}
          </div>
      </div>
    </div>
  )
}
