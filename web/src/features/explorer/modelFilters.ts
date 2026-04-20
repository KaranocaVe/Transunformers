import type { ModelIndexEntry } from '../../data/types'
import type { SortMode } from './store'

export type ModelFilterState = {
  search: string
  sortBy: SortMode
  modelTypeFilter: string[]
  mappingFilter: string[]
}

export const getModelTypeLabel = (model: ModelIndexEntry) => model.model_type ?? 'unknown'

export const getPrimaryMappingLabel = (model: ModelIndexEntry) =>
  model.mapping_names?.[0] ?? 'unmapped'

export const collectFilterOptions = (models: ModelIndexEntry[]) => {
  const modelTypes = Array.from(new Set(models.map(getModelTypeLabel))).sort((a, b) =>
    a.localeCompare(b),
  )
  const mappings = Array.from(new Set(models.map(getPrimaryMappingLabel))).sort((a, b) =>
    a.localeCompare(b),
  )

  return { modelTypes, mappings }
}

export const filterAndSortModels = (
  models: ModelIndexEntry[],
  { search, sortBy, modelTypeFilter, mappingFilter }: ModelFilterState,
) => {
  const normalizedSearch = search.trim().toLowerCase()

  const filtered = models.filter((model) => {
    if (normalizedSearch) {
      const haystack = [
        model.id,
        model.safe_id,
        model.model_type ?? '',
        model.config_class ?? '',
        ...(model.mapping_names ?? []),
      ]
        .join(' ')
        .toLowerCase()

      if (!haystack.includes(normalizedSearch)) {
        return false
      }
    }

    if (modelTypeFilter.length > 0 && !modelTypeFilter.includes(getModelTypeLabel(model))) {
      return false
    }

    if (mappingFilter.length > 0 && !mappingFilter.includes(getPrimaryMappingLabel(model))) {
      return false
    }

    return true
  })

  const nameFor = (model: ModelIndexEntry) => model.safe_id ?? model.id

  return [...filtered].sort((a, b) => {
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
}
