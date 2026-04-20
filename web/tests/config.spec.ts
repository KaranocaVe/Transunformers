import { expect, test } from '@playwright/test'

import { installDeterministicGraphRoutes, MODEL_IDS } from './graph-harness'

test('shows the config export action for deterministic model entries', async ({ page }) => {
  await installDeterministicGraphRoutes(page)
  await page.goto('/')

  const modelItem = page.locator(`[data-testid="model-item"][data-model-id="${MODEL_IDS.collapsed}"]`)
  await expect(modelItem).toBeVisible()
  await modelItem.hover()

  const actionsButton = modelItem.locator('button').first()
  await actionsButton.click({ force: true })

  await expect(page.getByRole('menuitem', { name: 'View Details' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Export Config' })).toBeVisible()
})
