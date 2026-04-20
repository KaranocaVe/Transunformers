import { useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import {
  ArrowRight,
  BarChart3,
  Boxes,
  Database,
  Filter,
  Network,
  Radar,
  Sparkles,
} from 'lucide-react'

import { Button } from '@heroui/react'

import { useModelIndex } from '../../data/queries'
import type { ModelIndexEntry } from '../../data/types'
import { formatNumber } from '../utils/format'
import { useExplorerStore } from '../explorer/store'
import {
  collectFilterOptions,
  filterAndSortModels,
  getModelTypeLabel,
  getPrimaryMappingLabel,
} from '../explorer/modelFilters'

const parameterBands = [
  { label: '<10M', min: 0, max: 10_000_000 },
  { label: '10M-100M', min: 10_000_000, max: 100_000_000 },
  { label: '100M-1B', min: 100_000_000, max: 1_000_000_000 },
  { label: '1B-10B', min: 1_000_000_000, max: 10_000_000_000 },
  { label: '>10B', min: 10_000_000_000, max: Number.POSITIVE_INFINITY },
] as const

const sumBy = (models: ModelIndexEntry[], accessor: (model: ModelIndexEntry) => number) =>
  models.reduce((total, model) => total + accessor(model), 0)

const toTopDistribution = (
  models: ModelIndexEntry[],
  resolver: (model: ModelIndexEntry) => string,
  limit: number,
) => {
  const counts = new Map<string, number>()
  models.forEach((model) => {
    const key = resolver(model)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  })

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, value]) => ({ label, value }))
}

const bandDistribution = (models: ModelIndexEntry[]) =>
  parameterBands.map((band) => ({
    label: band.label,
    value: models.filter((model) => {
      const value = model.parameter_count ?? 0
      return value >= band.min && value < band.max
    }).length,
  }))

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string
  value: string
  detail: string
  icon: typeof Database
}) {
  return (
    <div className="rounded-2xl border border-border bg-panel-bg p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] transition-transform duration-300 hover:-translate-y-0.5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-text-dim">{label}</div>
          <div className="mt-2 text-3xl font-semibold tracking-tight text-text-main">{value}</div>
        </div>
        <div className="rounded-xl border border-border bg-bg p-2 text-brand-primary">
          <Icon size={18} />
        </div>
      </div>
      <p className="text-xs text-text-muted">{detail}</p>
    </div>
  )
}

