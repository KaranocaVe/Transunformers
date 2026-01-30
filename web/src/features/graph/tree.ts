import type { RawNode, TreeNode } from './types'

const parseRangeFromName = (name: string) => {
  const match = name.match(/^(\d+)\.\.(\d+)$/)
  if (!match) {
    return null
  }
  return { start: Number(match[1]), end: Number(match[2]) }
}

const parseIndexFromName = (name: string) => {
  if (!/^\d+$/.test(name)) {
    return null
  }
  return Number(name)
}

const resolveIndexRange = (node: TreeNode) => {
  const rangeFromName = parseRangeFromName(node.name)
  const start =
    node.indexStart ??
    rangeFromName?.start ??
    node.index ??
    parseIndexFromName(node.name)
  const end =
    node.indexEnd ??
    rangeFromName?.end ??
    node.index ??
    parseIndexFromName(node.name)
  if (start === null || start === undefined || end === null || end === undefined) {
    return null
  }
  return { start, end }
}

const resolveRepeatCount = (node: TreeNode) => {
  if (node.repeat !== null && node.repeat !== undefined) {
    return node.repeat
  }
  const range = resolveIndexRange(node)
  if (range) {
    return range.end - range.start + 1
  }
  return 1
}

const resolveUnitParamCount = (node: TreeNode) => {
  const total = node.parameters?.total?.count ?? 0
  const repeat = resolveRepeatCount(node)
  if (repeat <= 0) {
    return total
  }
  return Math.round(total / repeat)
}

const resolveSignature = (node: TreeNode) => {
  const classKey = node.className ?? node.name
  const tagKey = (node.tags ?? []).join('|')
  const unitParams = resolveUnitParamCount(node)
  const childKey =
    node.children.length > 0
      ? node.children
          .map((child) => `${child.className ?? child.name}:${child.kind ?? ''}`)
          .join(',')
      : ''
  return {
    shallow: `${classKey}|${tagKey}|${unitParams}`,
    deep: childKey ? `${classKey}|${tagKey}|${unitParams}|${childKey}` : null,
    hasChildren: node.children.length > 0,
    hasIndex: resolveIndexRange(node) !== null,
  }
}

const sumStats = (
  nodes: TreeNode[],
  key: 'parameters' | 'buffers',
): RawNode['parameters'] | RawNode['buffers'] | null => {
  let hasSelf = false
  let hasTotal = false
  let selfCount = 0
  let selfBytes = 0
  let selfTrainable = 0
  let totalCount = 0
  let totalBytes = 0
  let totalTrainable = 0

  for (const node of nodes) {
    const stats = node[key]
    if (stats?.self) {
      hasSelf = true
      selfCount += stats.self.count ?? 0
      selfBytes += stats.self.size_bytes ?? 0
      selfTrainable += stats.self.trainable ?? 0
    }
    if (stats?.total) {
      hasTotal = true
      totalCount += stats.total.count ?? 0
      totalBytes += stats.total.size_bytes ?? 0
      totalTrainable += stats.total.trainable ?? 0
    }
  }

  if (!hasSelf && !hasTotal) {
    return null
  }

  return {
    ...(hasSelf
      ? {
          self: {
            count: selfCount,
            size_bytes: selfBytes,
            trainable: selfTrainable,
          },
        }
      : {}),
    ...(hasTotal
      ? {
          total: {
            count: totalCount,
            size_bytes: totalBytes,
            trainable: totalTrainable,
          },
        }
      : {}),
  }
}

const buildCollapsedNode = (
  group: TreeNode[],
  parentPath: string,
): TreeNode => {
  const first = group[0]
  const ranges = group.map(resolveIndexRange)
  const hasAllRanges = ranges.every((range) => range !== null)
  let indexStart: number | null = null
  let indexEnd: number | null = null
  let name = first.name

  if (hasAllRanges) {
    const start = (ranges[0] as { start: number; end: number }).start
    let expected = start
    let contiguous = true
    for (const range of ranges) {
      if (!range) {
        contiguous = false
        break
      }
      if (range.start !== expected) {
        contiguous = false
        break
      }
      expected = range.end + 1
    }
    if (contiguous) {
      indexStart = start
      indexEnd = expected - 1
      name = `${indexStart}..${indexEnd}`
    }
  }

  const repeat = group.reduce((sum, node) => sum + resolveRepeatCount(node), 0)
  const parameters = sumStats(group, 'parameters')
  const buffers = sumStats(group, 'buffers')
  const tagList = first.tags ?? []
  const className = first.className
  const labelBase = indexStart !== null && indexEnd !== null ? `[${indexStart}-${indexEnd}]` : first.name
  const path = `${parentPath}::stack:${labelBase}`

  return {
    id: path,
    name,
    path,
    className,
    kind: 'collapsed',
    depth: first.depth,
    index: null,
    indexStart,
    indexEnd,
    repeat,
    parameters,
    buffers,
    parameterDetails: [],
    bufferDetails: [],
    tags: tagList,
    children: [],
    synthetic: true,
  }
}

