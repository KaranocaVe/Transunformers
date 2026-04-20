import { expect, type Page } from '@playwright/test'

type RawNode = {
  name: string
  path: string
  class?: string
  index?: number
  children: RawNode[]
}

type RouteDelayOptions = {
  indexDelayMs?: number
  manifestDelays?: Record<string, number>
  chunkDelays?: Record<string, number>
}

type WorkspaceReadyOptions = {
  expectNodes?: boolean
}

type GraphNodeBox = {
  id: string
  label: string
  left: number
  right: number
  top: number
  bottom: number
  width: number
  height: number
}

export const MODEL_IDS = {
  collapsed: 'collapsed-model',
  disconnected: 'disconnected-model',
  longLabel: 'long-label-model',
  parallel: 'parallel-model',
  empty: 'empty-model',
  single: 'single-node-model',
  chunked: 'chunked-model',
} as const

export const LONG_LABEL_NODE_IDS = {
  attention:
    'long.encoder.attention_output_projection_with_a_significantly_longer_label',
  feedForward:
    'long.encoder.feed_forward_output_projection_with_a_significantly_longer_label',
} as const

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const buildLeaf = (path: string, name: string, className: string, index?: number): RawNode => ({
  name,
  path,
  class: className,
  index,
  children: [],
})

const buildCollapsedTree = (): RawNode => ({
  name: 'CollapsedRoot',
  path: 'collapsed',
  class: 'CollapsedRoot',
  children: [
    {
      name: 'encoder',
      path: 'collapsed.encoder',
      class: 'CollapsedEncoder',
      children: Array.from({ length: 12 }, (_, index) => ({
        name: String(index),
        path: `collapsed.encoder.${index}`,
        class: 'EncoderLayer',
        index,
        children: [
          buildLeaf(
            `collapsed.encoder.${index}.attention_output_projection_with_a_significantly_longer_label`,
            `attention_output_projection_with_a_significantly_longer_label_${index}`,
            'ProjectionBlock',
          ),
          buildLeaf(
            `collapsed.encoder.${index}.mlp`,
            `mlp_${index}`,
            'FeedForwardBlock',
          ),
        ],
      })),
    },
    {
      name: 'head',
      path: 'collapsed.head',
      class: 'CollapsedHead',
      children: [buildLeaf('collapsed.head.output', 'collapsed-output', 'OutputHead')],
    },
  ],
})

const buildLongLabelTree = (): RawNode => ({
  name: 'LongLabelRoot',
  path: 'long',
  class: 'LongLabelRoot',
  children: [
    {
      name: 'encoder_group_with_a_label_that_should_define_the_minimum_container_width',
      path: 'long.encoder',
      class: 'LongLabelEncoder',
      children: [
        buildLeaf(
          LONG_LABEL_NODE_IDS.attention,
          'attention_output_projection_with_a_significantly_longer_label',
          'ProjectionBlock',
        ),
        buildLeaf(
          LONG_LABEL_NODE_IDS.feedForward,
          'feed_forward_output_projection_with_a_significantly_longer_label',
          'ProjectionBlock',
        ),
      ],
    },
  ],
})

const buildDisconnectedTree = (): RawNode => ({
  name: 'DisconnectedBranchesRoot',
  path: 'disconnected',
  class: 'DisconnectedBranchesRoot',
  children: [
    {
      name: 'disconnected_left_branch',
      path: 'disconnected.left_branch',
      class: 'DisconnectedBranch',
      children: [
        buildLeaf(
          'disconnected.left_branch.left_leaf',
          'DisconnectedLeftLeaf',
          'DisconnectedLeaf',
        ),
      ],
    },
    {
      name: 'disconnected_bridge_probe',
      path: 'disconnected.bridge_probe',
      class: 'DisconnectedBridgeProbe',
      children: [],
    },
    {
      name: 'disconnected_right_branch',
      path: 'disconnected.right_branch',
      class: 'DisconnectedBranch',
      children: [
        buildLeaf(
          'disconnected.right_branch.right_leaf',
          'DisconnectedRightLeaf',
          'DisconnectedLeaf',
        ),
      ],
    },
  ],
})

