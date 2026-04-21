import type { ModelManifest } from '../../data/types'
import type { GraphNodeData } from './types'

type RawConfig = Record<string, unknown>

export type GraphModelSummary = {
  architecture?: string
  mode?: 'encoder-decoder' | 'decoder-only' | 'encoder-only' | 'base'
  modality: string[]
  experts?: { count: number; topK?: number | null }
  attention?: { heads: number; kvHeads?: number | null }
  mapping?: string
  configClass?: string
  warningCount: number
}

export type GraphInsights = {
  visibleNodes: number
  visibleGroups: number
  dominantRole?: string | null
  hotspot?: { label: string; paramCount: number }
  denseGroup?: { label: string; layerCount: number }
  trainableFocus?: { label: string; ratio: number }
}

const getConfig = (manifest?: ModelManifest): RawConfig => {
  const model = manifest?.model as Record<string, unknown> | undefined
  const config = model?.config
  return config && typeof config === 'object' ? (config as RawConfig) : {}
}

const getNumber = (config: RawConfig, keys: string[]) => {
  for (const key of keys) {
    const value = config[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
  }
  return null
}

export const deriveModelSummary = (manifest?: ModelManifest): GraphModelSummary => {
  const model = manifest?.model as Record<string, unknown> | undefined
  const config = getConfig(manifest)
  const architectures = Array.isArray(model?.architectures) ? model.architectures : []
  const mappingNames = Array.isArray(model?.mapping_names) ? model.mapping_names : []
  const isEncoderDecoder = Boolean(model?.is_encoder_decoder)
  const modelType = typeof model?.model_type === 'string' ? model.model_type : null
  const configClass = typeof model?.config_class === 'string' ? model.config_class : null

  const hasVision = Boolean(config.vision_config) || /vision|vl|image|siglip|vit/i.test(`${modelType ?? ''} ${configClass ?? ''}`)
  const hasAudio = Boolean(config.audio_config) || /audio|speech|whisper|wav/i.test(`${modelType ?? ''} ${configClass ?? ''}`)
  const hasText = Boolean(config.text_config) || (!hasVision && !hasAudio) || /text|llama|gpt|bert|qwen|mistral|roberta|t5/i.test(`${modelType ?? ''} ${configClass ?? ''}`)
  const modality = [hasVision ? 'vision' : null, hasAudio ? 'audio' : null, hasText ? 'text' : null].filter(Boolean) as string[]

  const numExperts = getNumber(config, ['num_experts', 'num_local_experts', 'n_routed_experts'])
  const expertsPerToken = getNumber(config, ['num_experts_per_tok'])
  const numHeads = getNumber(config, ['num_attention_heads', 'num_heads'])
  const kvHeads = getNumber(config, ['num_key_value_heads'])

  let mode: GraphModelSummary['mode'] = 'base'
  if (isEncoderDecoder) mode = 'encoder-decoder'
  else if (modelType && /decoder|causal|llama|qwen|mistral|gpt/i.test(modelType)) mode = 'decoder-only'
  else if (modelType && /bert|encoder|vit|clip/i.test(modelType)) mode = 'encoder-only'

  return {
    architecture: (architectures[0] as string | undefined) ?? (typeof model?.class === 'string' ? model.class : undefined),
    mode,
    modality,
    experts: numExperts ? { count: numExperts, topK: expertsPerToken } : undefined,
    attention: numHeads ? { heads: numHeads, kvHeads } : undefined,
    mapping: (mappingNames[0] as string | undefined) ?? undefined,
    configClass: configClass ?? undefined,
    warningCount: Array.isArray(manifest?.warnings) ? manifest!.warnings.length : 0,
  }
}

export const deriveGraphInsights = (nodeMap?: Map<string, GraphNodeData>): GraphInsights => {
  const nodes = nodeMap ? Array.from(nodeMap.values()) : []
  const visibleGroups = nodes.filter((node) => node.depth > 0 && node.hasChildren && node.kind !== 'collapsed').length
  const visibleLeaves = nodes.filter((node) => node.depth > 0 && (!node.hasChildren || node.kind === 'collapsed')).length
  const contentNodes = nodes.filter((node) => node.depth > 0)
  const hotspot = contentNodes.reduce<GraphInsights['hotspot']>((best, node) => {
    const count = node.parameters?.total?.count ?? 0
    return !best || count > best.paramCount ? (count > 0 ? { label: node.label, paramCount: count } : best) : best
  }, undefined)
  const denseGroup = contentNodes.reduce<GraphInsights['denseGroup']>((best, node) => {
    if (!node.hasChildren) return best
    const layerCount = node.layerCount ?? 0
    return !best || layerCount > best.layerCount ? (layerCount > 0 ? { label: node.label, layerCount } : best) : best
  }, undefined)
  const trainableFocus = contentNodes.reduce<GraphInsights['trainableFocus']>((best, node) => {
    const ratio = node.trainableRatio ?? null
    return ratio === null ? best : !best || ratio > best.ratio ? { label: node.label, ratio } : best
  }, undefined)

  const roleCounts = new Map<string, number>()
  nodes.forEach((node) => {
    if (!node.role) return
    roleCounts.set(node.role, (roleCounts.get(node.role) ?? 0) + 1)
  })
  const dominantRole = Array.from(roleCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  return {
    visibleNodes: visibleLeaves,
    visibleGroups,
    dominantRole,
    hotspot,
    denseGroup,
    trainableFocus,
  }
}
