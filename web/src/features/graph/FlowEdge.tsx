import { BaseEdge, type EdgeProps } from 'reactflow'

const ALIGN_THRESHOLD = 8
const MIN_SEGMENT = 18

const buildFlowPath = (
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
) => {
  const dx = targetX - sourceX
  const dy = targetY - sourceY
  const absDx = Math.abs(dx)
  const absDy = Math.abs(dy)

  if (absDx <= ALIGN_THRESHOLD || absDy <= ALIGN_THRESHOLD) {
    return `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`
  }

  const vertical = absDy >= absDx
  if (vertical) {
    const offset = Math.max(MIN_SEGMENT, absDy / 2)
    const midY = sourceY + Math.sign(dy) * offset
    return `M ${sourceX} ${sourceY} L ${sourceX} ${midY} L ${targetX} ${midY} L ${targetX} ${targetY}`
  }

  const offset = Math.max(MIN_SEGMENT, absDx / 2)
  const midX = sourceX + Math.sign(dx) * offset
  return `M ${sourceX} ${sourceY} L ${midX} ${sourceY} L ${midX} ${targetY} L ${targetX} ${targetY}`
}

export function FlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  markerEnd,
}: EdgeProps) {
  const path = buildFlowPath(sourceX, sourceY, targetX, targetY)
  return (
    <BaseEdge
      id={id}
      path={path}
      style={style}
      markerEnd={markerEnd ?? 'arrowclosed'}
    />
  )
}
