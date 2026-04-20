import {
  BaseEdge,
  Position,
  getSmoothStepPath,
  type EdgeProps,
} from 'reactflow'

import {
  FLOW_EDGE_ROUTING_OWNER,
  type FlowEdgeData,
  type GraphRoutePoint,
  type GraphRouteSection,
} from './graph-builder'

const warnedMissingElkRoutes = new Set<string>()

const appendUniquePoint = (
  points: GraphRoutePoint[],
  point: GraphRoutePoint,
) => {
  const last = points.at(-1)
  if (last && last.x === point.x && last.y === point.y) {
    return
  }
  points.push(point)
}

const normalizeRoutePoints = (points: GraphRoutePoint[] | undefined): GraphRoutePoint[] => {
  if (!points || points.length === 0) {
    return []
  }

  const normalized: GraphRoutePoint[] = []
  points.forEach((point) => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return
    }
    appendUniquePoint(normalized, point)
  })
  return normalized
}

const flattenRouteSections = (sections: GraphRouteSection[] | undefined): GraphRoutePoint[] => {
  if (!sections || sections.length === 0) {
    return []
  }

  const flattened: GraphRoutePoint[] = []
  sections.forEach((section) => {
    if (Number.isFinite(section.startPoint.x) && Number.isFinite(section.startPoint.y)) {
      appendUniquePoint(flattened, section.startPoint)
    }
    section.bendPoints?.forEach((bendPoint) => {
      if (Number.isFinite(bendPoint.x) && Number.isFinite(bendPoint.y)) {
        appendUniquePoint(flattened, bendPoint)
      }
    })
    if (Number.isFinite(section.endPoint.x) && Number.isFinite(section.endPoint.y)) {
      appendUniquePoint(flattened, section.endPoint)
    }
  })
  return flattened
}

const buildPolylinePath = (points: GraphRoutePoint[]) => {
  if (points.length === 0) {
    return ''
  }

  return points.reduce(
    (path, point, index) =>
      index === 0 ? `M ${point.x} ${point.y}` : `${path} L ${point.x} ${point.y}`,
    '',
  )
}

type FlowEdgePathInput = Pick<
  EdgeProps<FlowEdgeData>,
  | 'id'
  | 'sourceX'
  | 'sourceY'
  | 'targetX'
  | 'targetY'
  | 'sourcePosition'
  | 'targetPosition'
  | 'data'
>

export const buildFlowEdgePath = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: FlowEdgePathInput) => {
  const routePoints = normalizeRoutePoints(
    flattenRouteSections(data?.route?.sections).length > 0
      ? flattenRouteSections(data?.route?.sections)
      : data?.route?.points,
  )
  if (routePoints.length > 0) {
    return buildPolylinePath(routePoints)
  }

  if (data?.routingOwner === FLOW_EDGE_ROUTING_OWNER) {
    if (!warnedMissingElkRoutes.has(id)) {
      warnedMissingElkRoutes.add(id)
      console.warn(`Missing ELK route points for flow edge ${id}; rendering a direct guard path.`)
    }
    return `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`
  }

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
  return smoothPath
}

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
}: EdgeProps<FlowEdgeData>) {
  const branchStyle =
    data?.branchHint === 'parallel'
      ? { stroke: '#8b5cf6', strokeWidth: 1.9, strokeDasharray: '8 4' }
      : data?.branchHint === 'bridge'
        ? { stroke: '#f59e0b', strokeWidth: 2.2, strokeDasharray: '4 3' }
        : { stroke: '#6366f1', strokeWidth: 1.7 }
  const resolvedMarkerEnd =
    markerEnd && typeof markerEnd === 'object' && 'type' in markerEnd
      ? ({ ...(markerEnd as Record<string, unknown>), color: branchStyle.stroke } as typeof markerEnd)
      : markerEnd
  const path = buildFlowEdgePath({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
  })

  return (
    <g
      data-testid="graph-edge"
      data-edge-id={id}
      data-routing-owner={data?.routingOwner ?? 'fallback'}
    >
      <BaseEdge
        id={id}
        path={path}
        style={{ ...branchStyle, ...style }}
        markerEnd={resolvedMarkerEnd}
      />
    </g>
  )
}
