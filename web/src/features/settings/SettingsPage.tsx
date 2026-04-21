import { useExplorerStore } from '../explorer/store'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../context/ThemeContext'
import { Moon, Sun, ArrowDown, ArrowRight, LayoutGrid, LayoutList, SwatchBook, Info } from 'lucide-react'
import i18n from '../../i18n'

export default function SettingsPage() {
  const { t } = useTranslation()
  const { theme, toggleTheme } = useTheme()
  const { 
    layoutDirection, 
    setLayoutDirection,
    viewMode,
    setViewMode,
    graphMode,
    setGraphMode,
    graphColorMode,
    setGraphColorMode,
    showGraphLegend,
    setShowGraphLegend,
  } = useExplorerStore()

  return (
    <div className="flex flex-col h-full w-full bg-bg">
        {/* Header */}
        <div className="h-12 border-b border-border bg-panel-bg flex items-center px-4 shrink-0">
             <h1 className="font-semibold text-sm text-text-main flex items-center gap-2">
                  {t('settings.title')}
             </h1>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 md:p-8">
             <div className="max-w-2xl mx-auto space-y-8">
                
                {/* Appearance Section */}
                <section>
                    <h2 className="text-sm font-medium text-text-muted mb-4 uppercase tracking-wider">{t('settings.appearance')}</h2>
                    <div className="bg-panel-bg border border-border rounded-lg overflow-hidden divide-y divide-border">
                        <div className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-md bg-bg text-text-main">
                                    {theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
                                </div>
                                <div>
                                    <div className="text-sm font-medium text-text-main">{t('settings.themeMode')}</div>
                                    <div className="text-xs text-text-muted">{t('settings.themeDescription')}</div>
                                </div>
                            </div>
                            <button 
                                onClick={toggleTheme}
                                className="px-3 py-1.5 rounded text-xs font-medium bg-border/20 hover:bg-border/40 text-text-main transition-colors"
                            >
                                {theme === 'dark' ? t('settings.switchToLight') : t('settings.switchToDark')}
                            </button>
                        </div>
                        <div className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-md bg-bg text-text-main font-mono text-xs">
                                    {i18n.language.startsWith('zh') ? '中' : 'EN'}
                                </div>
                                <div>
                                    <div className="text-sm font-medium text-text-main">{t('settings.language')}</div>
                                    <div className="text-xs text-text-muted">{t('settings.languageDescription')}</div>
                                </div>
                            </div>
                            <div className="flex gap-1 bg-bg p-1 rounded-md border border-border">
                                <button
                                    onClick={() => void i18n.changeLanguage('en')}
                                    className={`px-3 py-1 rounded text-[10px] font-medium transition-colors ${i18n.language.startsWith('en') ? 'bg-brand-primary text-white shadow-sm' : 'text-text-muted hover:text-text-main'}`}
                                >
                                    EN
                                </button>
                                <button
                                    onClick={() => void i18n.changeLanguage('zh')}
                                    className={`px-3 py-1 rounded text-[10px] font-medium transition-colors ${i18n.language.startsWith('zh') ? 'bg-brand-primary text-white shadow-sm' : 'text-text-muted hover:text-text-main'}`}
                                >
                                    中文
                                </button>
                            </div>
                        </div>

                    </div>
                </section>

                {/* Graph Section */}
                <section>
                    <h2 className="text-sm font-medium text-text-muted mb-4 uppercase tracking-wider">{t('settings.graphView')}</h2>
                    <div className="bg-panel-bg border border-border rounded-lg overflow-hidden divide-y divide-border">
                        
                        {/* Layout Direction */}
                        <div className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-md bg-bg text-text-main">
                                    <LayoutGrid size={18} />
                                </div>
                                <div>
                                    <div className="text-sm font-medium text-text-main">{t('settings.graphMode')}</div>
                                    <div className="text-xs text-text-muted">{t('settings.graphModeDescription')}</div>
                                </div>
                            </div>
                            <div className="flex gap-1 bg-bg p-1 rounded-md border border-border">
                                <button
                                    onClick={() => setGraphMode('structure')}
                                    className={`px-3 py-1 rounded text-[10px] font-medium transition-colors ${graphMode === 'structure' ? 'bg-brand-primary text-white shadow-sm' : 'text-text-muted hover:text-text-main'}`}
                                >
                                    {t('settings.graphModeStructure')}
                                </button>
                                <button
                                    onClick={() => setGraphMode('flow')}
                                    className={`px-3 py-1 rounded text-[10px] font-medium transition-colors ${graphMode === 'flow' ? 'bg-brand-primary text-white shadow-sm' : 'text-text-muted hover:text-text-main'}`}
                                >
                                    {t('settings.graphModeFlow')}
                                </button>
                            </div>
                        </div>

                        {/* Layout Direction */}
                        <div className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-md bg-bg text-text-main">
                                    {layoutDirection === 'DOWN' ? <ArrowDown size={18} /> : <ArrowRight size={18} />}
                                </div>
                                <div>
                                    <div className="text-sm font-medium text-text-main">{t('settings.layoutDirection')}</div>
                                    <div className="text-xs text-text-muted">{t('settings.layoutDescription')}</div>
                                </div>
                            </div>
                            <div className="flex gap-1 bg-bg p-1 rounded-md border border-border">
                                <button
                                    onClick={() => setLayoutDirection('DOWN')}
                                    className={`p-1.5 rounded ${layoutDirection === 'DOWN' ? 'bg-brand-primary text-white shadow-sm' : 'text-text-muted hover:text-text-main'}`}
                                    title={t('settings.layoutVertical')}
                                >
                                    <ArrowDown size={16} />
                                </button>
                                <button
                                    onClick={() => setLayoutDirection('RIGHT')}
                                    className={`p-1.5 rounded ${layoutDirection === 'RIGHT' ? 'bg-brand-primary text-white shadow-sm' : 'text-text-muted hover:text-text-main'}`}
                                    title={t('settings.layoutHorizontal')}
                                >
                                    <ArrowRight size={16} />
                                </button>
                            </div>
                        </div>

                        {/* Node Density */}
                        <div className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-md bg-bg text-text-main">
                                    {viewMode === 'full' ? <LayoutGrid size={18} /> : <LayoutList size={18} />}
                                </div>
                                <div>
                                    <div className="text-sm font-medium text-text-main">{t('settings.nodeDensity')}</div>
                                    <div className="text-xs text-text-muted">{t('settings.nodeDensityDescription')}</div>
                                </div>
                            </div>
                            <div className="flex gap-1 bg-bg p-1 rounded-md border border-border">
                                <button
                                    onClick={() => setViewMode('full')}
                                    className={`px-3 py-1 rounded text-[10px] font-medium transition-colors ${viewMode === 'full' ? 'bg-brand-primary text-white shadow-sm' : 'text-text-muted hover:text-text-main'}`}
                                >
                                    {t('settings.densityDetailed')}
                                </button>
                                <button
                                    onClick={() => setViewMode('compact')}
                                    className={`px-3 py-1 rounded text-[10px] font-medium transition-colors ${viewMode === 'compact' ? 'bg-brand-primary text-white shadow-sm' : 'text-text-muted hover:text-text-main'}`}
                                >
                                    {t('settings.densityCompact')}
                                </button>
                            </div>
                        </div>

                        <div className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-md bg-bg text-text-main">
                                    <SwatchBook size={18} />
                                </div>
                                <div>
                                    <div className="text-sm font-medium text-text-main">{t('settings.graphColorMode')}</div>
                                    <div className="text-xs text-text-muted">{t('settings.graphColorModeDescription')}</div>
                                </div>
                            </div>
                            <div className="flex gap-1 bg-bg p-1 rounded-md border border-border">
                                {(['role', 'parameters', 'trainable'] as const).map((mode) => (
                                    <button
                                        key={mode}
                                        onClick={() => setGraphColorMode(mode)}
                                        className={`px-3 py-1 rounded text-[10px] font-medium transition-colors ${graphColorMode === mode ? 'bg-brand-primary text-white shadow-sm' : 'text-text-muted hover:text-text-main'}`}
                                    >
                                        {mode === 'role' ? t('settings.graphColorRole') : mode === 'parameters' ? t('settings.graphColorParams') : t('settings.graphColorTrainable')}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-md bg-bg text-text-main">
                                    <Info size={18} />
                                </div>
                                <div>
                                    <div className="text-sm font-medium text-text-main">{t('settings.legendPanel')}</div>
                                    <div className="text-xs text-text-muted">{t('settings.legendPanelDescription')}</div>
                                </div>
                            </div>
                            <button 
                                onClick={() => setShowGraphLegend(!showGraphLegend)}
                                className="px-3 py-1.5 rounded text-xs font-medium bg-border/20 hover:bg-border/40 text-text-main transition-colors"
                            >
                                {showGraphLegend ? t('settings.legendHide') : t('settings.legendShow')}
                            </button>
                        </div>
                    </div>
                </section>
                
                <div className="text-center text-xs text-text-dim pt-8">
                      {t('settings.footer')}
                 </div>

             </div>
        </div>
    </div>
  )
}
