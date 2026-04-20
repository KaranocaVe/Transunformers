import { expect, test } from '@playwright/test'

import {
  boxesOverlap,
  clearSelectedModel,
  clickEmptyCanvasSpace,
  clickNodeById,
  doubleClickNodeById,
  dragSidebarTo,
  expectNodesWithinCanvas,
  getFirstCollapsedNodeId,
  getGraphNodeCount,
  getLayoutRevision,
  getNodeBox,
  getRenderedEdgePaths,
  getVisibleLabels,
  installDeterministicGraphRoutes,
  LONG_LABEL_NODE_IDS,
  MODEL_IDS,
  selectModel,
  setLayoutDirection,
  setSortBy,
  setViewMode,
  waitForWorkspaceReady,
} from './graph-harness'

test('handles empty and single-node graph states without stale leftovers', async ({ page }) => {
  await installDeterministicGraphRoutes(page)
  await page.goto('/')

  await expect(page.getByTestId('workspace-empty')).toBeVisible()

  await selectModel(page, MODEL_IDS.single)
  await waitForWorkspaceReady(page, MODEL_IDS.single)
  await expect(page.getByTestId('workspace-title')).toContainText('SingleNodeModel')
  await expect.poll(async () => await getGraphNodeCount(page)).toBe(1)
  await expectNodesWithinCanvas(page)

  await selectModel(page, MODEL_IDS.empty)
  await waitForWorkspaceReady(page, MODEL_IDS.empty, { expectNodes: false })
  await expect(page.getByTestId('workspace-title')).toContainText('EmptyGraphModel')
  await expect(page.getByTestId('graph-canvas')).toBeVisible()
  await expect(page.locator('[data-testid="module-node"], [data-testid="group-node"]')).toHaveCount(0)
  await expect(page.getByTestId('workspace')).toHaveAttribute('data-graph-edge-count', '0')

  await clearSelectedModel(page)
  await expect(page.getByTestId('workspace-empty')).toBeVisible()
})

test('refits complex graphs after resize, selection, relayout, and collapsed-stack toggles', async ({ page }) => {
  await installDeterministicGraphRoutes(page)
  await page.goto('/')

  await selectModel(page, MODEL_IDS.collapsed)
  await waitForWorkspaceReady(page, MODEL_IDS.collapsed)
  await expectNodesWithinCanvas(page)

  const collapsedNodeId = await getFirstCollapsedNodeId(page)
  await expect(
    page.locator(`[data-testid="group-node"][data-id="collapsed.encoder"][data-expanded="true"]`),
  ).toBeVisible()
  await clickNodeById(page, collapsedNodeId)
  await expect(page.getByTestId('inspector')).toBeVisible()
  await expect(page.getByTestId('inspector-title')).toBeVisible()

  const stableRevision = await getLayoutRevision(page)
  for (const targetX of [300, 520, 340, 480]) {
    await dragSidebarTo(page, targetX)
    await expectNodesWithinCanvas(page)
    await expect.poll(async () => await getLayoutRevision(page)).toBe(stableRevision)
    await expect(
      page.locator(
        `[data-testid="module-node"][data-id="${collapsedNodeId}"][data-selected="true"]`,
      ),
    ).toBeVisible()
  }

  await setSortBy(page, 'name')
  await expect.poll(async () => await getLayoutRevision(page)).toBe(stableRevision)
  await expect(
    page.locator(`[data-testid="module-node"][data-id="${collapsedNodeId}"][data-selected="true"]`),
  ).toBeVisible()

  await clickEmptyCanvasSpace(page)
  await expect(page.getByTestId('inspector')).toBeHidden()
  await expectNodesWithinCanvas(page)

  const relayoutRevision = await getLayoutRevision(page)
  await setLayoutDirection(page, 'RIGHT')
  await expect.poll(async () => await getLayoutRevision(page)).toBeGreaterThan(relayoutRevision)
  await waitForWorkspaceReady(page, MODEL_IDS.collapsed)
  await expect(page.getByTestId('workspace')).toHaveAttribute('data-layout-direction', 'RIGHT')
  await expectNodesWithinCanvas(page)

  const expandedNodeCount = await getGraphNodeCount(page)
  const collapseRevision = await getLayoutRevision(page)
  await doubleClickNodeById(page, collapsedNodeId)
  await expect.poll(async () => await getLayoutRevision(page)).toBeGreaterThan(collapseRevision)
  await expect(
    page.locator(`[data-testid="group-node"][data-id="${collapsedNodeId}"][data-expanded="true"]`),
  ).toBeVisible()
  await expect.poll(async () => await getGraphNodeCount(page)).toBeGreaterThan(expandedNodeCount)
  await expectNodesWithinCanvas(page)

  const expandedStackNodeCount = await getGraphNodeCount(page)
  const expandRevision = await getLayoutRevision(page)
  await page
    .locator(`[data-testid="group-node"][data-id="${collapsedNodeId}"]`)
    .dblclick({ position: { x: 24, y: 24 } })
  await expect.poll(async () => await getLayoutRevision(page)).toBeGreaterThan(expandRevision)
  await expect(
    page.locator(`[data-testid="module-node"][data-id="${collapsedNodeId}"][data-expanded="false"]`),
  ).toBeVisible()
  await expect.poll(async () => await getGraphNodeCount(page)).toBeLessThan(expandedStackNodeCount)
  await expectNodesWithinCanvas(page)
})

