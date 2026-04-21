import assert from 'node:assert/strict'
import test from 'node:test'

import { buildFlowGraph } from '../src/features/flow/flow-builder'
import { normalizeTraceTree } from '../src/features/flow/flow-normalize'

test('normalizeTraceTree preserves module paths and IO counts', () => {
  const trace = {
    module_path: 'ExampleModel',
    inputs: { args: [{ shape: [1, 16] }] },
    outputs: { shape: [1, 16] },
    children: [
      {
        module_path: 'ExampleModel.embed_tokens',
        inputs: { shape: [1, 16] },
        outputs: { shape: [1, 16, 768] },
        children: [],
      },
    ],
  }

  const normalized = normalizeTraceTree(trace)
  assert.ok(normalized)
  assert.equal(normalized.id, 'trace:0')
  assert.equal(normalized.inputCount, 1)
  assert.equal(normalized.children[0]?.modulePath, 'ExampleModel.embed_tokens')
})

test('normalizeTraceTree assigns unique ids to duplicate module paths', () => {
  const normalized = normalizeTraceTree({
    module_path: 'ExampleModel',
    children: [
      {
        module_path: 'ExampleModel.shared',
        children: [],
      },
      {
        module_path: 'ExampleModel.shared',
        children: [],
      },
    ],
  })

  assert.ok(normalized)
  assert.equal(normalized.children[0]?.modulePath, 'ExampleModel.shared')
  assert.equal(normalized.children[1]?.modulePath, 'ExampleModel.shared')
  assert.notEqual(normalized.children[0]?.id, normalized.children[1]?.id)

  const graph = buildFlowGraph(normalized)
  assert.equal(new Set(graph.nodes.map((node) => node.id)).size, graph.nodes.length)
  assert.equal(graph.edges.length, 2)
})

test('buildFlowGraph creates ordered runtime nodes and edges', () => {
  const normalized = normalizeTraceTree({
    module_path: 'ExampleModel',
    children: [
      {
        module_path: 'ExampleModel.encoder',
        children: [
          {
            module_path: 'ExampleModel.encoder.layer_0',
            children: [],
          },
        ],
      },
    ],
  })

  const graph = buildFlowGraph(normalized)
  assert.equal(graph.nodes.length, 3)
  assert.equal(graph.edges.length, 2)
  assert.equal(graph.rootModulePath, 'ExampleModel')
  assert.equal(graph.nodes[0]?.role, 'input')
  assert.equal(graph.nodes[2]?.role, 'head')
  assert.equal(graph.edges[0]?.source, graph.nodes[0]?.id)
  assert.equal(graph.edges[0]?.target, graph.nodes[1]?.id)
})
