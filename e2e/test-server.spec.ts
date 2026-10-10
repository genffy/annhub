import { test, expect } from '@playwright/test'

test('fixture server exposes fixtures but not repository files', async ({ request }) => {
  expect((await request.get('http://127.0.0.1:8173/capture.html')).status()).toBe(200)
  expect((await request.get('http://127.0.0.1:8173/.git/config')).status()).toBe(404)
  expect((await request.get('http://127.0.0.1:8173/package.json')).status()).toBe(404)
})
