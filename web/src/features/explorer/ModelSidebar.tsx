import { Button, Checkbox, Input, Spinner } from '@heroui/react'
import { useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useTranslation } from 'react-i18next'

import { useModelIndex } from '../../data'
import { useExplorerStore } from './store'

const normalizeText = (value: string) => value.toLowerCase().trim()

export function ModelSidebar() {
  const { t } = useTranslation()
  const { data, isLoading, error } = useModelIndex()
  const {
    selectedModelId,
    setSelectedModelId,
    search,
    setSearch,
    sortBy,
    setSortBy,
    modelTypeFilter,
    setModelTypeFilter,
    mappingFilter,
    setMappingFilter,
    showFilters,
    setShowFilters,
  } = useExplorerStore()

  const parentRef = useRef<HTMLDivElement | null>(null)

  const modelTypes = useMemo(() => {
    if (!data?.models) return []
    const types = new Set<string>()
    data.models.forEach((model) => {
      if (model.model_type) {
        types.add(model.model_type)
      }
    })
    return Array.from(types).sort()
  }, [data])

  const mappingOptions = useMemo(() => {
    if (!data?.models) return []
    const counts = new Map<string, number>()
    data.models.forEach((model) => {
      model.mapping_names?.forEach((name) => {
        counts.set(name, (counts.get(name) ?? 0) + 1)
      })
    })
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name]) => name)
  }, [data])

  const filtered = useMemo(() => {
    if (!data?.models) return []
    const query = normalizeText(search)
    const matchesSearch = (value: string) =>
      normalizeText(value).includes(query)
    return data.models
      .filter((model) => {
        if (!query) return true
        return (
          matchesSearch(model.safe_id) ||
          matchesSearch(model.id) ||
          (model.model_type ? matchesSearch(model.model_type) : false) ||
          (model.mapping_names
            ? model.mapping_names.some((name) => matchesSearch(name))
            : false)
        )
      })
      .filter((model) => {
        if (modelTypeFilter.length === 0) return true
        return model.model_type ? modelTypeFilter.includes(model.model_type) : false
      })
      .filter((model) => {
        if (mappingFilter.length === 0) return true
        return model.mapping_names
          ? model.mapping_names.some((name) => mappingFilter.includes(name))
          : false
      })
      .sort((a, b) => {
        if (sortBy === 'name') {
          return a.safe_id.localeCompare(b.safe_id)
        }
        if (sortBy === 'modules') {
          return (b.module_count ?? 0) - (a.module_count ?? 0)
        }
        return (b.parameter_count ?? 0) - (a.parameter_count ?? 0)
      })
  }, [data, search, sortBy, modelTypeFilter, mappingFilter])

  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 10,
  })

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-display text-sm font-semibold text-slate-900">
            {t('sidebar.title')}
          </div>
          <div className="text-[11px] text-slate-500">
            {t('sidebar.subtitle')}
          </div>
        </div>
        <Button
          size="sm"
          variant="flat"
          className="text-[11px]"
          onPress={() => setShowFilters(!showFilters)}
        >
          {showFilters ? t('sidebar.hideFilters') : t('sidebar.showFilters')}
        </Button>
      </div>

      <Input
        size="sm"
        placeholder={t('sidebar.searchPlaceholder')}
        value={search}
        onValueChange={setSearch}
        data-testid="model-search"
        classNames={{
          inputWrapper: 'border border-slate-200 bg-white/90',
        }}
      />

      {showFilters ? (
        <div className="max-h-[40vh] space-y-3 overflow-auto rounded-2xl border border-slate-200 bg-white/90 p-3 pr-2 text-xs">
          <div>
            <div className="mb-2 font-medium text-slate-700">
              {t('sidebar.sort')}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(['parameters', 'modules', 'name'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={[
                    'rounded-full border px-2 py-1 text-[11px]',
                    sortBy === mode
                      ? 'border-teal-300 bg-teal-50 text-teal-700'
                      : 'border-slate-200 text-slate-500',
                  ].join(' ')}
                  onClick={() => setSortBy(mode)}
                >
                  {t(`sidebar.sort.${mode}`)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 font-medium text-slate-700">
              {t('sidebar.modelType')}
            </div>
            <div className="grid grid-cols-1 gap-2">
              {modelTypes.slice(0, 8).map((type) => (
                <Checkbox
                  key={type}
                  isSelected={modelTypeFilter.includes(type)}
                  onValueChange={() => {
                    setModelTypeFilter(
                      modelTypeFilter.includes(type)
                        ? modelTypeFilter.filter((value) => value !== type)
                        : [...modelTypeFilter, type],
                    )
                  }}
                >
                  <span className="text-[11px] text-slate-600">{type}</span>
                </Checkbox>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 font-medium text-slate-700">
              {t('sidebar.mapping')}
            </div>
            <div className="grid grid-cols-1 gap-2">
              {mappingOptions.map((name) => (
                <Checkbox
                  key={name}
                  isSelected={mappingFilter.includes(name)}
                  onValueChange={() => {
                    setMappingFilter(
                      mappingFilter.includes(name)
                        ? mappingFilter.filter((value) => value !== name)
                        : [...mappingFilter, name],
                    )
                  }}
                >
                  <span className="text-[11px] text-slate-600">{name}</span>
                </Checkbox>
              ))}
            </div>
          </div>
          <Button
            size="sm"
            variant="flat"
            onPress={() => {
              setModelTypeFilter([])
              setMappingFilter([])
              setSearch('')
              setSortBy('parameters')
            }}
          >
            {t('sidebar.clear')}
          </Button>
        </div>
      ) : null}

      <div className="flex items-center justify-between text-[11px] text-slate-500">
        <span>{t('sidebar.count', { count: filtered.length })}</span>
        <span>{t('sidebar.total', { count: data?.count ?? 0 })}</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner size="sm" />
          </div>
        ) : error ? (
          <div className="text-xs text-rose-600">{t('status.error')}</div>
        ) : (
          <div
            ref={parentRef}
            className="relative min-h-0 flex-1 overflow-auto pr-2"
          >
            {filtered.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-slate-500">
                {t('sidebar.empty')}
              </div>
            ) : (
              <div
                style={{
                  height: `${rowVirtualizer.getTotalSize()}px`,
                  position: 'relative',
                }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const model = filtered[virtualRow.index]
                  const isActive = model?.id === selectedModelId
                  if (!model) return null
                  return (
                    <div
                      key={model.id}
                      className="absolute left-0 top-0 w-full"
                      style={{
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <div className="border-b border-slate-100">
                        <button
                          type="button"
                          data-testid="model-item"
                          data-model-id={model.id}
                          className={[
                            'w-full px-2 py-2.5 text-left transition hover:bg-slate-50',
                            isActive ? 'bg-teal-50' : '',
                          ].join(' ')}
                          onClick={() => setSelectedModelId(model.id)}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-display text-sm font-medium text-slate-900">
                                {model.safe_id}
                              </div>
                              <div className="mt-0.5 truncate text-[11px] text-slate-500">
                                {model.model_type ?? 'unknown'}
                              </div>
                            </div>
                          </div>
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
