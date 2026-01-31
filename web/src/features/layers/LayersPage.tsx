import { useExplorerStore } from '../explorer/store'
import { useModelManifest, useModelChunk } from '../../data/queries'
import { useMemo, useState } from 'react'
import { normalizeTree } from '../graph/tree'
import type { RawNode } from '../graph/types'
import { formatNumber } from '../utils/format'
import { Search, ChevronDown, ChevronUp } from 'lucide-react'
import { flattenTree } from './utils'
import { Spinner } from '@heroui/react'

type SortField = 'params' | 'buffers' | 'path'
type SortOrder = 'asc' | 'desc'

export default function LayersPage() {
  const { selectedModelId, viewMode: preferredViewMode } = useExplorerStore()
  const { data: manifest, isLoading: isManifestLoading } = useModelManifest(selectedModelId)
  const isChunked = Boolean(manifest?.chunks?.items?.length)
  const { compactTree, fullTree } = useMemo(() => {
    const modules = manifest?.modules as Record<string, unknown> | undefined
    return {
      compactTree: modules?.compact_tree,
      fullTree: modules?.tree,
    }
  }, [manifest])
  
  // Logic to pick the tree chunk (reuse logic or simplify)
  const treeChunkKey = useMemo(() => {
    if (!selectedModelId || !isChunked) return undefined
    const items = manifest?.chunks?.items ?? []
    const hasCompact = items.some(item => item.key === 'modules.compact_tree' && item.present)
    const hasFull = items.some(item => item.key === 'modules.tree' && item.present)
    if (preferredViewMode === 'compact') {
      if (hasCompact) return 'modules.compact_tree'
      if (hasFull) return 'modules.tree'
    } else {
      if (hasFull) return 'modules.tree'
      if (hasCompact) return 'modules.compact_tree'
    }
    return undefined
  }, [selectedModelId, isChunked, manifest, preferredViewMode])

  const { data: chunkTreeRaw, isLoading: isTreeLoading } = useModelChunk(selectedModelId, treeChunkKey)
  const fallbackTreeRaw = useMemo(() => {
    if (preferredViewMode === 'compact') {
      return compactTree ?? fullTree
    }
    return fullTree ?? compactTree
  }, [compactTree, fullTree, preferredViewMode])
  const treeRaw = isChunked ? chunkTreeRaw : fallbackTreeRaw
  const isLoading = isManifestLoading || (isChunked ? isTreeLoading : false)

  const [sortField, setSortField] = useState<SortField>('params')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [searchTerm, setSearchTerm] = useState('')

  const layers = useMemo(() => {
    if (!treeRaw || typeof treeRaw !== 'object') return []
    // Normalize logic
    const root = normalizeTree(treeRaw as RawNode, { collapseRepeats: true })
    if (!root) return []
    
    // Flatten
    const flat = flattenTree(root)
    
    // Filter
    let result = flat
    if (searchTerm) {
        const lower = searchTerm.toLowerCase()
        result = result.filter(l => 
            l.path.toLowerCase().includes(lower) || 
            (l.className && l.className.toLowerCase().includes(lower))
        )
    }

    // Sort
    result.sort((a, b) => {
        let valA: number | string = a[sortField] ?? 0
        let valB: number | string = b[sortField] ?? 0
        
        if (sortField === 'path') {
             valA = a.path
             valB = b.path
             return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA)
        }
        
        // Numeric sort
        return sortOrder === 'asc' ? (valA as number) - (valB as number) : (valB as number) - (valA as number)
    })

    return result
  }, [treeRaw, sortField, sortOrder, searchTerm])

  const handleSort = (field: SortField) => {
      if (sortField === field) {
          setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
      } else {
          setSortField(field)
          setSortOrder('desc')
      }
  }
  
  const renderSortIcon = (field: SortField) => {
      if (sortField !== field) return <div className="w-4 h-4" />
      return sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
  }

  // Calculate max params for bar
  const maxParams = useMemo(() => Math.max(...layers.map(l => l.params), 1), [layers])

  if (!selectedModelId) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-bg text-center">
         <div className="max-w-xs space-y-3">
             <div className="mx-auto h-12 w-12 rounded bg-panel-border/50 flex items-center justify-center text-text-muted">
               <Search size={24} />
             </div>
             <h3 className="text-text-main font-medium text-sm">No Model Selected</h3>
             <p className="text-xs text-text-muted">Select a model from the sidebar to view layers.</p>
         </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full w-full bg-bg">
        {/* Header */}
        <div className="h-12 border-b border-border bg-panel-bg flex items-center justify-between px-4 shrink-0">
             <h1 className="font-semibold text-sm text-text-main flex items-center gap-2">
                 {manifest?.model.safe_id ?? '...'}
                 <span className="text-[10px] uppercase font-mono bg-border/50 text-text-muted px-1.5 py-0.5 rounded">Layers</span>
             </h1>
             <div className="relative w-64">
                <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                    <Search size={12} className="text-text-muted" />
                </div>
                <input 
                    type="text" 
                    placeholder="Filter layers..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full bg-bg border border-border rounded py-1 pl-7 pr-2 text-xs text-text-main placeholder:text-text-muted focus:border-brand-primary outline-none"
                />
             </div>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-auto p-4 relative">
             {isLoading ? (
                 <div className="absolute inset-0 flex items-center justify-center bg-screen/50 z-10">
                     <Spinner size="lg" />
                 </div>
             ) : (
                <div className="rounded-lg border border-border overflow-hidden bg-panel-bg shadow-sm">
                    <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-panel-bg border-b border-border text-text-muted uppercase tracking-wider sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th 
                                    className="px-4 py-3 font-medium cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 select-none transition-colors"
                                    onClick={() => handleSort('path')}
                                >
                                    <div className="flex items-center gap-2">Layer Path {renderSortIcon('path')}</div>
                                </th>
                                <th className="px-4 py-3 font-medium">Type</th>
                                <th 
                                    className="px-4 py-3 font-medium text-right cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 select-none transition-colors"
                                    onClick={() => handleSort('params')}
                                >
                                    <div className="flex items-center justify-end gap-2">{renderSortIcon('params')} Params</div>
                                </th>
                                <th className="px-4 py-3 font-medium text-right">Buffers</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border bg-bg">
                             {layers.map((layer) => (
                                 <tr key={layer.id} className="hover:bg-black/2 dark:hover:bg-white/2 transition-colors">
                                     <td className="px-4 py-2.5 text-text-main align-middle">
                                         <div className="truncate max-w-[300px]" title={layer.path}>{layer.path}</div>
                                     </td>
                                     <td className="px-4 py-2.5 text-text-muted align-middle">
                                         <span className="bg-brand-primary/10 text-brand-primary px-1.5 py-0.5 rounded-[4px] text-[10px] break-all">
                                             {layer.className || 'Container'}
                                         </span>
                                     </td>
                                     <td className="px-4 py-2.5 text-text-main text-right align-middle">
                                         <div className="flex flex-col items-end gap-0.5">
                                             <span>{formatNumber(layer.params)}</span>
                                             {/* Visual Bar */}
                                             <div className="w-24 h-1 bg-border rounded-full overflow-hidden">
                                                 <div 
                                                    className="h-full bg-brand-primary/60" 
                                                    style={{ width: `${(layer.params / maxParams) * 100}%` }}
                                                 />
                                             </div>
                                         </div>
                                     </td>
                                     <td className="px-4 py-2.5 text-text-dim text-right align-middle">
                                         {layer.buffers > 0 ? formatNumber(layer.buffers) : '-'}
                                     </td>
                                 </tr>
                             ))}
                             
                             {layers.length === 0 && (
                                 <tr>
                                     <td colSpan={4} className="px-4 py-8 text-center text-text-muted">
                                         No layers found matching your filter.
                                     </td>
                                 </tr>
                             )}
                        </tbody>
                    </table>
                </div>
             )}
        </div>
    </div>
  )
}