function DistributionBars({
  title,
  eyebrow,
  items,
  accentClass,
  onSelect,
}: {
  title: string
  eyebrow: string
  items: Array<{ label: string; value: number }>
  accentClass: string
  onSelect?: (label: string) => void
}) {
  const maxValue = Math.max(...items.map((item) => item.value), 1)

  return (
    <div className="rounded-2xl border border-border bg-panel-bg p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
      <div className="mb-5">
        <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-text-dim">{eyebrow}</div>
        <h2 className="mt-2 text-lg font-semibold text-text-main">{title}</h2>
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => onSelect?.(item.label)}
            className="w-full text-left"
          >
            <div className="mb-1 flex items-center justify-between gap-3 text-xs">
              <span className="truncate font-mono text-text-main">{item.label}</span>
              <span className="text-text-muted">{formatNumber(item.value)}</span>
            </div>
            <div className="h-2 rounded-full bg-bg">
              <div
                className={`h-full rounded-full ${accentClass}`}
                style={{ width: `${(item.value / maxValue) * 100}%` }}
              />
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

export default function OverviewPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: index, isLoading } = useModelIndex()
  const search = useExplorerStore((state) => state.search)
  const sortBy = useExplorerStore((state) => state.sortBy)
  const modelTypeFilter = useExplorerStore((state) => state.modelTypeFilter)
  const mappingFilter = useExplorerStore((state) => state.mappingFilter)
  const setModelTypeFilter = useExplorerStore((state) => state.setModelTypeFilter)
  const setMappingFilter = useExplorerStore((state) => state.setMappingFilter)
  const setSelectedModelId = useExplorerStore((state) => state.setSelectedModelId)

  const models = index?.models ?? []
  const filteredModels = useMemo(
    () => filterAndSortModels(models, { search, sortBy, modelTypeFilter, mappingFilter }),
    [mappingFilter, modelTypeFilter, models, search, sortBy],
  )
  const filterOptions = useMemo(() => collectFilterOptions(models), [models])

  const metrics = useMemo(() => {
    const visibleCount = filteredModels.length
    const totalParams = sumBy(filteredModels, (model) => model.parameter_count ?? 0)
    const totalModules = sumBy(filteredModels, (model) => model.module_count ?? 0)
    const successCount = filteredModels.filter((model) => model.status === 'ok').length
    const familyCount = new Set(filteredModels.map(getModelTypeLabel)).size

    return {
      visibleCount,
      totalParams,
      averageModules: visibleCount > 0 ? Math.round(totalModules / visibleCount) : 0,
      successRate: visibleCount > 0 ? Math.round((successCount / visibleCount) * 100) : 0,
      familyCount,
    }
  }, [filteredModels])

  const typeDistribution = useMemo(
    () => toTopDistribution(filteredModels, getModelTypeLabel, 6),
    [filteredModels],
  )
  const mappingDistribution = useMemo(
    () => toTopDistribution(filteredModels, getPrimaryMappingLabel, 5),
    [filteredModels],
  )
  const parameterDistribution = useMemo(() => bandDistribution(filteredModels), [filteredModels])
  const spotlightModels = filteredModels.slice(0, 5)

  const toggleSingleFilter = (
    current: string[],
    value: string,
    setter: (values: string[]) => void,
  ) => {
    setter(current[0] === value ? [] : [value])
  }

  return (
    <div className="h-full overflow-auto bg-bg">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-6 lg:px-10">
        <section className="overflow-hidden rounded-[28px] border border-border bg-panel-bg shadow-[0_24px_90px_rgba(15,23,42,0.12)]">
          <div className="grid gap-0 lg:grid-cols-[1.4fr_0.9fr]">
            <div className="relative p-8 lg:p-10">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.18),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(34,197,94,0.12),transparent_36%)]" />
              <div className="relative">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-primary/20 bg-brand-primary/10 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.22em] text-brand-primary">
                  <Sparkles size={12} />
                  {t('overview.badge')}
                </div>
                <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-text-main lg:text-5xl">
                  {t('overview.title')}
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-text-muted lg:text-base">
                  {t('overview.description')}
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Button
                    color="primary"
                    onPress={() => navigate({ to: '/graph' })}
                    endContent={<ArrowRight size={14} />}
                  >
                    {t('overview.enterGraph')}
                  </Button>
                  <Button variant="bordered" onPress={() => navigate({ to: '/layers' })}>
                    {t('overview.openLayers')}
                  </Button>
                </div>
              </div>
            </div>
            <div className="border-t border-border bg-bg/60 p-8 lg:border-l lg:border-t-0 lg:p-10">
              <div className="mb-4 text-[10px] font-mono uppercase tracking-[0.2em] text-text-dim">
                {t('overview.activeQuery')}
              </div>
              <div className="space-y-4">
                <div>
                  <div className="text-xs text-text-muted">{t('overview.search')}</div>
                  <div className="mt-1 text-sm font-medium text-text-main">
                    {search.trim() || t('overview.searchFallback')}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-text-muted">{t('overview.familyFilter')}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(modelTypeFilter.length > 0 ? modelTypeFilter : [t('common.allFamilies')]).map((value) => (
                      <span
                        key={value}
                        className="rounded-full border border-border bg-panel-bg px-3 py-1 text-[10px] font-mono uppercase tracking-[0.16em] text-text-main"
                      >
                        {value}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-text-muted">{t('overview.mappingFilter')}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(mappingFilter.length > 0 ? mappingFilter : [t('common.allMappings')]).map((value) => (
                      <span
                        key={value}
                        className="rounded-full border border-border bg-panel-bg px-3 py-1 text-[10px] font-mono uppercase tracking-[0.16em] text-text-main"
                      >
                        {value}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-panel-bg p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs font-medium text-text-main">
                    <Filter size={14} className="text-brand-primary" />
                    {t('overview.quickFocus')}
                  </div>
                  <p className="text-xs leading-6 text-text-muted">
                    {t('overview.quickFocusDescription')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label={t('overview.metricVisibleModels')}
            value={isLoading ? '...' : formatNumber(metrics.visibleCount)}
            detail={t('overview.metricVisibleModelsDetail', { count: models.length })}
            icon={Boxes}
          />
          <MetricCard
            label={t('overview.metricVisibleParameters')}
            value={isLoading ? '...' : formatNumber(metrics.totalParams)}
            detail={t('overview.metricVisibleParametersDetail')}
            icon={Database}
          />
          <MetricCard
            label={t('overview.metricArchitectureFamilies')}
            value={isLoading ? '...' : formatNumber(metrics.familyCount)}
            detail={t('overview.metricArchitectureFamiliesDetail', { count: filterOptions.modelTypes.length })}
            icon={Radar}
          />
          <MetricCard
            label={t('overview.metricParseSuccess')}
            value={isLoading ? '...' : `${metrics.successRate}%`}
            detail={t('overview.metricParseSuccessDetail', { count: metrics.averageModules })}
            icon={Network}
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.1fr_1.1fr_0.9fr]">
          <DistributionBars
            eyebrow={t('overview.familiesEyebrow')}
            title={t('overview.familiesTitle')}
            items={typeDistribution}
            accentClass="bg-gradient-to-r from-brand-primary via-brand-primary to-cyan-400"
            onSelect={(label) => toggleSingleFilter(modelTypeFilter, label, setModelTypeFilter)}
          />
          <DistributionBars
            eyebrow={t('overview.scaleEyebrow')}
            title={t('overview.scaleTitle')}
            items={parameterDistribution}
            accentClass="bg-gradient-to-r from-emerald-500 via-emerald-400 to-cyan-300"
          />
          <DistributionBars
            eyebrow={t('overview.mappingsEyebrow')}
            title={t('overview.mappingsTitle')}
            items={mappingDistribution}
            accentClass="bg-gradient-to-r from-amber-500 via-orange-400 to-pink-400"
            onSelect={(label) => toggleSingleFilter(mappingFilter, label, setMappingFilter)}
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-2xl border border-border bg-panel-bg p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-text-dim">
                  {t('overview.spotlightEyebrow')}
                </div>
                <h2 className="mt-2 text-lg font-semibold text-text-main">{t('overview.spotlightTitle')}</h2>
              </div>
              <Button variant="light" onPress={() => navigate({ to: '/graph' })}>
                {t('overview.spotlightCta')}
              </Button>
            </div>
            <div className="space-y-3">
              {spotlightModels.map((model, index) => (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => {
                    setSelectedModelId(model.id)
                    navigate({ to: '/graph' })
                  }}
                  className="flex w-full items-center gap-4 rounded-2xl border border-border bg-bg px-4 py-3 text-left transition-colors hover:border-brand-primary/40 hover:bg-brand-primary/5"
                >
                  <div className="w-8 text-xs font-mono text-text-dim">{String(index + 1).padStart(2, '0')}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-text-main">{model.safe_id}</div>
                    <div className="mt-1 flex flex-wrap gap-2 text-[10px] font-mono uppercase tracking-[0.12em] text-text-dim">
                      <span>{getModelTypeLabel(model)}</span>
                      <span>{getPrimaryMappingLabel(model)}</span>
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <div className="font-medium text-text-main">{formatNumber(model.parameter_count ?? 0)}</div>
                    <div className="text-text-muted">{t('overview.spotlightModules', { count: model.module_count ?? 0 })}</div>
                  </div>
                </button>
              ))}
              {spotlightModels.length === 0 && (
                <div className="rounded-2xl border border-dashed border-border bg-bg px-4 py-8 text-center text-sm text-text-muted">
                  {t('overview.spotlightEmpty')}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-panel-bg p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
            <div className="mb-5">
              <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-text-dim">{t('overview.usageEyebrow')}</div>
              <h2 className="mt-2 text-lg font-semibold text-text-main">{t('overview.usageTitle')}</h2>
            </div>
            <div className="space-y-4 text-sm leading-7 text-text-muted">
              <p>{t('overview.usageBody')}</p>
              <div className="rounded-2xl border border-border bg-bg p-4">
                <div className="mb-2 flex items-center gap-2 text-xs font-medium text-text-main">
                  <BarChart3 size={14} className="text-brand-primary" />
                  {t('overview.usageListTitle')}
                </div>
                <ol className="space-y-2 text-xs text-text-muted">
                  <li>{t('overview.usageStep1')}</li>
                  <li>{t('overview.usageStep2')}</li>
                  <li>{t('overview.usageStep3')}</li>
                </ol>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
