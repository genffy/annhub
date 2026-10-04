/**
 * The optional model Provider (ai.md §5, §8): the key is write-only from the settings page, and
 * saving other fields never erases it.
 */
import { test, expect } from './fixtures'
import { ensureServiceWorker, getStorageViaServiceWorker } from './helpers'

const KEY = 'sk-e2e-secret-key'

test('the stored API key is never shown or returned, and editing the model keeps it', async ({ page, context, extensionId }) => {
  try {
    await page.goto(`chrome-extension://${extensionId}/options.html#/settings`)
    await page.getByTestId('llm-base-url').fill('https://llm.example.com/v1')
    await page.getByTestId('llm-api-key').fill(KEY)
    await page.getByTestId('llm-model').fill('model-one')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page.getByText('已保存 LLM 配置')).toBeVisible()

    // The field empties and says a key exists, without revealing it.
    await expect(page.getByTestId('llm-api-key')).toHaveValue('')
    await expect(page.getByTestId('llm-api-key')).toHaveAttribute('placeholder', /已保存/)
    await page.reload()
    await expect(page.getByTestId('llm-model')).toHaveValue('model-one')
    expect(await page.content()).not.toContain(KEY)

    const reply = await page.evaluate(() => chrome.runtime.sendMessage({ type: 'GET_LLM_CONFIG' }))
    expect(reply.data).toMatchObject({ baseUrl: 'https://llm.example.com/v1', model: 'model-one', hasApiKey: true })
    expect(JSON.stringify(reply)).not.toContain(KEY)

    // Saving with only the model changed must not wipe the key (it used to be sent back empty).
    await page.getByTestId('llm-model').fill('model-two')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page.getByText('已保存 LLM 配置')).toBeVisible()
    const stored = (await getStorageViaServiceWorker(context, ['llmConfig'])).llmConfig
    expect(stored).toMatchObject({ apiKey: KEY, model: 'model-two' })
  } finally {
    const sw = await ensureServiceWorker(context)
    await sw.evaluate(() => new Promise<void>(resolve => chrome.storage.local.remove('llmConfig', () => resolve())))
  }
})
