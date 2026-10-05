/**
 * Desktop connection settings: the pairing code is write-only from the page, and
 * the endpoint can only be a loopback origin (the code goes with every request).
 */
import { test, expect } from './fixtures'
import { ensureServiceWorker, getStorageViaServiceWorker } from './helpers'

const CODE = 'E2E-PAIR-CODE-1234'

async function resetConnection(context: Parameters<typeof ensureServiceWorker>[0]) {
  const sw = await ensureServiceWorker(context)
  await sw.evaluate(() => new Promise<void>(resolve => chrome.storage.local.remove('desktopDirectConnect', () => resolve())))
}

test.describe('Desktop connection settings', () => {
  test('a saved pairing code is never shown or returned to the page; unpairing clears it', async ({ page, context, extensionId }) => {
    try {
      await page.goto(`chrome-extension://${extensionId}/options.html#/settings`)
      const input = page.getByTestId('pair-token-input')
      await expect(input).toHaveAttribute('type', 'password')
      await expect(input).toHaveAttribute('placeholder', '粘贴 Desktop 显示的配对码')

      await input.fill(CODE)
      await page.getByRole('button', { name: '保存配置' }).click()
      await expect(page.getByText('已保存 Desktop 连接配置')).toBeVisible()

      // The field is emptied and says a code exists, without revealing it.
      await expect(input).toHaveValue('')
      await expect(input).toHaveAttribute('placeholder', /已保存/)
      await page.reload()
      await expect(page.getByTestId('pair-token-input')).toHaveAttribute('placeholder', /已保存/)
      expect(await page.content()).not.toContain(CODE)

      // The background answers the page without the code.
      const reply = await page.evaluate(() => chrome.runtime.sendMessage({ type: 'GET_DESKTOP_DIRECT_CONNECT' }))
      expect(reply.success).toBe(true)
      expect(reply.data.config).toEqual({ endpoint: 'http://127.0.0.1:8765', autoSync: false, hasToken: true })
      expect(JSON.stringify(reply)).not.toContain(CODE)
      // It is stored for the service worker, which is what delivery needs.
      expect((await getStorageViaServiceWorker(context, ['desktopDirectConnect'])).desktopDirectConnect.token).toBe(CODE)

      // Saving other settings with the field left empty keeps the code.
      await page.getByRole('checkbox', { name: /保存后自动逐条交付/ }).check()
      await page.getByRole('button', { name: '保存配置' }).click()
      await expect(page.getByText('已保存 Desktop 连接配置')).toBeVisible()
      expect((await getStorageViaServiceWorker(context, ['desktopDirectConnect'])).desktopDirectConnect.token).toBe(CODE)

      await page.getByTestId('unpair').click()
      await expect(page.getByText('已取消配对')).toBeVisible()
      await expect(page.getByTestId('pair-token-input')).toHaveAttribute('placeholder', '粘贴 Desktop 显示的配对码')
      await expect(page.getByTestId('unpair')).toHaveCount(0)
      expect((await getStorageViaServiceWorker(context, ['desktopDirectConnect'])).desktopDirectConnect.token).toBe('')
    } finally {
      await resetConnection(context)
    }
  })

  test('an endpoint outside this computer is rejected and nothing is saved', async ({ page, context, extensionId }) => {
    try {
      await page.goto(`chrome-extension://${extensionId}/options.html#/settings`)
      const endpoint = page.getByPlaceholder('http://127.0.0.1:8765')
      await endpoint.fill('https://sync.example.com')
      await page.getByTestId('pair-token-input').fill(CODE)
      await page.getByRole('button', { name: '保存配置' }).click()

      await expect(page.getByText(/必须是本机的 Desktop 服务/)).toBeVisible()
      expect((await getStorageViaServiceWorker(context, ['desktopDirectConnect'])).desktopDirectConnect).toBeUndefined()

      await endpoint.fill('http://localhost:9000/')
      await page.getByRole('button', { name: '保存配置' }).click()
      await expect(page.getByText('已保存 Desktop 连接配置')).toBeVisible()
      await page.reload()
      await expect(page.getByPlaceholder('http://127.0.0.1:8765')).toHaveValue('http://localhost:9000')
    } finally {
      await resetConnection(context)
    }
  })
})