const buildParallelTree = (): RawNode => ({
  name: 'ParallelRoutesRoot',
  path: 'parallel',
  class: 'ParallelRoutesRoot',
  children: [
    {
      name: 'experts',
      path: 'parallel.experts',
      class: 'ParallelExperts',
      children: [
        buildLeaf('parallel.experts.vision_branch', 'ParallelVisionBranch', 'VisionBranch'),
        buildLeaf('parallel.experts.text_branch', 'ParallelTextBranch', 'TextBranch'),
      ],
    },
  ],
})

const buildSingleNodeTree = (): RawNode => ({
  name: 'SingleNodeRoot',
  path: 'single',
  class: 'SingleNodeRoot',
  children: [],
})

const buildChunkedCompactTree = (): RawNode => ({
  name: 'GammaCompactRoot',
  path: 'gamma',
  class: 'GammaCompactRoot',
  children: [
    {
      name: 'GammaCompactOnly',
      path: 'gamma.encoder',
      class: 'GammaCompactOnly',
      children: [buildLeaf('gamma.encoder.output', 'GammaCompactLeaf', 'GammaCompactLeaf')],
    },
  ],
})

const buildChunkedFullTree = (): RawNode => ({
  name: 'GammaFullRoot',
  path: 'gamma',
  class: 'GammaFullRoot',
  children: [
    {
      name: 'GammaFullOnly',
      path: 'gamma.encoder',
      class: 'GammaFullOnly',
      children: [
        buildLeaf('gamma.encoder.attention', 'GammaFullAttention', 'GammaFullAttention'),
        buildLeaf('gamma.encoder.mlp', 'GammaFullMlp', 'GammaFullMlp'),
      ],
    },
  ],
})

const manifestFor = (safeId: string, tree: RawNode, parameterCount: number) => ({
  schema_version: '1.0',
  generated_at: '2026-04-20T00:00:00Z',
  status: 'ok',
  warnings: [],
  model: {
    safe_id: safeId,
    parameters: {
      count: parameterCount,
      size_bytes: parameterCount,
      trainable: parameterCount,
    },
  },
  modules: {
    module_count: 1,
    tree,
    compact_tree: tree,
  },
})

const indexFixture = {
  count: 6,
  models: [
    {
      id: MODEL_IDS.collapsed,
      safe_id: 'CollapsedModel',
      path: `${MODEL_IDS.collapsed}/model.json`,
      status: 'ok',
      module_count: 40,
      parameter_count: 123456,
    },
    {
      id: MODEL_IDS.disconnected,
      safe_id: 'DisconnectedBranchesModel',
      path: `${MODEL_IDS.disconnected}/model.json`,
      status: 'ok',
      module_count: 5,
      parameter_count: 234567,
    },
    {
      id: MODEL_IDS.longLabel,
      safe_id: 'LongLabelModel',
      path: `${MODEL_IDS.longLabel}/model.json`,
      status: 'ok',
      module_count: 3,
      parameter_count: 345678,
    },
    {
      id: MODEL_IDS.parallel,
      safe_id: 'ParallelRoutesModel',
      path: `${MODEL_IDS.parallel}/model.json`,
      status: 'ok',
      module_count: 4,
      parameter_count: 456789,
    },
    {
      id: MODEL_IDS.empty,
      safe_id: 'EmptyGraphModel',
      path: `${MODEL_IDS.empty}/model.json`,
      status: 'ok',
      module_count: 0,
      parameter_count: 0,
    },
    {
      id: MODEL_IDS.single,
      safe_id: 'SingleNodeModel',
      path: `${MODEL_IDS.single}/model.json`,
      status: 'ok',
      module_count: 1,
      parameter_count: 111111,
    },
    {
      id: MODEL_IDS.chunked,
      safe_id: 'ChunkedGammaModel',
      path: `${MODEL_IDS.chunked}/model.json`,
      status: 'ok',
      module_count: 6,
      parameter_count: 777777,
    },
  ],
}

