import { expect, test, type Page } from '@playwright/test'

const flowIndex = {
  count: 1,
  models: [
    {
      id: 'flow-model',
      safe_id: 'FlowReadyModel',
      path: 'flow-model/model.json',
      status: 'ok',
      module_count: 3,
      parameter_count: 123456,
    },
  ],
}

const flowManifest = {
  schema_version: '1.0',
  generated_at: '2026-04-21T00:00:00Z',
  status: 'ok',
  warnings: [],
  trace: {
    enabled: true,
    summary_file: 'trace_summary.json',
  },
  model: {
    safe_id: 'FlowReadyModel',
    class: 'FlowReadyModel',
    config_class: 'FlowReadyConfig',
    model_type: 'decoder-only-test',
    parameters: {
      count: 123456,
      size_bytes: 123456,
      trainable: 123456,
    },
  },
  modules: {
    module_count: 3,
    tree: {
      name: 'FlowReadyModel',
      path: 'FlowReadyModel',
      children: [],
    },
    compact_tree: {
      name: 'FlowReadyModel',
      path: 'FlowReadyModel',
      children: [],
    },
  },
}

const chunkedFlowManifest = {
  ...flowManifest,
  chunks: {
    layout: 'flat',
    base_dir: 'chunks',
    compression: 'none',
    groups: {
      modules: ['modules.compact_tree', 'modules.tree'],
    },
    items: [
      {
        key: 'modules.compact_tree',
        path: 'chunks/modules.compact_tree.json',
        present: true,
        size_bytes: 512,
      },
      {
        key: 'modules.tree',
        path: 'chunks/modules.tree.json',
        present: true,
        size_bytes: 512,
      },
    ],
  },
}

const flowTrace = {
  module_path: 'FlowReadyModel',
  inputs: { args: [{ shape: [1, 16] }] },
  outputs: { shape: [1, 16] },
  children: [
    {
      module_path: 'FlowReadyModel.embed_tokens',
      inputs: { shape: [1, 16] },
      outputs: { shape: [1, 16, 768] },
      children: [],
    },
    {
      module_path: 'FlowReadyModel.lm_head',
      inputs: { shape: [1, 16, 768] },
      outputs: { shape: [1, 16, 32000] },
      children: [],
    },
  ],
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const setGraphMode = async (page: Page, mode: 'structure' | 'flow') => {
  await page.evaluate(async (nextMode) => {
    const modulePath = '/src/features/explorer/store.ts'
    const mod = await import(modulePath)
    mod.useExplorerStore.getState().setGraphMode(nextMode)
  }, mode)
}

const selectFlowModel = async (page: Page) => {
  await page.getByTestId('model-search').fill('FlowReadyModel')
  await page.getByTestId('model-item').first().click()
}

test('renders trace-backed flow mode without requesting structure chunks', async ({ page }) => {
  let chunkRequests = 0

  await page.route('**/data/models/index.json', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(flowIndex) })
  })
  await page.route('**/data/models/flow-model/model.json', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(chunkedFlowManifest) })
  })
  await page.route('**/data/models/flow-model/trace_summary.json', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(flowTrace) })
  })
  await page.route('**/data/models/flow-model/chunks/*.json', async (route) => {
    chunkRequests += 1
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
  })

  await page.goto('/')
  await setGraphMode(page, 'flow')
  await selectFlowModel(page)

  await expect(page.getByTestId('workspace')).toHaveAttribute('data-graph-mode', 'flow')
  await expect(page.getByTestId('workspace')).toHaveAttribute('data-layout-status', 'ready')
  await expect(page.getByTestId('workspace-title')).toContainText('FlowReadyModel')
  await expect(page.getByTestId('workspace')).toHaveAttribute('data-graph-node-count', '2')
  await expect(page.getByTestId('workspace')).toHaveAttribute('data-graph-edge-count', '1')
  await expect(page.getByText('Runtime path')).toBeVisible()
  expect(chunkRequests).toBe(0)
})

test('keeps flow mode in loading state until the trace summary resolves', async ({ page }) => {
  await page.route('**/data/models/index.json', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(flowIndex) })
  })
  await page.route('**/data/models/flow-model/model.json', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(flowManifest) })
  })
  await page.route('**/data/models/flow-model/trace_summary.json', async (route) => {
    await delay(300)
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(flowTrace) })
  })

  await page.goto('/')
  await setGraphMode(page, 'flow')
  await selectFlowModel(page)

  await expect(page.getByTestId('workspace')).toHaveAttribute('data-layout-status', 'loading')
  await expect(page.getByTestId('workspace-loading-flow')).toBeVisible()
  await expect(page.getByTestId('workspace')).toHaveAttribute('data-graph-node-count', '0')

  await expect(page.getByTestId('workspace')).toHaveAttribute('data-layout-status', 'ready')
  await expect(page.getByTestId('workspace')).toHaveAttribute('data-graph-node-count', '2')
})

test('waits for manifest resolution before showing trace unavailable state', async ({ page }) => {
  await page.route('**/data/models/index.json', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(flowIndex) })
  })
  await page.route('**/data/models/flow-model/model.json', async (route) => {
    await delay(300)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...flowManifest,
        trace: { enabled: false },
      }),
    })
  })

  await page.goto('/')
  await setGraphMode(page, 'flow')
  await selectFlowModel(page)

  await expect(page.getByTestId('workspace')).toHaveAttribute('data-layout-status', 'loading')
  await expect(page.getByTestId('workspace-loading-flow')).toBeVisible()
  await expect(page.getByText('Runtime flow trace is unavailable for this model.')).toBeHidden()

  await expect(page.getByTestId('workspace-empty-flow')).toBeVisible()
  await expect(page.getByText('Runtime flow trace is unavailable for this model.')).toBeVisible()
})

test('resolves slash-containing Hugging Face model ids through the index in flow mode', async ({ page }) => {
  const slashIndex = {
    count: 1,
    models: [
      {
        id: 'hf-internal-testing/tiny-random-BertModel',
        safe_id: 'hf-internal-testing__tiny-random-BertModel',
        path: 'hf-internal-testing__tiny-random-BertModel/model.json',
        status: 'ok',
        module_count: 3,
        parameter_count: 123456,
      },
    ],
  }
  await page.route('**/data/models/index.json', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(slashIndex) })
  })
  await page.route('**/data/models/hf-internal-testing__tiny-random-BertModel/model.json', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(flowManifest) })
  })
  await page.route('**/data/models/hf-internal-testing__tiny-random-BertModel/trace_summary.json', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(flowTrace) })
  })

  await page.goto('/')
  await page.evaluate(async () => {
    const { useExplorerStore } = await import('/src/features/explorer/store.ts')
    useExplorerStore.getState().setGraphMode('flow')
    useExplorerStore.getState().setSelectedModelId('hf-internal-testing/tiny-random-BertModel')
  })

  await expect(page.getByTestId('workspace')).toHaveAttribute('data-graph-mode', 'flow')
  await expect(page.getByTestId('workspace')).toHaveAttribute('data-layout-status', 'ready')
  await expect(page.getByTestId('workspace')).toHaveAttribute('data-graph-node-count', '2')
})
