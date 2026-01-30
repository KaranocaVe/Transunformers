import { test, expect } from '@playwright/test'

test('renders deepseek v3 layout', async ({ page }) => {
  await page.goto('/')

  await page.getByTestId('model-search').fill('DeepseekV3ForCausalLM__DeepseekV3Config')

  const item = page.getByTestId('model-item').first()
  await expect(item).toBeVisible({ timeout: 30_000 })
  await item.click()

  await expect(page.getByTestId('workspace')).toBeVisible()
  await page.waitForSelector('[data-testid="module-node"]', {
    timeout: 30_000,
  })

  await page.screenshot({
    path: test.info().outputPath('screenshots/deepseek.png'),
    fullPage: true,
  })
})
