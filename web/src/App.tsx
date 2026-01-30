import { Button, Chip } from '@heroui/react'
import { Outlet } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { useExplorerStore } from './features/explorer/store'
import { useModelManifest } from './data'
import { formatNumber } from './features/utils/format'

export default function App() {
  const { t, i18n } = useTranslation()
  const { selectedModelId, expandedNodes, clearExpanded } = useExplorerStore()
  const { data: manifest } = useModelManifest(selectedModelId)
  const isZh = i18n.resolvedLanguage?.toLowerCase().startsWith('zh') ?? false

  const handleToggleLanguage = () => {
    i18n.changeLanguage(isZh ? 'en' : 'zh')
  }

  const modelMeta = manifest?.model
  const moduleCount = manifest?.modules?.module_count ?? 0
  const hasExpanded = Object.values(expandedNodes).some(Boolean)

  return (
    <div className="flex h-screen flex-col overflow-hidden text-neutral-900">
      <header className="glass-panel sticky top-0 z-30">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <div>
              <div className="font-display text-lg font-semibold tracking-tight">
                {t('app.title')}
              </div>
              <div className="text-xs text-neutral-500">{t('app.tagline')}</div>
            </div>
            <Chip
              size="sm"
              variant="flat"
              className="border border-amber-200 bg-amber-50 text-amber-800"
            >
              BETA
            </Chip>
            {modelMeta ? (
              <>
                <div className="h-6 w-px bg-slate-200" />
                <div className="flex items-center gap-3">
                  <div className="min-w-0">
                    <div className="font-display text-sm font-semibold text-slate-900">
                      {modelMeta.class ?? selectedModelId}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {modelMeta.model_type ?? '-'} · {t('workspace.modules', { value: formatNumber(moduleCount) })}
                    </div>
                  </div>
                  <Chip size="sm" variant="flat" className="bg-slate-50 text-slate-600">
                    {t('workspace.params', {
                      value: formatNumber(modelMeta.parameters?.count ?? null),
                    })}
                  </Chip>
                  {modelMeta.config_class ? (
                    <Chip size="sm" variant="flat" className="bg-slate-50 text-slate-600">
                      {modelMeta.config_class}
                    </Chip>
                  ) : null}
                  <Button
                    size="sm"
                    variant="flat"
                    onPress={clearExpanded}
                    isDisabled={!hasExpanded}
                  >
                    {t('actions.collapseAll')}
                  </Button>
                </div>
              </>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="flat"
              onPress={() => window.open('https://github.com/KaranocaVe/Transunformers', '_blank')}
              className="gap-1"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
              </svg>
              GitHub
            </Button>
            <Button size="sm" variant="flat" onPress={handleToggleLanguage}>
              {t('actions.switchLanguage')}
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1 min-h-0 overflow-hidden px-6 pb-6 pt-4">
        <Outlet />
      </main>
    </div>
  )
}
