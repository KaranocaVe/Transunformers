import React from 'react'
import { useTranslation } from 'react-i18next'
import { Handle, Position, type NodeProps } from 'reactflow'
import { useExplorerStore } from '../explorer/store'
import type { GraphNodeData } from './types'
import { branchLabelMap, getNodeTone, roleLabelMap } from './visuals'

export function GroupNode({ data, selected }: NodeProps<GraphNodeData>) {
  const { t } = useTranslation()
  const toggleExpanded = useExplorerStore((state) => state.toggleExpanded)
  const graphColorMode = useExplorerStore((state) => state.graphColorMode)
  const zoom = useExplorerStore((state) => state.zoom)
  const handleDoubleClick = () => {
    if (!data.isExpandable) {
      return
    }

    toggleExpanded(data.id, data.isExpanded)
  }

  const tone = getNodeTone(data, graphColorMode)
  const roleLabel = data.role ? t(roleLabelMap[data.role]) : null
  const branchLabel = data.branchHint ? t(branchLabelMap[data.branchHint]) : null
  const isOverview = zoom < 0.42

  return (
    <div
      className={`group relative h-full w-full rounded-lg border border-dashed transition-colors hover:border-text-muted hover:bg-black/5 dark:hover:bg-white/5 ${tone.frame}`}
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
          <div className="flex items-center gap-2 whitespace-nowrap" title={data.label}>
            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-mono font-semibold uppercase tracking-wider ${tone.badge}`}>
              {data.label}
            </span>
            {!isOverview && roleLabel ? <span className={`text-[10px] font-medium ${tone.text}`}>{roleLabel}</span> : null}
            {!isOverview && branchLabel ? <span className="text-[9px] font-mono uppercase tracking-[0.12em] text-text-dim">{branchLabel}</span> : null}
            {!isOverview && data.tagSummary?.map((tag) => (
              <span key={tag} className="text-[9px] font-mono uppercase tracking-[0.12em] text-text-dim">{tag}</span>
            ))}
          </div>
      </div>
    </div>
  )
}
