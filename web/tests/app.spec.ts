import { test, expect } from '@playwright/test'

test('loads home and shows model list', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Transunformers')).toBeVisible()
  await expect(page.getByTestId('model-search')).toBeVisible()

  const firstItem = page.getByTestId('model-item').first()
  await expect(firstItem).toBeVisible({ timeout: 30_000 })

  await page.screenshot({
    path: test.info().outputPath('screenshots/home.png'),
    fullPage: true,
  })
})
