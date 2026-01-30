import { Button, Divider, Spinner } from '@heroui/react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { ModelManifest } from '../../data'
import { formatBytes, formatNumber } from '../utils/format'
import type { GraphNodeData } from '../graph/types'

type NodeInspectorProps = {
  node?: GraphNodeData
  model?: ModelManifest['model']
  config?: Record<string, unknown> | null
  isConfigLoading?: boolean
  onRequestConfig?: () => void
  onSwitchToFull?: () => void
  viewMode: 'compact' | 'full'
}

const LIMIT = 8

export function NodeInspector({
  node,
  model,
  config,
  isConfigLoading,
  onRequestConfig,
  onSwitchToFull,
  viewMode,
}: NodeInspectorProps) {
  const { t } = useTranslation()
  const [showParams, setShowParams] = useState(false)
  const [showBuffers, setShowBuffers] = useState(false)

  useEffect(() => {
    setShowParams(false)
    setShowBuffers(false)
  }, [node?.id])

  const paramDetails = useMemo(
    () => node?.parameterDetails ?? [],
    [node?.parameterDetails],
  )
  const bufferDetails = useMemo(
    () => node?.bufferDetails ?? [],
    [node?.bufferDetails],
  )

  if (!node) {
    return (
      <div
        className="glass-panel h-full rounded-2xl p-4 text-xs text-slate-500"
        data-testid="inspector-empty"
      >
        {t('inspector.empty')}
      </div>
    )
  }

  const totalParams = node.parameters?.total?.count ?? null
  const totalParamBytes = node.parameters?.total?.size_bytes ?? null
  const totalBuffers = node.buffers?.total?.count ?? null
  const totalBufferBytes = node.buffers?.total?.size_bytes ?? null

  return (
    <div
      className="glass-panel h-full overflow-auto rounded-2xl p-4 text-xs"
      data-testid="inspector"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div
            className="font-display text-sm font-semibold text-slate-900"
            data-testid="inspector-title"
          >
            {node.label}
          </div>
          <div className="truncate text-[11px] text-slate-500">
            {node.className ?? 'Module'}
          </div>
          <div className="mt-1 font-mono text-[10px] text-slate-400">
            {node.path}
          </div>
        </div>
        {viewMode === 'compact' && onSwitchToFull ? (
          <Button size="sm" variant="flat" onPress={onSwitchToFull}>
            {t('inspector.fullTree')}
          </Button>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] text-slate-600">
        <div className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2">
          <div className="text-[10px] uppercase text-slate-400">
            {t('inspector.parameters')}
          </div>
          <div className="font-display text-sm text-slate-900">
            {formatNumber(totalParams)}
          </div>
          <div className="text-[10px] text-slate-500">
            {formatBytes(totalParamBytes)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2">
          <div className="text-[10px] uppercase text-slate-400">
            {t('inspector.buffers')}
          </div>
          <div className="font-display text-sm text-slate-900">
            {formatNumber(totalBuffers)}
          </div>
          <div className="text-[10px] text-slate-500">
            {formatBytes(totalBufferBytes)}
          </div>
        </div>
      </div>

      <Divider className="my-4" />

      <div className="space-y-3">
        <div className="text-[11px] uppercase tracking-wide text-slate-400">
          {t('inspector.details')}
        </div>
        <div className="grid gap-2 text-[11px] text-slate-600">
          <div>
            <span className="text-slate-400">{t('inspector.kind')}</span>{' '}
            {node.kind ?? '-'}
          </div>
          <div>
            <span className="text-slate-400">{t('inspector.tags')}</span>{' '}
            {node.tags?.length ? node.tags.join(', ') : '-'}
          </div>
          {model ? (
            <div>
              <span className="text-slate-400">{t('inspector.model')}</span>{' '}
              {model.class ?? '-'}
            </div>
          ) : null}
        </div>
      </div>

      <Divider className="my-4" />

      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-wide text-slate-400">
              {t('inspector.parameterDetails')}
            </div>
            {paramDetails.length > LIMIT ? (
              <button
                type="button"
                className="text-[10px] text-teal-600"
                onClick={() => setShowParams(!showParams)}
              >
                {showParams ? t('actions.collapse') : t('actions.expand')}
              </button>
            ) : null}
          </div>
          <div className="mt-2 space-y-2">
            {(showParams ? paramDetails : paramDetails.slice(0, LIMIT)).map(
              (item) => (
                <div
                  key={item.name}
                  className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2"
                >
                  <div className="font-mono text-[11px] text-slate-700">
                    {item.name}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {item.shape ? `[${item.shape.join(', ')}]` : '-'} ·{' '}
                    {item.dtype ?? '-'} · {formatNumber(item.numel)}
                  </div>
                </div>
              ),
            )}
            {paramDetails.length === 0 ? (
              <div className="text-[11px] text-slate-400">
                {t('inspector.none')}
              </div>
            ) : null}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-wide text-slate-400">
              {t('inspector.bufferDetails')}
            </div>
            {bufferDetails.length > LIMIT ? (
              <button
                type="button"
                className="text-[10px] text-teal-600"
                onClick={() => setShowBuffers(!showBuffers)}
              >
                {showBuffers ? t('actions.collapse') : t('actions.expand')}
              </button>
            ) : null}
          </div>
          <div className="mt-2 space-y-2">
            {(showBuffers ? bufferDetails : bufferDetails.slice(0, LIMIT)).map(
              (item) => (
                <div
                  key={item.name}
                  className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2"
                >
                  <div className="font-mono text-[11px] text-slate-700">
                    {item.name}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {item.shape ? `[${item.shape.join(', ')}]` : '-'} ·{' '}
                    {item.dtype ?? '-'} · {formatNumber(item.numel)}
                  </div>
                </div>
              ),
            )}
            {bufferDetails.length === 0 ? (
              <div className="text-[11px] text-slate-400">
                {t('inspector.none')}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <Divider className="my-4" />

      <div className="space-y-3">
        <div className="text-[11px] uppercase tracking-wide text-slate-400">
          {t('inspector.config')}
        </div>
        {config ? (
          <pre
            className="max-h-40 overflow-auto rounded-xl border border-slate-200 bg-slate-950/90 p-3 font-mono text-[10px] text-slate-200"
            data-testid="config-json"
          >
            {JSON.stringify(config, null, 2)}
          </pre>
        ) : (
          <Button
            size="sm"
            variant="flat"
            onPress={onRequestConfig}
            isDisabled={isConfigLoading}
            data-testid="load-config"
          >
            {isConfigLoading ? <Spinner size="sm" /> : t('inspector.loadConfig')}
          </Button>
        )}
      </div>
    </div>
  )
}
