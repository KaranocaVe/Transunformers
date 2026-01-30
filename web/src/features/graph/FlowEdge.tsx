import {
  BaseEdge,
  Position,
  getSmoothStepPath,
  type EdgeProps,
} from 'reactflow'

export function FlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,

  style,
  markerEnd,
  data,
}: EdgeProps) {
  // Increased radius for smoother corners
  // Use ELK routing points if available
  let path = ''
  if (data?.points && Array.isArray(data.points) && data.points.length > 0) {
     const points = data.points as {x: number, y: number}[]
     path = `M ${sourceX} ${sourceY}`
     // We should probably rely on the points from ELK more directly, 
     // but React Flow passes source/target X/Y which might differ slightly if we adjusted nodes.
     // However, ELK points usually start/end at the node center or port.
     // Let's just use the points.
     // Optimization: filter out points that are too close (simplification)
     
     if (points.length > 0) {
        path = `M ${points[0].x} ${points[0].y}`
        for (let i = 1; i < points.length; i++) {
           path += ` L ${points[i].x} ${points[i].y}`
        }
     }
  } else {
     const [smoothPath] = getSmoothStepPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition: sourcePosition ?? Position.Bottom,
        targetPosition: targetPosition ?? Position.Top,
        borderRadius: 20, 
        offset: 28,
      })
      path = smoothPath
  }

  return (
    <BaseEdge
       id={id}
       path={path}
       style={style}
       markerEnd={markerEnd}
     />
  )
}
