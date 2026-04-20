import React from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import { useExplorerStore } from '../explorer/store'
import type { GraphNodeData } from './types'

export function GroupNode({ data, selected }: NodeProps<GraphNodeData>) {
  const toggleExpanded = useExplorerStore((state) => state.toggleExpanded)
  const handleDoubleClick = () => {
    if (!data.isExpandable) {
      return
    }

    toggleExpanded(data.id, data.isExpanded)
  }

  return (
    <div
      className="group relative h-full w-full rounded-lg border border-dashed border-border bg-black/5 dark:bg-white/2 transition-colors hover:border-text-muted hover:bg-black/5 dark:hover:bg-white/5"
      onDoubleClick={handleDoubleClick}
      data-id={data.id}
      data-node-id={data.id}
      data-path={data.path}
      data-kind={data.kind ?? 'group'}
      data-label={data.label}
      data-expandable={data.isExpandable ? 'true' : 'false'}
      data-expanded={data.isExpanded ? 'true' : 'false'}
      data-has-children={data.hasChildren ? 'true' : 'false'}
      data-selected={selected ? 'true' : 'false'}
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
      <div className="absolute -top-3 left-2 max-w-[calc(100%-1rem)] bg-screen px-1">
          <div
            className="flex items-center gap-2 whitespace-nowrap text-[10px] font-mono font-semibold uppercase tracking-wider text-text-muted"
            title={data.label}
          >
            {data.label}
          </div>
      </div>
    </div>
  )
}
