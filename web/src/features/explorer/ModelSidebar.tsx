import { useMemo, useState } from 'react'
import {
  Search,
  Filter,
  Cpu,
  Database,
  Box,
  MoreHorizontal
} from 'lucide-react'
import { Button } from '@heroui/react'
import { useModelIndex } from '../../data/queries'
import { useExplorerStore, type SortMode } from './store'
import { formatNumber } from '../utils/format'
import {
    Dropdown,
    DropdownTrigger,
    DropdownMenu,
    DropdownItem
  } from "@heroui/react"

export function ModelSidebar() {
  const { data: index, isLoading } = useModelIndex()
  const { selectedModelId, setSelectedModelId, sortBy, setSortBy } = useExplorerStore()
  const [search, setSearch] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  
  // Simple filtering
  const models = index?.models ?? []
  const filteredModels = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    const base = normalizedSearch
      ? models.filter((model) =>
          model.id.toLowerCase().includes(normalizedSearch) ||
          model.safe_id.toLowerCase().includes(normalizedSearch),
        )
      : models

    const nameFor = (model: typeof models[number]) => model.safe_id ?? model.id

    return [...base].sort((a, b) => {
      if (sortBy === 'name') {
        return nameFor(a).localeCompare(nameFor(b))
      }

      const valA = sortBy === 'modules' ? (a.module_count ?? 0) : (a.parameter_count ?? 0)
      const valB = sortBy === 'modules' ? (b.module_count ?? 0) : (b.parameter_count ?? 0)

      if (valA === valB) {
        return nameFor(a).localeCompare(nameFor(b))
      }

      return valB - valA
    })
  }, [models, search, sortBy])

  return (
    <div className="h-full w-full flex flex-col border-r border-border bg-panel-bg">
      {/* Header */}
      <div className="flex flex-col gap-4 p-4 border-b border-border bg-panel-bg">
         <div className="flex items-center justify-between">
               <h1 className="font-semibold text-sm text-text-main tracking-wide uppercase">Data Deck</h1>
               <span className="text-[10px] font-mono text-brand-primary px-1.5 py-0.5 bg-brand-primary/10 rounded">ONLINE</span>
         </div>
         
         {/* Search */}
         <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="text-text-muted group-focus-within:text-brand-primary transition-colors" size={14} />
              </div>
              <input
               type="text"
               value={search}
               onChange={(e) => setSearch(e.target.value)}
               placeholder="Search models..."
               className="block w-full rounded-md bg-bg border border-border py-1.5 pl-9 pr-3 text-xs text-text-main placeholder:text-text-muted focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none transition-all font-mono"
              />
              <div className="absolute inset-y-0 right-0 pr-2 flex items-center">
               <Button isIconOnly size="sm" variant="light" className="h-6 w-6 min-w-0 text-text-muted hover:text-text-main" onPress={() => setShowFilters(!showFilters)}>
                 <Filter size={12} />
               </Button>
              </div>
         </div>
         
         {/* Filters (Mock) */}
         {showFilters && (
             <div className="flex items-center gap-2 pb-1 animate-in fade-in slide-in-from-top-1">
               <span className="text-[10px] font-mono text-text-muted uppercase">SORT_BY:</span>
               <select
                 className="bg-bg border border-border text-[10px] rounded px-2 py-0.5 text-text-main"
                 value={sortBy}
                 onChange={(event) => setSortBy(event.target.value as SortMode)}
               >
                   <option value="parameters">Parameters</option>
                   <option value="modules">Modules</option>
                   <option value="name">Name</option>
               </select>
             </div>
         )}
      </div>

      {/* Model List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
          {isLoading ? (
              <div className="p-4 text-center text-xs text-text-muted animate-pulse">Loading models...</div>
          ) : filteredModels?.map((model) => {
              const isSelected = selectedModelId === model.id
              return (
                  <div
                    key={model.id}
                    onClick={() => setSelectedModelId(model.id)}
                    className={`
                        group relative rounded-md border p-2 cursor-pointer transition-all duration-200
                        ${isSelected 
                           ? 'bg-brand-primary/5 border-brand-primary/30 shadow-sm' 
                           : 'bg-panel-bg border-border hover:border-text-muted/50 hover:bg-black/5 dark:hover:bg-white/5'
                        }
                    `}
                  >
                     {/* Active Indicator */}
                     {isSelected && (
                         <div className="absolute left-0 top-3 bottom-3 w-0.5 bg-brand-primary rounded-r-full" />
                     )}
                     
                     <div className="flex items-start justify-between mb-1">
                        <div className="flex items-center gap-2 overflow-hidden">
                            <Box size={14} className={isSelected ? 'text-brand-primary' : 'text-text-muted'} />
                            <span className={`font-semibold text-xs truncate pr-2 font-mono ${isSelected ? 'text-text-main' : 'text-text-muted group-hover:text-text-main'}`}>
                                {model.safe_id}
                            </span>
                        </div>
                        <Dropdown>
                          <DropdownTrigger>
                            <Button isIconOnly size="sm" variant="light" className="h-4 w-4 min-w-0 -mr-1 text-text-muted opacity-0 group-hover:opacity-100 data-[hover=true]:opacity-100">
                                <MoreHorizontal size={14} />
                            </Button>
                          </DropdownTrigger>
                          <DropdownMenu aria-label="Model actions">
                            <DropdownItem key="view">View Details</DropdownItem>
                            <DropdownItem key="export">Export Config</DropdownItem>
                          </DropdownMenu>
                        </Dropdown>
                     </div>

                     <div className="flex items-center gap-4 text-[10px] font-mono">
                           <div className={`flex items-center gap-1.5 ${isSelected ? 'text-text-main' : 'text-text-muted'}`}>
                               <Database size={12} />
                               <span>{formatNumber(model.parameter_count ?? 0)}</span>
                           </div>
                           <div className={`flex items-center gap-1.5 ${isSelected ? 'text-text-main' : 'text-text-muted'}`}>
                               <Cpu size={12} />
                               <span>{model.module_count ?? '-'}</span>
                           </div>
                     </div>
                  </div>
              )
          })}
          
          {filteredModels?.length === 0 && (
           <div className="flex flex-col items-center justify-center p-8 text-center text-text-muted font-mono">
               <Box size={24} className="mb-2 opacity-50" />
               <div className="text-xs">No models found</div>
           </div>
          )}
      </div>

      {/* Footer */}
      <div className="border-t border-border bg-panel-bg px-4 py-2 text-[9px] font-mono text-text-muted flex justify-between uppercase">
          <span>v2.0.0-pro</span>
          <span>Transunformers</span>
      </div>
    </div>
  )
}
