import { create } from 'zustand'

export type ViewMode = 'compact' | 'full'
export type LayoutDirection = 'DOWN' | 'RIGHT'
export type SortMode = 'name' | 'parameters' | 'modules'

type ExplorerState = {
  selectedModelId?: string
  selectedNodeId?: string
  viewMode: ViewMode
  layoutDirection: LayoutDirection
  zoom: number
  search: string
  sortBy: SortMode
  modelTypeFilter: string[]
  mappingFilter: string[]
  expandedNodes: Record<string, boolean>
  sidebarWidth: number
  showFilters: boolean
  setSelectedModelId: (modelId?: string) => void
  setSelectedNodeId: (nodeId?: string) => void
  setViewMode: (mode: ViewMode) => void
  setLayoutDirection: (direction: LayoutDirection) => void
  setZoom: (zoom: number) => void
  setSearch: (value: string) => void
  setSortBy: (mode: SortMode) => void
  setModelTypeFilter: (values: string[]) => void
  setMappingFilter: (values: string[]) => void
  toggleExpanded: (nodeId: string) => void
  clearExpanded: () => void
  setSidebarWidth: (width: number) => void
  setShowFilters: (show: boolean) => void
}

export const useExplorerStore = create<ExplorerState>((set) => ({
  viewMode: 'compact',
  layoutDirection: 'DOWN',
  zoom: 1,
  search: '',
  sortBy: 'parameters',
  modelTypeFilter: [],
  mappingFilter: [],
  expandedNodes: {},
  sidebarWidth: 360,
  showFilters: false,
  setSelectedModelId: (modelId) =>
    set({
      selectedModelId: modelId,
      selectedNodeId: undefined,
      expandedNodes: {},
      zoom: 1,
    }),
  setSelectedNodeId: (nodeId) => set({ selectedNodeId: nodeId }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setLayoutDirection: (direction) => set({ layoutDirection: direction }),
  setZoom: (zoom) => set({ zoom }),
  setSearch: (value) => set({ search: value }),
  setSortBy: (mode) => set({ sortBy: mode }),
  setModelTypeFilter: (values) => set({ modelTypeFilter: values }),
  setMappingFilter: (values) => set({ mappingFilter: values }),
  toggleExpanded: (nodeId) =>
    set((state) => ({
      expandedNodes: {
        ...state.expandedNodes,
        [nodeId]: !state.expandedNodes[nodeId],
      },
    })),
  clearExpanded: () => set({ expandedNodes: {} }),
  setSidebarWidth: (width) => set({ sidebarWidth: width }),
  setShowFilters: (show) => set({ showFilters: show }),
}))
