import { useEffect, useRef, useState } from 'react'

import { ModelSidebar } from '../features/explorer/ModelSidebar'
import { useExplorerStore } from '../features/explorer/store'
import { ModelWorkspace } from '../features/graph/ModelWorkspace'

export default function Home() {
  const sidebarWidth = useExplorerStore((state) => state.sidebarWidth)
  const setSidebarWidth = useExplorerStore((state) => state.setSidebarWidth)
  const graphFocusMode = useExplorerStore((state) => state.graphFocusMode)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const dragSessionRef = useRef<{
    handleMove: (event: PointerEvent) => void
    handleUp: () => void
  } | null>(null)
  const workspaceRef = useRef<HTMLDivElement | null>(null)
  const [workspaceWidth, setWorkspaceWidth] = useState(0)

  useEffect(() => {
    return () => {
      const session = dragSessionRef.current
      if (!session) return

      window.removeEventListener('pointermove', session.handleMove)
      window.removeEventListener('pointerup', session.handleUp)
    }
  }, [])

  useEffect(() => {
    const element = workspaceRef.current
    if (!element) return

    const updateWidth = (width: number) => {
      const nextWidth = Math.round(width)
      setWorkspaceWidth((current) => (current === nextWidth ? current : nextWidth))
    }

    updateWidth(element.clientWidth)

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      updateWidth(entry.contentRect.width)
    })

    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [])

  return (
    <section
      className="flex h-full min-h-0 flex-col gap-4"
      data-graph-focus-mode={graphFocusMode ? 'true' : 'false'}
    >
      <div
        ref={containerRef}
        className="flex w-full flex-1 min-h-0 gap-0"
      >
        {!graphFocusMode && (
          <>
            <aside
              className="flex h-full min-h-0 flex-col shrink-0 overflow-hidden"
              style={{ width: sidebarWidth }}
            >
              <ModelSidebar />
            </aside>
            <div
              className="w-1 cursor-col-resize bg-transparent hover:bg-neon-purple/50 transition-colors z-10"
              data-testid="sidebar-resize-handle"
              onPointerDown={(event) => {
                if (graphFocusMode) return
                event.preventDefault()

                const activeSession = dragSessionRef.current
                if (activeSession) {
                  window.removeEventListener('pointermove', activeSession.handleMove)
                  window.removeEventListener('pointerup', activeSession.handleUp)
                }

                const handleMove = (moveEvent: PointerEvent) => {
                  if (!containerRef.current) return
                  const rect = containerRef.current.getBoundingClientRect()
                  const nextWidth = Math.min(
                    520,
                    Math.max(280, moveEvent.clientX - rect.left),
                  )
                  setSidebarWidth(nextWidth)
                }

                const handleUp = () => {
                  const session = dragSessionRef.current
                  if (!session) return

                  window.removeEventListener('pointermove', session.handleMove)
                  window.removeEventListener('pointerup', session.handleUp)
                  dragSessionRef.current = null
                }

                dragSessionRef.current = { handleMove, handleUp }
                window.addEventListener('pointermove', handleMove)
                window.addEventListener('pointerup', handleUp)
              }}
            />
          </>
        )}
        <div ref={workspaceRef} className="flex-1 min-h-0 relative h-full w-full min-w-0" data-testid="workspace-host">
          <ModelWorkspace containerWidth={workspaceWidth} />
        </div>
      </div>
    </section>
  )
}
