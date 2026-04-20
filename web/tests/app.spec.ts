import { test, expect } from '@playwright/test'

import { installDeterministicGraphRoutes, MODEL_IDS } from './graph-harness'

test('loads home and shows model list', async ({ page }) => {
  await installDeterministicGraphRoutes(page)
  await page.goto('/')

  await expect(page.getByText('Transunformers')).toBeVisible()
  await expect(page.getByTestId('model-search')).toBeVisible()
  await expect(page.locator('[data-testid="model-item"]')).toHaveCount(7)
  await expect(
    page.locator(`[data-testid="model-item"][data-model-id="${MODEL_IDS.collapsed}"]`),
  ).toBeVisible()
})
