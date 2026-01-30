import { test, expect } from '@playwright/test'

test('loads config chunk on demand', async ({ page }) => {
  await page.goto('/')

  const firstItem = page.getByTestId('model-item').first()
  await expect(firstItem).toBeVisible({ timeout: 30_000 })
  await firstItem.click()

  await page.waitForSelector('[data-testid="module-node"]', {
    timeout: 30_000,
  })
  const clickPoint = await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="graph-canvas"]')
    if (!canvas) return null
    const canvasRect = canvas.getBoundingClientRect()
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid="module-node"]'),
    )
    const target =
      nodes.find((node) => {
        const rect = node.getBoundingClientRect()
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          rect.right > canvasRect.left + 12 &&
          rect.left < canvasRect.right - 12 &&
          rect.bottom > canvasRect.top + 12 &&
          rect.top < canvasRect.bottom - 12
        )
      }) ?? nodes[0]
    if (!target) return null
    const rect = target.getBoundingClientRect()
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    }
  })

  if (!clickPoint) {
    throw new Error('No module node available to select')
  }

  await page.mouse.click(clickPoint.x, clickPoint.y)

  const loadConfig = page.getByTestId('load-config')
  if (await loadConfig.isVisible()) {
    await loadConfig.click()
  }

  await expect(page.getByTestId('config-json')).toBeVisible({
    timeout: 30_000,
  })

  await page.screenshot({
    path: test.info().outputPath('screenshots/config.png'),
    fullPage: true,
  })
})
