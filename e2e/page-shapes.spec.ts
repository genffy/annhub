import { test, expect } from './fixtures'
import { markdownToPlainText } from '../learning-core/markdown'
import { clearLibrary, getEntries, hoverForCapsule, selectUntilMenu, triggerBlockMode, waitForClipToast } from './helpers'

/**
 * The page shapes the 2026-10-09 review sampled (RV-TEST-02), in a real browser: the unit tests cover the
 * same DOM in jsdom, but detection and conversion also depend on layout and computed style.
 */

const BASE = 'http://localhost:8173'

test.describe('block detection on real page shapes (capture.md §6.2)', () => {
  test.beforeEach(async ({ context }) => {
    await clearLibrary(context)
  })

  test('a flat document: hovering a paragraph clips its heading run, not the page', async ({ page }) => {
    await page.goto(`${BASE}/flatdoc.html`)
    const capsule = await hoverForCapsule(page, '#flat-install-p')
    await capsule.getByRole('button', { name: '剪藏' }).click()
    await waitForClipToast(page)
    const entry = (await getEntries(page.context()))[0]!
    expect(entry.content).toContain('## Install')
    expect(entry.content).toContain('Installing takes one command')
    expect(entry.content).toContain('A second paragraph in the same section')
    expect(entry.content).not.toContain('Usage')
    expect(entry.content).not.toContain('The introduction explains')
    // the run's own permalink: the page plus the heading's anchor (capture.md §5)
    expect(entry.sourceUrl).toBe(`${BASE}/flatdoc.html#flat-install`)
  })

  test('a flat document: keyboard block mode saves the outlined section as that run, and Tab walks the sections', async ({ page }) => {
    await page.goto(`${BASE}/flatdoc.html`)
    await page.locator('#flat-install-p').evaluate(element => {
      element.setAttribute('tabindex', '0')
      ;(element as HTMLElement).focus()
    })
    await triggerBlockMode(page)
    const kind = page.locator('.ann-block-mode-kind')
    await expect(kind).toContainText('Install')
    await page.keyboard.press('Tab')
    await expect(kind).toContainText('Usage')
    await page.keyboard.press('Shift+Tab')
    await expect(kind).toContainText('Install')
    await page.keyboard.press('Enter')
    await waitForClipToast(page)
    const entry = (await getEntries(page.context()))[0]!
    expect(entry.content).toContain('## Install')
    expect(entry.content).toContain('Installing takes one command')
    expect(entry.content).not.toContain('Usage is a single call')
  })

  test('↑ climbs and ↓ comes back in keyboard block mode', async ({ page }) => {
    await page.goto(`${BASE}/docusaurus.html`)
    await page.locator('#docus-p2').evaluate(element => {
      element.setAttribute('tabindex', '0')
      ;(element as HTMLElement).focus()
    })
    await triggerBlockMode(page)
    const kind = page.locator('.ann-block-mode-kind')
    await expect(kind).toContainText('Configuration')
    await page.keyboard.press('ArrowUp')
    await expect(kind).toContainText('Getting started')
    await page.keyboard.press('ArrowDown')
    await expect(kind).toContainText('Configuration')
    await page.keyboard.press('Enter')
    await waitForClipToast(page)
    const entry = (await getEntries(page.context()))[0]!
    expect(entry.content).toContain('## Configuration')
    expect(entry.content).not.toContain('Getting started covers')
  })

  test('a blog made of divs: the post container is found and clipped whole', async ({ page }) => {
    await page.goto(`${BASE}/divsoup.html`)
    const capsule = await hoverForCapsule(page, '#soup-2')
    await capsule.getByRole('button', { name: '剪藏' }).click()
    await waitForClipToast(page)
    const entry = (await getEntries(page.context()))[0]!
    for (const words of ['first paragraph', 'second paragraph', 'third paragraph']) expect(entry.content).toContain(words)
  })

  test('a documentation page: the section run, then the whole article with 上一级', async ({ page }) => {
    await page.goto(`${BASE}/docusaurus.html`)
    const capsule = await hoverForCapsule(page, '#docus-p2')
    await capsule.getByRole('button', { name: '上一级' }).click()
    await capsule.getByRole('button', { name: '剪藏' }).click()
    await waitForClipToast(page)
    const entry = (await getEntries(page.context()))[0]!
    expect(entry.content).toContain('# Getting started')
    expect(entry.content).toContain('## Configuration')
  })
})

