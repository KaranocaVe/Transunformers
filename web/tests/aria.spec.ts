import { test, expect } from '@playwright/test'

test('renders Aria layout', async ({ page }) => {
  await page.goto('/')

  const sample = 'AriaForConditionalGeneration__AriaConfig'
  await page.getByTestId('model-search').fill(sample)
  const item = page.getByTestId('model-item').first()
  await expect(item).toBeVisible({ timeout: 30_000 })
  await item.click()

  await expect(page.getByTestId('workspace')).toBeVisible()
  await page.waitForSelector('[data-testid="module-node"]', {
    timeout: 30_000,
  })
  await page.waitForTimeout(200)

  await page.screenshot({
    path: test.info().outputPath('screenshots/aria.png'),
    fullPage: true,
  })
})
