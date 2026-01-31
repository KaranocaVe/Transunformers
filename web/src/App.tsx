import { Outlet, useNavigate, useLocation } from '@tanstack/react-router'
import { 
  Network, 
  Settings, 
  Box, 
  Layers,
  Github,
  Sun,
  Moon
} from 'lucide-react'
import { ThemeProvider, useTheme } from './context/ThemeContext'
import type { LucideIcon } from 'lucide-react'

function SidebarItem({ icon: Icon, active, onClick, label }: { icon: LucideIcon, active?: boolean, onClick?: () => void, label?: string }) {
    return (
        <button 
          onClick={onClick}
          className={`
            w-full aspect-square flex flex-col items-center justify-center rounded-lg transition-colors
            ${active 
                ? 'bg-brand-primary text-white' 
                : 'text-text-muted hover:bg-black/5 dark:hover:bg-white/5 hover:text-text-main'
            }
          `}
        >
            <Icon size={20} strokeWidth={1.5} />
            {label && <span className="text-[8px] font-bold mt-0.5">{label}</span>}
        </button>
    )
}

function ThemeToggle() {
    const { theme, toggleTheme } = useTheme()
    const Icon = theme === 'dark' ? Moon : Sun
    
    return (
        <button 
            onClick={toggleTheme}
            className="w-10 h-10 flex items-center justify-center rounded-lg text-text-muted hover:text-text-main hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
        >
            <Icon size={18} strokeWidth={1.5} />
        </button>
    )
}

function InnerApp() {
  const navigate = useNavigate()
  const location = useLocation()
  
  // Use path to determine active state
  const currentPath = location.pathname

  return (
    <div className="flex h-screen w-screen bg-bg text-text-main transition-colors duration-200">
      {/* Sidebar - Fixed Left */}
      <aside className="w-14 flex flex-col border-r border-border bg-panel-bg shrink-0 items-center py-3 gap-2 z-50">
         {/* Logo Placeholder */}
         <div className="w-8 h-8 rounded bg-brand-primary/10 flex items-center justify-center mb-2 text-brand-primary">
            <Box size={18} strokeWidth={2.5} />
         </div>

         {/* Navigation */}
         <div className="flex flex-col gap-2 w-full px-2">
             <SidebarItem 
               icon={Network} 
               label="Graph" 
               active={currentPath === '/' || currentPath === '/graph'} 
               onClick={() => navigate({ to: '/' })} 
             />
             <SidebarItem 
               icon={Layers} 
               label="Layers" 
               active={currentPath === '/layers'} 
               onClick={() => navigate({ to: '/layers' })} 
             />
         </div>

         <div className="mt-auto flex flex-col gap-2 w-full px-2 items-center">
             <a 
               href="https://github.com/KaranocaVe/Transunformers" 
               target="_blank" 
               rel="noopener noreferrer"
               className="w-10 h-10 flex items-center justify-center rounded-lg text-text-muted hover:text-text-main hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
               title="GitHub Repository"
             >
                <Github size={20} strokeWidth={1.5} />
             </a>
             <ThemeToggle />
             <SidebarItem 
               icon={Settings} 
               onClick={() => navigate({ to: '/settings' })} 
             />
         </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 flex flex-col h-full overflow-hidden relative">
          <Outlet />
      </main>
    </div>
  )
}

function App() {
  return (
      <ThemeProvider>
          <InnerApp />
      </ThemeProvider>
  )
}

export default App
