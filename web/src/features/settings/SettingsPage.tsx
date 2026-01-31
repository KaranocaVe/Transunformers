import { useExplorerStore } from '../explorer/store'
import { useTheme } from '../../context/ThemeContext'
import { Moon, Sun, ArrowDown, ArrowRight, LayoutGrid, LayoutList } from 'lucide-react'

export default function SettingsPage() {
  const { theme, toggleTheme } = useTheme()
  const { 
    layoutDirection, 
    setLayoutDirection,
    viewMode,
    setViewMode
  } = useExplorerStore()

  return (
    <div className="flex flex-col h-full w-full bg-bg">
        {/* Header */}
        <div className="h-12 border-b border-border bg-panel-bg flex items-center px-4 shrink-0">
             <h1 className="font-semibold text-sm text-text-main flex items-center gap-2">
                 Settings
             </h1>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 md:p-8">
             <div className="max-w-2xl mx-auto space-y-8">
                
                {/* Appearance Section */}
                <section>
                    <h2 className="text-sm font-medium text-text-muted mb-4 uppercase tracking-wider">Appearance</h2>
                    <div className="bg-panel-bg border border-border rounded-lg overflow-hidden divide-y divide-border">
                        <div className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-md bg-bg text-text-main">
                                    {theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
                                </div>
                                <div>
                                    <div className="text-sm font-medium text-text-main">Theme Mode</div>
                                    <div className="text-xs text-text-muted">Switch between light and dark themes</div>
                                </div>
                            </div>
                            <button 
                                onClick={toggleTheme}
                                className="px-3 py-1.5 rounded text-xs font-medium bg-border/20 hover:bg-border/40 text-text-main transition-colors"
                            >
                                {theme === 'dark' ? 'Switch to Light' : 'Switch to Dark'}
                            </button>
                        </div>
                    </div>
                </section>

                {/* Graph Section */}
                <section>
                    <h2 className="text-sm font-medium text-text-muted mb-4 uppercase tracking-wider">Graph View</h2>
                    <div className="bg-panel-bg border border-border rounded-lg overflow-hidden divide-y divide-border">
                        
                        {/* Layout Direction */}
                        <div className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-md bg-bg text-text-main">
                                    {layoutDirection === 'DOWN' ? <ArrowDown size={18} /> : <ArrowRight size={18} />}
                                </div>
                                <div>
                                    <div className="text-sm font-medium text-text-main">Layout Direction</div>
                                    <div className="text-xs text-text-muted">Orientation of the node graph</div>
                                </div>
                            </div>
                            <div className="flex gap-1 bg-bg p-1 rounded-md border border-border">
                                <button
                                    onClick={() => setLayoutDirection('DOWN')}
                                    className={`p-1.5 rounded ${layoutDirection === 'DOWN' ? 'bg-brand-primary text-white shadow-sm' : 'text-text-muted hover:text-text-main'}`}
                                    title="Vertical (Top to Bottom)"
                                >
                                    <ArrowDown size={16} />
                                </button>
                                <button
                                    onClick={() => setLayoutDirection('RIGHT')}
                                    className={`p-1.5 rounded ${layoutDirection === 'RIGHT' ? 'bg-brand-primary text-white shadow-sm' : 'text-text-muted hover:text-text-main'}`}
                                    title="Horizontal (Left to Right)"
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
                                    <div className="text-sm font-medium text-text-main">Node Density</div>
                                    <div className="text-xs text-text-muted">Detail level for graph nodes</div>
                                </div>
                            </div>
                            <div className="flex gap-1 bg-bg p-1 rounded-md border border-border">
                                <button
                                    onClick={() => setViewMode('full')}
                                    className={`px-3 py-1 rounded text-[10px] font-medium transition-colors ${viewMode === 'full' ? 'bg-brand-primary text-white shadow-sm' : 'text-text-muted hover:text-text-main'}`}
                                >
                                    Detailed
                                </button>
                                <button
                                    onClick={() => setViewMode('compact')}
                                    className={`px-3 py-1 rounded text-[10px] font-medium transition-colors ${viewMode === 'compact' ? 'bg-brand-primary text-white shadow-sm' : 'text-text-muted hover:text-text-main'}`}
                                >
                                    Compact
                                </button>
                            </div>
                        </div>
                    </div>
                </section>
                
                <div className="text-center text-xs text-text-dim pt-8">
                     Transunformers Web v0.1.0 • Built with precision
                </div>

             </div>
        </div>
    </div>
  )
}
