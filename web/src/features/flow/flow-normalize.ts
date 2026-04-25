import type { RawTraceTree, TraceTreeNode } from './flow-types'

const collectTensorSummaries = (value: unknown): Array<{ dtype?: string | null; shape?: string | null; signature: string }> => {
  if (value === null || value === undefined) {
    return []
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectTensorSummaries(entry))
  }

  if (typeof value !== 'object') {
    return []
  }

  const record = value as Record<string, unknown>
  const dtype = typeof record.dtype === 'string' ? record.dtype : null
  const shape =
    typeof record.shape === 'string'
      ? record.shape
      : Array.isArray(record.shape)
        ? JSON.stringify(record.shape)
        : null
  if (dtype || shape) {
    return [{
      dtype,
      shape,
      signature: [dtype, shape].filter(Boolean).join(' · ') || 'tensor',
    }]
  }

  return Object.values(record).flatMap((entry) => collectTensorSummaries(entry))
}

const labelFromModulePath = (modulePath: string) => {
  const cleaned = modulePath.replace(/ \(top-level\)$/u, '')
  const parts = cleaned.split('.')
  return parts[parts.length - 1] || cleaned
}

const traceNodeId = (ancestry: number[]) => `trace:${ancestry.join('.')}`

const resolveInputArgCount = (inputs: unknown) => {
  if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) {
    return 0
  }

  const args = (inputs as Record<string, unknown>).args
  return Array.isArray(args) ? args.length : 0
}

const resolveInputKwargKeys = (inputs: unknown) => {
  if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) {
    return []
  }

  const kwargs = (inputs as Record<string, unknown>).kwargs
  if (!kwargs || typeof kwargs !== 'object' || Array.isArray(kwargs)) {
    return []
  }

  return Object.keys(kwargs as Record<string, unknown>)
}

export const normalizeTraceTree = (raw: RawTraceTree | null | undefined): TraceTreeNode | null => {
  if (!raw || typeof raw !== 'object' || typeof raw.module_path !== 'string') {
    return null
  }

  const walk = (node: RawTraceTree, depth: number, ancestry: number[]): TraceTreeNode => {
    const inputTensors = collectTensorSummaries(node.inputs)
    const outputTensors = collectTensorSummaries(node.outputs)

    return {
      id: traceNodeId(ancestry),
      label: labelFromModulePath(node.module_path),
      modulePath: node.module_path,
      depth,
      inputArgCount: resolveInputArgCount(node.inputs),
      inputKwargKeys: resolveInputKwargKeys(node.inputs),
      inputTensorCount: inputTensors.length,
      outputTensorCount: outputTensors.length,
      inputTensors,
      outputTensors,
      primaryInputSignature: inputTensors[0]?.signature ?? null,
      primaryOutputSignature: outputTensors[0]?.signature ?? null,
      children: (node.children ?? []).map((child, index) => walk(child, depth + 1, [...ancestry, index])),
    }
  }

  return walk(raw, 0, [0])
}