test('keeps a deterministic disconnected-branch scenario visible and stable', async ({ page }) => {
  await installDeterministicGraphRoutes(page)
  await page.goto('/')

  await selectModel(page, MODEL_IDS.disconnected)
  await waitForWorkspaceReady(page, MODEL_IDS.disconnected)
  await expect(page.getByTestId('workspace-title')).toContainText('DisconnectedBranchesModel')
  await expectNodesWithinCanvas(page)

  await expect
    .poll(async () => {
      const labels = await getVisibleLabels(page)
      return [
        labels.includes('DisconnectedLeftLeaf'),
        labels.includes('DisconnectedRightLeaf'),
        labels.includes('disconnected_bridge_probe'),
      ]
    })
    .toEqual([true, true, true])

  await expect.poll(async () => await getGraphNodeCount(page)).toBeGreaterThan(4)
})

test('keeps long labels separated and parallel branches on distinct routed edges', async ({ page }) => {
  await installDeterministicGraphRoutes(page)
  await page.goto('/')

  await selectModel(page, MODEL_IDS.longLabel)
  await waitForWorkspaceReady(page, MODEL_IDS.longLabel)
  await expectNodesWithinCanvas(page)

  const attentionNode = await getNodeBox(page, LONG_LABEL_NODE_IDS.attention)
  const feedForwardNode = await getNodeBox(page, LONG_LABEL_NODE_IDS.feedForward)

  expect(attentionNode.width).toBeGreaterThan(240)
  expect(feedForwardNode.width).toBeGreaterThan(240)
  expect(boxesOverlap(attentionNode, feedForwardNode)).toBe(false)

  await selectModel(page, MODEL_IDS.parallel)
  await waitForWorkspaceReady(page, MODEL_IDS.parallel)
  await expectNodesWithinCanvas(page)

  await expect.poll(async () => (await getRenderedEdgePaths(page)).length).toBe(2)
  const edgePaths = await getRenderedEdgePaths(page)

  expect(new Set(edgePaths.map((edge) => edge.d)).size).toBe(edgePaths.length)
  expect(edgePaths.every((edge) => edge.routingOwner === 'elk')).toBe(true)
})

test('ignores stale manifest and chunk responses during rapid graph interactions', async ({ page }) => {
  await installDeterministicGraphRoutes(page, {
    manifestDelays: {
      [`${MODEL_IDS.collapsed}/model.json`]: 350,
    },
    chunkDelays: {
      [`${MODEL_IDS.chunked}/chunks/modules.compact_tree.json`]: 350,
      [`${MODEL_IDS.chunked}/chunks/modules.tree.json`]: 25,
    },
  })
  await page.goto('/')

  const delayedManifestRequest = page.waitForRequest(`**/data/models/${MODEL_IDS.collapsed}/model.json`)
  await selectModel(page, MODEL_IDS.collapsed)
  await delayedManifestRequest

  await selectModel(page, MODEL_IDS.parallel)
  await waitForWorkspaceReady(page, MODEL_IDS.parallel)
  await expect(page.getByTestId('workspace-title')).toContainText('ParallelRoutesModel')
  await expectNodesWithinCanvas(page)
  await expect.poll(async () => (await getVisibleLabels(page)).some((label) => label.includes('Collapsed'))).toBe(false)
  await expect.poll(async () => (await getVisibleLabels(page)).some((label) => label.includes('Parallel'))).toBe(true)

  const compactRequest = page.waitForRequest(
    `**/data/models/${MODEL_IDS.chunked}/chunks/modules.compact_tree.json`,
  )
  await selectModel(page, MODEL_IDS.chunked)
  await compactRequest

  const fullRequest = page.waitForRequest(`**/data/models/${MODEL_IDS.chunked}/chunks/modules.tree.json`)
  await setViewMode(page, 'full')
  await fullRequest

  await waitForWorkspaceReady(page, MODEL_IDS.chunked)
  await expect(page.getByTestId('workspace')).toHaveAttribute('data-view-mode', 'full')
  await expectNodesWithinCanvas(page)
  await expect.poll(async () => (await getVisibleLabels(page)).some((label) => label.includes('GammaFullOnly'))).toBe(true)
  await expect
    .poll(async () => (await getVisibleLabels(page)).some((label) => label.includes('GammaCompactOnly')))
    .toBe(false)
})
