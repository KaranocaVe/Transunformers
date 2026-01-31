import { useEffect, useRef, useState } from 'react'

import { ModelSidebar } from '../features/explorer/ModelSidebar'
import { useExplorerStore } from '../features/explorer/store'
import { ModelWorkspace } from '../features/graph/ModelWorkspace'

export default function Home() {
  const { sidebarWidth, setSidebarWidth } = useExplorerStore()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    if (!dragging) return

    const handleMove = (event: PointerEvent) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const nextWidth = Math.min(
        520,
        Math.max(280, event.clientX - rect.left),
      )
      setSidebarWidth(nextWidth)
    }

    const handleUp = () => {
      setDragging(false)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
  }, [dragging, setSidebarWidth])

  return (
    <section className="flex h-full min-h-0 flex-col gap-4">
      <div
        ref={containerRef}
        className="flex w-full flex-1 min-h-0 gap-0"
      >
        <aside
          className="flex h-full min-h-0 flex-col shrink-0 overflow-hidden"
          style={{ width: sidebarWidth }}
        >
          <ModelSidebar />
        </aside>
        <div
          className="w-1 cursor-col-resize bg-transparent hover:bg-neon-purple/50 transition-colors z-10"
          onPointerDown={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
        />
        <div className="flex-1 min-h-0 relative h-full w-full min-w-0">
          <ModelWorkspace />
        </div>
      </div>
    </section>
  )
}
