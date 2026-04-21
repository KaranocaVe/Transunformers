import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeTree } from '../src/features/graph/tree'
import { buildGraph } from '../src/features/graph/graph-builder'
import { deriveGraphInsights, deriveModelSummary } from '../src/features/graph/modelInsights'
import type { ModelManifest } from '../src/data/types'
import type { RawNode } from '../src/features/graph/types'
import { useExplorerStore } from '../src/features/explorer/store'

const buildTestGraph = (tree: RawNode, viewMode: 'compact' | 'full' = 'compact') =>
  buildGraph(normalizeTree(tree, { collapseRepeats: viewMode === 'compact' }), {
    expanded: useExplorerStore.getState().expandedNodes,
    autoDepth: 2,
    viewMode,
    splitSize: 8,
  })

test('deriveModelSummary reads local-expert and attention config fields without fake zero values', () => {
  const manifest = {
    model: {
      class: 'QwenMoEModel',
      config_class: 'QwenMoEConfig',
      model_type: 'qwen2_moe',
      mapping_names: ['MODEL_MAPPING'],
      is_encoder_decoder: false,
      architectures: ['QwenMoEForCausalLM'],
      config: {
        num_local_experts: 64,
        num_experts_per_tok: 8,
        num_attention_heads: 64,
      },
    },
    warnings: ['warn'],
  } as unknown as ModelManifest

  const summary = deriveModelSummary(manifest)
  assert.equal(summary.experts?.count, 64)
  assert.equal(summary.experts?.topK, 8)
  assert.equal(summary.attention?.heads, 64)
  assert.equal(summary.attention?.kvHeads ?? null, null)
  assert.equal(summary.warningCount, 1)
})

test('deriveGraphInsights excludes root and collapsed repeat cards from group counts', () => {
  const raw: RawNode = {
    name: 'ModelRoot',
    path: 'ModelRoot',
    class: 'RootModel',
    children: [
      {
        name: 'layers',
        path: 'ModelRoot.layers',
        class: 'ModuleList',
        children: Array.from({ length: 6 }, (_, index) => ({
          name: String(index),
          path: `ModelRoot.layers.${index}`,
          class: 'DecoderLayer',
          index,
          parameters: { total: { count: 1000 + index, size_bytes: 0, trainable: 1000 + index } },
          children: [],
        })),
      },
    ],
  }
  const graph = buildTestGraph(raw, 'compact')
  const insights = deriveGraphInsights(graph.nodeMap)

  assert.equal(insights.visibleGroups, 1)
  assert.ok(insights.visibleNodes >= 1)
  assert.ok(insights.denseGroup)
})

test('buildGraph populates parser-backed tagSummary chips from important tags', () => {
  const raw: RawNode = {
    name: 'ModelRoot',
    path: 'ModelRoot',
    class: 'RootModel',
    tags: ['text'],
    children: [
      {
        name: 'router',
        path: 'ModelRoot.router',
        class: 'ExpertRouter',
        tags: ['router', 'moe', 'bridge'],
        children: [],
      },
    ],
  }
  const graph = buildTestGraph(raw, 'full')
  const routerNode = graph.nodeMap.get('ModelRoot.router')
  assert.deepEqual(routerNode?.tagSummary, ['router', 'bridge'])
})