test.describe('page meta on real pages (capture.md §5)', () => {
  test.beforeEach(async ({ context }) => {
    await clearLibrary(context)
  })

  test('author, published date and description fill the clip preset properties', async ({ page }) => {
    await page.goto(`${BASE}/meta-article.html`)
    const menu = await selectUntilMenu(page, '#meta-p')
    await menu.locator('.ann-menu-action').nth(0).click()
    await waitForClipToast(page)
    const entry = (await getEntries(page.context()))[0]!
    expect(entry.properties).toMatchObject({
      title: 'Retries and backpressure — Engineering Notes',
      author: ['Jane Doe'],
      published: '2026-09-12',
      description: 'How retries amplify an outage, and what to do about it.',
    })
  })

  test('a twelve-author byline is split on its separators and never blocks the save', async ({ page }) => {
    await page.goto(`${BASE}/meta-article-authors.html`)
    const menu = await selectUntilMenu(page, '#authors-p')
    await menu.locator('.ann-menu-action').nth(0).click()
    await waitForClipToast(page)
    const entry = (await getEntries(page.context()))[0]!
    expect(entry.properties.author).toHaveLength(12)
    expect((entry.properties.author as string[])[0]).toBe('Ada Lovelace')
    expect(entry.properties.description).toBe('A long byline must not stop the clip from being saved.')
  })
})

test.describe('conversion on real content (capture.md §3.1)', () => {
  test.beforeEach(async ({ context }) => {
    await clearLibrary(context)
  })

  async function clipFocused(page: import('@playwright/test').Page, selector: string): Promise<string> {
    await page.locator(selector).focus()
    await triggerBlockMode(page)
    await expect(page.locator('.ann-block-mode-kind')).toContainText('文章')
    await page.keyboard.press('Enter')
    await waitForClipToast(page)
    return (await getEntries(page.context()))[0]!.content
  }

  test('lists, hard breaks, table cells, code and literal marks are saved as written', async ({ page }) => {
    await page.goto(`${BASE}/content-shapes.html`)
    const content = await clipFocused(page, '#shapes')
    // nested lists indent to the parent's content column
    expect(content).toContain('- Top item\n  - Nested item\n    - Third level')
    expect(content).toContain('- Second top item')
    // <br> is a hard break; inside a table cell it folds to a space
    expect(content).toContain('Line one  \nLine two  \nLine three')
    expect(content).toContain('| cell with a break | plain |')
    // a backtick inside inline code, and a fence inside a code block, outrun the longest run
    expect(content).toContain('``a`b``')
    expect(content).toContain('````\n```nested fence\ninside the block\n````')
    // marks that only look like Markdown stay literal
    expect(content).toContain('2 \\* 3 =\\= 6')
    expect(content).toContain('C:\\\\temp\\\\new')
    expect(content).toContain('snake_case')
    expect(content).toContain('1\\. looks like a list item')
    // and the search side reads the original words back
    const plain = markdownToPlainText(content)
    expect(plain).toContain('2 * 3 == 6')
    expect(plain).toContain('C:\\temp\\new')
    expect(plain).toContain('1. looks like a list item')
  })

  test('page furniture is dropped by whole class words, and look-alikes stay', async ({ page }) => {
    await page.goto(`${BASE}/chrome-classes.html`)
    const content = await clipFocused(page, '#chrome')
    expect(content).toContain('The body of the article is plain prose')
    for (const kept of ['SharePoint notes stay', 'Shadow box stays', 'Broadcast stays']) expect(content).toContain(kept)
    for (const dropped of ['Share this article', 'Related reading', 'Comments are closed']) expect(content).not.toContain(dropped)
  })
})