const manifests: Record<string, unknown> = {
  [`${MODEL_IDS.collapsed}/model.json`]: manifestFor('CollapsedModel', buildCollapsedTree(), 123456),
  [`${MODEL_IDS.disconnected}/model.json`]: manifestFor(
    'DisconnectedBranchesModel',
    buildDisconnectedTree(),
    234567,
  ),
  [`${MODEL_IDS.longLabel}/model.json`]: manifestFor('LongLabelModel', buildLongLabelTree(), 345678),
  [`${MODEL_IDS.parallel}/model.json`]: manifestFor('ParallelRoutesModel', buildParallelTree(), 456789),
  [`${MODEL_IDS.single}/model.json`]: manifestFor('SingleNodeModel', buildSingleNodeTree(), 111111),
  [`${MODEL_IDS.empty}/model.json`]: {
    schema_version: '1.0',
    generated_at: '2026-04-20T00:00:00Z',
    status: 'ok',
    warnings: [],
    model: {
      safe_id: 'EmptyGraphModel',
      parameters: {
        count: 0,
        size_bytes: 0,
        trainable: 0,
      },
    },
    modules: {
      module_count: 0,
    },
  },
  [`${MODEL_IDS.chunked}/model.json`]: {
    schema_version: '1.0',
    generated_at: '2026-04-20T00:00:00Z',
    status: 'ok',
    warnings: [],
    model: {
      safe_id: 'ChunkedGammaModel',
      parameters: {
        count: 777777,
        size_bytes: 777777,
        trainable: 777777,
      },
    },
    modules: {
      module_count: 1,
    },
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
  },
}

const chunks: Record<string, unknown> = {
  [`${MODEL_IDS.chunked}/chunks/modules.compact_tree.json`]: buildChunkedCompactTree(),
  [`${MODEL_IDS.chunked}/chunks/modules.tree.json`]: buildChunkedFullTree(),
}

const graphNodeSelector = '[data-testid="module-node"], [data-testid="group-node"]'

const withOptionalDelay = async (ms: number | undefined) => {
  if (ms && ms > 0) {
    await delay(ms)
  }
}

export const installDeterministicGraphRoutes = async (
  page: Page,
  options: RouteDelayOptions = {},
) => {
  await page.route('**/data/models/index.json', async (route) => {
    await withOptionalDelay(options.indexDelayMs)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(indexFixture),
    })
  })

  for (const [path, manifest] of Object.entries(manifests)) {
    await page.route(`**/data/models/${path}`, async (route) => {
      await withOptionalDelay(options.manifestDelays?.[path])
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(manifest),
      })
    })
  }

  for (const [path, chunk] of Object.entries(chunks)) {
    await page.route(`**/data/models/${path}`, async (route) => {
      await withOptionalDelay(options.chunkDelays?.[path])
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(chunk),
      })
    })
  }
}

export const selectModel = async (page: Page, modelId: string) => {
  const item = page.locator(`[data-testid="model-item"][data-model-id="${modelId}"]`)
  await expect(item).toBeVisible()
  await item.click()
}

export const getLayoutRevision = async (page: Page) => {
  const revision = await page.getByTestId('workspace').getAttribute('data-layout-revision')
  return Number(revision ?? '0')
}

export const getGraphNodeCount = async (page: Page) => {
  const count = await page.getByTestId('workspace').getAttribute('data-graph-node-count')
  return Number(count ?? '0')
}

export const waitForWorkspaceReady = async (
  page: Page,
  modelId: string,
  options: WorkspaceReadyOptions = {},
) => {
  const { expectNodes = true } = options
  const workspace = page.getByTestId('workspace')
  await expect(workspace).toHaveAttribute('data-selected-model-id', modelId)
  await expect(workspace).toHaveAttribute('data-layout-status', 'ready')

  if (!expectNodes) {
    await expect.poll(async () => await getGraphNodeCount(page)).toBe(0)
    return
  }

  await expect.poll(async () => await getGraphNodeCount(page)).toBeGreaterThan(0)
  await expect(page.locator(graphNodeSelector).first()).toBeVisible()
}

