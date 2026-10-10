/**
 * Page text that reads like Markdown, pinned once for everything that reads what the converter writes
 * (RV-CORE-04, RK-13). The same cases run through the converter (content script), the search/quote readers
 * (learning-core) and the reading view (library): whichever of them stops agreeing with the others fails here,
 * instead of showing up as a highlight that is off by one character in a clip nobody tested.
 *
 *   html      what the page has
 *   markdown  what the converter writes for it (the content test pins this)
 *   visible   what a reader sees, whitespace folded (every reader must give this back)
 */
export interface PageTextCase {
  name: string
  html: string
  markdown: string
  visible: string
}

export const PAGE_TEXT_CASES: PageTextCase[] = [
  { name: 'a star between numbers', html: '<p>2 * 3 = 6</p>', markdown: '2 \\* 3 = 6', visible: '2 * 3 = 6' },
  { name: 'a literal highlight mark', html: '<p>if a == b and c == d</p>', markdown: 'if a =\\= b and c =\\= d', visible: 'if a == b and c == d' },
  { name: 'backslashes in a path', html: '<p>path C:\\temp\\new</p>', markdown: 'path C:\\\\temp\\\\new', visible: 'path C:\\temp\\new' },
  { name: 'ordered-list lookalikes', html: '<p>1. First step</p><p>10) ten</p>', markdown: '1\\. First step\n\n10\\) ten', visible: '1. First step 10) ten' },
  {
    name: 'heading, quote and bullet lookalikes',
    html: '<p># Not a heading</p><p>&gt; not a quote</p><p>- not a bullet</p>',
    markdown: '\\# Not a heading\n\n\\> not a quote\n\n\\- not a bullet',
    visible: '# Not a heading > not a quote - not a bullet',
  },
  {
    name: 'brackets and a fake link',
    html: '<p>see [1] and [text](not a link)</p>',
    markdown: 'see \\[1\\] and \\[text\\](not a link)',
    visible: 'see [1] and [text](not a link)',
  },
  { name: 'underscores', html: '<p>user_id, __init__ and _private</p>', markdown: 'user_id, \\_\\_init_\\_ and \\_private', visible: 'user_id, __init__ and _private' },
  { name: 'angle brackets', html: '<p>a &lt; b &gt; c</p>', markdown: 'a \\< b \\> c', visible: 'a < b > c' },
  { name: 'inline code holding a backtick', html: '<p>run <code>a`b</code> now</p>', markdown: 'run ``a`b`` now', visible: 'run a`b now' },
  {
    name: 'inline code holding markers',
    html: '<p>use <code>*args</code>, <code>__init__</code> and <code>C:\\tmp</code></p>',
    markdown: 'use `*args`, `__init__` and `C:\\tmp`',
    visible: 'use *args, __init__ and C:\\tmp',
  },
  {
    name: 'a code block holding a fence, and text after it',
    html: '<p>before</p><pre><code>```ts\nlet x = 1</code></pre><p>after 2 * 3 == 6</p>',
    markdown: 'before\n\n````\n```ts\nlet x = 1\n````\n\nafter 2 \\* 3 =\\= 6',
    visible: 'before ```ts let x = 1 after 2 * 3 == 6',
  },
  { name: 'a nested list', html: '<ul><li>one<ul><li>two</li></ul></li></ul>', markdown: '- one\n  - two', visible: 'one two' },
  {
    name: 'emphasis and a link whose address has parentheses',
    html: '<p>very <strong>bold</strong> and <a href="https://x.example/Foo_(bar)">the wiki</a></p>',
    markdown: 'very **bold** and [the wiki](https://x.example/Foo_%28bar%29)',
    visible: 'very bold and the wiki',
  },
  { name: 'a hard break', html: '<p>a<br>b</p>', markdown: 'a  \nb', visible: 'a b' },
  {
    name: 'a table with a break in a cell',
    html: '<table><thead><tr><th>Key</th><th>Value</th></tr></thead><tbody><tr><td>cell<br>two</td><td>x</td></tr></tbody></table>',
    markdown: '| Key | Value |\n| --- | --- |\n| cell two | x |',
    visible: 'Key Value cell two x',
  },
]

/** Whitespace folded the way every reader's output is compared. */
export const fold = (text: string): string => text.replace(/\s+/g, ' ').trim()
