import type { ReactNode } from 'react'

import { formatNumber } from '../utils/format'

type DistributionItem = { label: string; value: number }

const mappingToneClasses = [
  'bg-brand-primary',
  'bg-brand-primary/80',
  'bg-brand-primary/65',
  'bg-brand-primary/50',
  'bg-brand-primary/35',
]

const getShare = (value: number, total: number) => (total > 0 ? Math.round((value / total) * 100) : 0)

const getBarWidth = (value: number, maxValue: number, minimumPercent = 0) => {
  if (value <= 0 || maxValue <= 0) return '0%'
  return `${Math.max((value / maxValue) * 100, minimumPercent)}%`
}

function OverviewChartCard({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string
  title: string
  children: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-border bg-panel-bg p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
      <div className="mb-5">
        <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-text-dim">{eyebrow}</div>
        <h2 className="mt-2 text-lg font-semibold text-text-main">{title}</h2>
      </div>
      {children}
    </div>
  )
}

function ChartEmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-bg/60 px-4 py-10 text-center text-sm text-text-muted">
      No matching models
    </div>
  )
}

export function FamilyRankingChart({
  eyebrow,
  title,
  items,
  activeLabel,
  onSelect,
}: {
  eyebrow: string
  title: string
  items: DistributionItem[]
  activeLabel?: string
  onSelect?: (label: string) => void
}) {
  const maxValue = Math.max(1, ...items.map((item) => item.value))
  const total = items.reduce((sum, item) => sum + item.value, 0)

  return (
    <OverviewChartCard eyebrow={eyebrow} title={title}>
      {items.length === 0 ? (
        <ChartEmptyState />
      ) : (
        <div className="space-y-3">
          {items.map((item, index) => {
            const isActive = activeLabel === item.label
            const share = getShare(item.value, total)
            const width = getBarWidth(item.value, maxValue, 10)

            return (
              <button
                key={item.label}
                type="button"
                aria-pressed={isActive}
                onClick={() => onSelect?.(item.label)}
                className={[
                  'w-full rounded-2xl border px-4 py-3 text-left transition-colors',
                  isActive
                    ? 'border-brand-primary/35 bg-brand-primary/5'
                    : 'border-border bg-bg/70 hover:border-brand-primary/20 hover:bg-bg',
                ].join(' ')}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex items-center gap-3">
                    <div className="w-7 shrink-0 text-[10px] font-mono uppercase tracking-[0.16em] text-text-dim">
                      {String(index + 1).padStart(2, '0')}
                    </div>
                    <div className="truncate text-sm font-medium text-text-main">{item.label}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-semibold text-text-main">{formatNumber(item.value)}</div>
                    <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-text-dim">
                      {share}%
                    </div>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-bg">
                  <div
                    className={isActive ? 'h-full rounded-full bg-brand-primary' : 'h-full rounded-full bg-brand-primary/45'}
                    style={{ width }}
                  />
                </div>
              </button>
            )
          })}
        </div>
      )}
    </OverviewChartCard>
  )
}