export const setLayoutDirection = async (page: Page, direction: 'DOWN' | 'RIGHT') => {
  await page.evaluate(async (nextDirection) => {
    // @ts-expect-error Vite resolves browser source imports at runtime in Playwright.
    const { useExplorerStore } = await import('/src/features/explorer/store.ts')
    useExplorerStore.getState().setLayoutDirection(nextDirection)
  }, direction)
}

export const setViewMode = async (page: Page, mode: 'compact' | 'full') => {
  await page.evaluate(async (nextMode) => {
    // @ts-expect-error Vite resolves browser source imports at runtime in Playwright.
    const { useExplorerStore } = await import('/src/features/explorer/store.ts')
    useExplorerStore.getState().setViewMode(nextMode)
  }, mode)
}

export const setSortBy = async (page: Page, sortBy: 'name' | 'parameters' | 'modules') => {
  await page.evaluate(async (nextSortBy) => {
    // @ts-expect-error Vite resolves browser source imports at runtime in Playwright.
    const { useExplorerStore } = await import('/src/features/explorer/store.ts')
    useExplorerStore.getState().setSortBy(nextSortBy)
  }, sortBy)
}

export const clearSelectedModel = async (page: Page) => {
  await page.evaluate(async () => {
    // @ts-expect-error Vite resolves browser source imports at runtime in Playwright.
    const { useExplorerStore } = await import('/src/features/explorer/store.ts')
    useExplorerStore.getState().setSelectedModelId(undefined)
  })
}

export const toggleExpanded = async (page: Page, nodeId: string, isExpanded: boolean) => {
  await page.evaluate(async ({ nextNodeId, nextIsExpanded }) => {
    // @ts-expect-error Vite resolves browser source imports at runtime in Playwright.
    const { useExplorerStore } = await import('/src/features/explorer/store.ts')
    useExplorerStore.getState().toggleExpanded(nextNodeId, nextIsExpanded)
  }, { nextIsExpanded: isExpanded, nextNodeId: nodeId })
}

export const dragSidebarTo = async (page: Page, targetX: number) => {
  const handle = page.getByTestId('sidebar-resize-handle')
  const box = await handle.boundingBox()
  if (!box) {
    throw new Error('Sidebar resize handle is not available')
  }

  const startX = box.x + box.width / 2
  const startY = box.y + box.height / 2

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(targetX, startY, { steps: 8 })
  await page.mouse.up()
}

const getVisibleNodes = async (page: Page) => {
  return page.evaluate((selector) => {
    const canvas = document.querySelector('[data-testid="graph-canvas"]') as HTMLElement | null
    if (!canvas) {
      return null
    }

    const canvasRect = canvas.getBoundingClientRect()
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(selector))
      .map((node) => {
        const rect = node.getBoundingClientRect()
        return {
          id: node.dataset.id ?? 'unknown-node',
          label: node.dataset.label ?? node.textContent?.replace(/\s+/g, ' ').trim() ?? '',
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        }
      })
      .filter((node) => node.width > 0 && node.height > 0)

    return {
      canvas: {
        left: canvasRect.left,
        right: canvasRect.right,
        top: canvasRect.top,
        bottom: canvasRect.bottom,
      },
      nodes,
    }
  }, graphNodeSelector)
}

export const getVisibleLabels = async (page: Page) => {
  const snapshot = await getVisibleNodes(page)
  return snapshot?.nodes.map((node) => node.label) ?? []
}

