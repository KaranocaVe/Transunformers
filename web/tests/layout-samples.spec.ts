import { test, expect } from '@playwright/test'

const samples = [
  { id: 'BertModel__BertConfig', label: 'bert' },
  { id: 'GPT2LMHeadModel__GPT2Config', label: 'gpt2' },
  { id: 'LlamaForCausalLM__LlamaConfig', label: 'llama' },
  { id: 'T5ForConditionalGeneration__T5Config', label: 't5' },
  { id: 'CLIPModel__CLIPConfig', label: 'clip' },
  { id: 'ViTModel__ViTConfig', label: 'vit' },
  { id: 'WhisperForConditionalGeneration__WhisperConfig', label: 'whisper' },
  { id: 'Qwen2MoeModel__Qwen2MoeConfig', label: 'qwen2-moe' },
  { id: 'DeepseekV3ForCausalLM__DeepseekV3Config', label: 'deepseekv3' },
]

test('renders sample layouts', async ({ page }) => {
  await page.goto('/')

  for (const sample of samples) {
    await page.getByTestId('model-search').fill(sample.id)
    const item = page.getByTestId('model-item').first()
    await expect(item).toBeVisible({ timeout: 30_000 })
    await item.click()

    await expect(page.getByTestId('workspace')).toBeVisible()
    await page.waitForSelector('[data-testid="module-node"]', {
      timeout: 30_000,
    })
    await page.waitForTimeout(200)

    await page.screenshot({
      path: test.info().outputPath(`screenshots/${sample.label}.png`),
      fullPage: true,
    })
  }
})