const collapseRepeatingChildren = (
  children: TreeNode[],
  parentPath: string,
): TreeNode[] => {
  if (children.length < 2) {
    return children
  }

  const collapsed: TreeNode[] = []
  let group: TreeNode[] = []
  let groupSignature: ReturnType<typeof resolveSignature> | null = null

  const flush = () => {
    if (group.length <= 1) {
      collapsed.push(...group)
    } else {
      collapsed.push(buildCollapsedNode(group, parentPath))
    }
    group = []
    groupSignature = null
  }

  for (const child of children) {
    const signature = resolveSignature(child)
    if (
      group.length === 0 ||
      !groupSignature ||
      groupSignature.shallow !== signature.shallow ||
      (!groupSignature.hasIndex || !signature.hasIndex) ||
      (groupSignature.hasChildren &&
        signature.hasChildren &&
        groupSignature.deep !== signature.deep)
    ) {
      flush()
      group = [child]
      groupSignature = signature
    } else {
      group.push(child)
    }
  }
  flush()

  return collapsed
}

type NormalizeOptions = {
  collapseRepeats?: boolean
}

export const normalizeTree = (
  node: RawNode,
  options: NormalizeOptions = {},
  depth = 0,
): TreeNode => {
  const children = (node.children ?? []).map((child) =>
    normalizeTree(child, options, depth + 1),
  )
  const normalizedChildren = options.collapseRepeats
    ? collapseRepeatingChildren(children, node.path)
    : children
  return {
    id: node.path,
    name: node.name,
    path: node.path,
    className: node.class,
    kind: node.kind ?? (normalizedChildren.length > 0 ? 'container' : 'leaf'),
    depth,
    index: node.index ?? null,
    indexStart: node.index_start ?? null,
    indexEnd: node.index_end ?? null,
    repeat: node.repeat ?? null,
    parameters: node.parameters ?? null,
    buffers: node.buffers ?? null,
    parameterDetails: node.parameter_details ?? [],
    bufferDetails: node.buffer_details ?? [],
    tags: node.tags ?? [],
    children: normalizedChildren,
  }
}

export const splitCollapsedNode = (
  node: TreeNode,
  segmentSize = 8,
): TreeNode[] => {
  const start =
    node.indexStart ??
    parseRangeFromName(node.name)?.start ??
    (node.repeat ? 0 : null)
  const end =
    node.indexEnd ??
    parseRangeFromName(node.name)?.end ??
    (node.repeat ? node.repeat - 1 : null)

  if (start === null || end === null) {
    return []
  }
  const rangeLength = end - start + 1

  if (rangeLength <= segmentSize) {
    return Array.from({ length: rangeLength }, (_, index) => {
      const value = start + index
      const rangePath = `${node.path}::${value}`
      return {
        ...node,
        id: rangePath,
        name: String(value),
        path: rangePath,
        kind: 'leaf',
        index: value,
        indexStart: value,
        indexEnd: value,
        repeat: 1,
        children: [],
        synthetic: true,
      }
    })
  }

  const segments: TreeNode[] = []
  for (let current = start; current <= end; current += segmentSize) {
    const segmentEnd = Math.min(end, current + segmentSize - 1)
    const rangePath = `${node.path}::${current}-${segmentEnd}`
    segments.push({
      ...node,
      id: rangePath,
      name: `${current}..${segmentEnd}`,
      path: rangePath,
      kind: 'collapsed',
      indexStart: current,
      indexEnd: segmentEnd,
      repeat: segmentEnd - current + 1,
      children: [],
      synthetic: true,
    })
  }
  return segments
}