export const expectNodesWithinCanvas = async (page: Page) => {
  await expect
    .poll(async () => {
      const snapshot = await getVisibleNodes(page)
      if (!snapshot) {
        return ['missing-canvas']
      }

      const margin = 12
      return snapshot.nodes
        .filter((node) => {
          return (
            node.left < snapshot.canvas.left + margin ||
            node.right > snapshot.canvas.right - margin ||
            node.top < snapshot.canvas.top + margin ||
            node.bottom > snapshot.canvas.bottom - margin
          )
        })
        .map((node) => node.label || node.id)
    })
    .toEqual([])
}

export const getFirstCollapsedNodeId = async (page: Page) => {
  const collapsedNode = page.locator('[data-testid="module-node"][data-kind="collapsed"]').first()
  await expect(collapsedNode).toBeVisible()
  const nodeId = await collapsedNode.getAttribute('data-id')
  if (!nodeId) {
    throw new Error('Collapsed node is missing a data-id attribute')
  }
  return nodeId
}

const getNodeCenter = async (page: Page, nodeId: string) => {
  const node = page.locator(`[data-id="${nodeId}"]`).first()
  await expect(node).toBeVisible()
  const box = await node.boundingBox()
  if (!box) {
    throw new Error(`Graph node ${nodeId} does not have a clickable bounding box`)
  }

  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  }
}

export const clickNodeById = async (page: Page, nodeId: string) => {
  const point = await getNodeCenter(page, nodeId)
  await page.mouse.click(point.x, point.y)
}

export const doubleClickNodeById = async (page: Page, nodeId: string) => {
  const point = await getNodeCenter(page, nodeId)
  await page.mouse.dblclick(point.x, point.y)
}

export const clickEmptyCanvasSpace = async (page: Page) => {
  const point = await page.evaluate((selector) => {
    const canvas = document.querySelector('[data-testid="graph-canvas"]') as HTMLElement | null
    if (!canvas) return null

    const canvasRect = canvas.getBoundingClientRect()
    const nodeRects = Array.from(document.querySelectorAll<HTMLElement>(selector))
      .map((node) => node.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0)

    const candidates = [
      { x: canvasRect.left + 24, y: canvasRect.top + 24 },
      { x: canvasRect.left + 24, y: canvasRect.bottom - 24 },
      { x: canvasRect.right - 24, y: canvasRect.top + 24 },
      { x: canvasRect.right - 24, y: canvasRect.bottom - 24 },
    ]

    return (
      candidates.find((candidate) =>
        nodeRects.every(
          (rect) =>
            candidate.x < rect.left ||
            candidate.x > rect.right ||
            candidate.y < rect.top ||
            candidate.y > rect.bottom,
        ),
      ) ?? null
    )
  }, graphNodeSelector)

  if (!point) {
    throw new Error('Could not find an empty point inside the graph canvas')
  }

  await page.mouse.click(point.x, point.y)
}

export const getNodeBox = async (page: Page, nodeId: string) => {
  const box = await page.evaluate((id) => {
    const node = document.querySelector<HTMLElement>(`[data-id="${id}"]`)
    if (!node) {
      return null
    }

    const rect = node.getBoundingClientRect()
    return {
      id,
      label: node.dataset.label ?? '',
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    }
  }, nodeId)

  if (!box) {
    throw new Error(`Missing graph node ${nodeId}`)
  }

  return box as GraphNodeBox
}

export const boxesOverlap = (first: GraphNodeBox, second: GraphNodeBox) => {
  return (
    first.left < second.right &&
    first.right > second.left &&
    first.top < second.bottom &&
    first.bottom > second.top
  )
}

export const getRenderedEdgePaths = async (page: Page) => {
  return page.locator('[data-testid="graph-edge"]').evaluateAll((edges) => {
    return edges
      .map((edge) => {
        const path = edge.querySelector<SVGPathElement>('.react-flow__edge-path')
        return {
          id: edge.getAttribute('data-edge-id') ?? '',
          routingOwner: edge.getAttribute('data-routing-owner') ?? '',
          d: path?.getAttribute('d') ?? '',
        }
      })
      .filter((edge) => edge.d.length > 0)
  })
}