export function ParameterHistogramChart({
  eyebrow,
  title,
  items,
}: {
  eyebrow: string
  title: string
  items: DistributionItem[]
}) {
  const chartWidth = 420
  const chartHeight = 210
  const padding = { top: 20, right: 12, bottom: 48, left: 12 }
  const innerWidth = chartWidth - padding.left - padding.right
  const innerHeight = chartHeight - padding.top - padding.bottom
  const maxValue = Math.max(1, ...items.map((item) => item.value))
  const total = items.reduce((sum, item) => sum + item.value, 0)
  const barWidth = innerWidth / Math.max(items.length, 1)
  const gridValues = [0, 0.25, 0.5, 0.75, 1]

  return (
    <OverviewChartCard eyebrow={eyebrow} title={title}>
      <div className="rounded-2xl border border-border bg-bg/70 p-4">
        <div className="mb-4 flex items-center justify-between gap-3 text-[10px] font-mono uppercase tracking-[0.16em] text-text-dim">
          <span>Max {formatNumber(maxValue)}</span>
          <span>Total {formatNumber(total)}</span>
        </div>
        {total === 0 ? (
          <ChartEmptyState />
        ) : (
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-[220px] w-full overflow-visible">
            {gridValues.map((ratio) => {
              const y = padding.top + innerHeight - innerHeight * ratio
              return (
                <g key={ratio}>
                  <line
                    x1={padding.left}
                    x2={chartWidth - padding.right}
                    y1={y}
                    y2={y}
                    className="stroke-border"
                    strokeDasharray={ratio === 0 ? undefined : '4 4'}
                  />
                  <text
                    x={chartWidth - padding.right}
                    y={y - 6}
                    textAnchor="end"
                    className="fill-text-dim text-[10px] font-mono"
                  >
                    {formatNumber(Math.round(maxValue * ratio))}
                  </text>
                </g>
              )
            })}
            {items.map((item, index) => {
              const rawHeight = (item.value / maxValue) * innerHeight
              const height = item.value > 0 ? Math.max(rawHeight, 8) : 0
              const x = padding.left + index * barWidth + barWidth * 0.18
              const y = padding.top + innerHeight - height
              const width = barWidth * 0.64
              const labelX = padding.left + index * barWidth + barWidth / 2
              const shortLabel = item.label.length > 8 ? item.label.replace('-', '\u2011') : item.label

              return (
                <g key={item.label}>
                  {item.value > 0 ? (
                    <text
                      x={labelX}
                      y={Math.max(y - 8, padding.top + 12)}
                      textAnchor="middle"
                      className="fill-text-main text-[10px] font-mono"
                    >
                      {formatNumber(item.value)}
                    </text>
                  ) : null}
                  <rect
                    x={x}
                    y={y}
                    width={width}
                    height={height}
                    rx={8}
                    className="fill-brand-primary"
                    fillOpacity={0.78}
                  />
                  <text
                    x={labelX}
                    y={padding.top + innerHeight + 18}
                    textAnchor="middle"
                    className="fill-text-main text-[10px] font-mono"
                  >
                    {shortLabel}
                  </text>
                </g>
              )
            })}
          </svg>
        )}
      </div>
    </OverviewChartCard>
  )
}

export function MappingShareChart({
  eyebrow,
  title,
  items,
  activeLabel,
  onSelect,
}: {
  eyebrow: string
  title: string
  items: DistributionItem[]
  activeLabel?: string
  onSelect?: (label: string) => void
}) {
  const total = items.reduce((sum, item) => sum + item.value, 0)

  return (
    <OverviewChartCard eyebrow={eyebrow} title={title}>
      {items.length === 0 ? (
        <ChartEmptyState />
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-bg/70 p-4">
            <div className="mb-3 flex items-center justify-between gap-3 text-[10px] font-mono uppercase tracking-[0.16em] text-text-dim">
              <span>{formatNumber(total)}</span>
              <span>{items.length}</span>
            </div>
            <div className="flex h-3 overflow-hidden rounded-full bg-bg">
              {items.map((item, index) => (
                <div
                  key={item.label}
                  className={mappingToneClasses[index % mappingToneClasses.length]}
                  style={{ width: total > 0 ? `${(item.value / total) * 100}%` : '0%' }}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {items.map((item, index) => {
              const share = getShare(item.value, total)
              const isActive = activeLabel === item.label
              const toneClass = mappingToneClasses[index % mappingToneClasses.length]
              const width = total > 0 ? `${Math.max((item.value / total) * 100, 8)}%` : '0%'

              return (
                <button
                  key={item.label}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => onSelect?.(item.label)}
                  className={[
                    'w-full rounded-2xl border px-4 py-3 text-left transition-colors',
                    isActive
                      ? 'border-brand-primary/35 bg-brand-primary/5'
                      : 'border-border bg-bg/70 hover:border-brand-primary/20 hover:bg-bg',
                  ].join(' ')}
                >
                  <div className="mb-3 flex items-start gap-3">
                    <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${toneClass}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="truncate text-sm font-medium text-text-main">{item.label}</div>
                        <div className="shrink-0 text-right">
                          <div className="text-sm font-semibold text-text-main">{formatNumber(item.value)}</div>
                          <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-text-dim">
                            {share}%
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-bg">
                    <div className={`h-full rounded-full ${toneClass}`} style={{ width }} />
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </OverviewChartCard>
  )
}
