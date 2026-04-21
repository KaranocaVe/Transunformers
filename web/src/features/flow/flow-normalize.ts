import type { RawTraceTree, TraceTreeNode } from './flow-types'

const countEntries = (value: unknown): number => {
  if (!value) return 0
  if (Array.isArray(value)) return value.length
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length
  return 1
}

const labelFromModulePath = (modulePath: string) => {
  const cleaned = modulePath.replace(/ \(top-level\)$/u, '')
  const parts = cleaned.split('.')
  return parts[parts.length - 1] || cleaned
}

const traceNodeId = (ancestry: number[]) => `trace:${ancestry.join('.')}`

export const normalizeTraceTree = (raw: RawTraceTree | null | undefined): TraceTreeNode | null => {
  if (!raw || typeof raw !== 'object' || typeof raw.module_path !== 'string') {
    return null
  }

  const walk = (node: RawTraceTree, depth: number, ancestry: number[]): TraceTreeNode => ({
    id: traceNodeId(ancestry),
    label: labelFromModulePath(node.module_path),
    modulePath: node.module_path,
    depth,
    inputCount: countEntries(node.inputs),
    outputCount: countEntries(node.outputs),
    children: (node.children ?? []).map((child, index) => walk(child, depth + 1, [...ancestry, index])),
  })

  return walk(raw, 0, [0])
}
