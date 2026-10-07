// 扩展画板共用的零件：Chrome 外壳、网页模拟、选区菜单、区块剪藏的悬停入口。
const SEL_TEXT = 'the consumer signals demand upstream so the producer slows down, pauses, or drops work it cannot deliver'

const browser = (view, o = {}) => `<div class="bf" style="height:${o.h || 620}px">
  <div class="bf-tabs">
    <div class="bf-lights"><i></i><i></i><i></i></div>
    <div class="bf-tab">${favicon(0)}<span class="truncate grow">${o.title || 'Backpressure in Streams'}</span>${I('x', 'i-sm')}</div>
    ${o.tab2 ? `<div class="bf-tab">${favicon(1)}<span class="truncate grow">${o.tab2}</span>${I('x', 'i-sm')}</div>` : '<div class="bf-tab off" style="min-width:36px;padding:0 10px">' + I('plus', 'i-sm') + '</div>'}
  </div>
  <div class="bf-bar">${I('arrow-left')}${I('arrow-right')}${I('rotate-ccw')}
    <div class="bf-url">${I('lock', 'i-sm')}<span class="truncate">${o.url || 'engineering.example.com/posts/backpressure-in-streams'}</span></div>
    <div class="bf-ext">${I('puzzle')}<svg class="i brandmark" aria-hidden="true"><use href="#i-logo"/></svg></div>
  </div>
  <div class="bf-view">${view}</div>
</div>`

// 网页模拟（始终亮色）。sel: none | sel（蓝色选区）。页面上没有高亮标记：高亮只存在于资料库里（D-19）
// blocks: 给“可剪藏的区块”打上 data-blk（原型用：一节 section、整篇 article、页面底部的一条帖子）
const article = (o = {}) => {
  const selected = o.sel === 'sel' ? `<span class="sel the-sel">${SEL_TEXT}</span>` : SEL_TEXT
  const bl = o.blocks
  return `<div class="pg" style="${o.style || ''}">
    <div class="pg-nav"><b>engineering.example.com</b><span>Articles</span><span>Topics</span><span>About</span></div>
    <div class="pg-art" ${bl ? 'data-blk="article"' : ''}>
      <h1>Backpressure in Streams</h1>
      <div class="pg-by">Platform Engineering · Updated Sep 28 · 9 min read</div>
      <p>When a producer emits events faster than a consumer can process them, something has to give. Queues grow, memory climbs, and eventually the slowest component takes the whole pipeline down with it.</p>
      <p><b>Backpressure</b> is how a system pushes that pain back where it belongs. Instead of letting buffers absorb the mismatch indefinitely, ${selected}.</p>
      ${bl ? '<section data-blk="strategies">' : ''}<h2>Three common strategies</h2>
      <ol><li>Demand signaling: the consumer grants credits and the producer sends no more than it was granted.</li><li>Bounded buffers: queues with a hard limit that block or reject at the edge.</li><li>Load shedding: drop the least valuable work first, on purpose.</li></ol>${bl ? '</section>' : ''}
      ${bl ? '' : '<p>Retries can amplify an outage when the dependency is already saturated. Without a budget, every client retries at once.</p>'}
      ${bl ? `<div class="pc-post" data-blk="post"><article class="tw"><i class="av a2" aria-hidden="true"></i><div class="tw-b"><div class="tw-h"><b>Display Name</b><span>@handle · 3h</span></div><div class="tw-t">Retries without a budget are just a slower way to take your dependency down. A short thread on what we changed ↓</div><div class="tw-l">${I('link', 'i-sm')}example.com/retry-budgets</div></div></article></div>` : ''}
    </div>
    ${o.extra || ''}
  </div>`
}

// 选区菜单（extension.md §2.1）：两项，顺序固定为剪藏、截图；图标 + 短文本，菜单项都用名词。没有“高亮”
const HM_LABELS = {
  zh: { clip: '剪藏', shot: '截图' },
  en: { clip: 'Clip', shot: 'Screenshot' },
}

const hoverMenu = (o = {}) => {
  const L = HM_LABELS[o.lang || 'zh']
  const b = (t, label, i) => `<div class="hm-b t-${t} ${o.hover === i ? 'is-hover' : ''} ${o.focus === i ? 'is-focus' : ''}" role="button" aria-label="${label}">${I(TYPES[t].icon)}<span>${label}</span></div>`
  return `<div class="hm ${o.below ? 'below' : ''} ${o.static ? 'static' : ''}" ${o.anchor ? `data-anchor="${o.anchor}" data-place="${o.below ? 'below' : 'above'}"` : ''} style="${o.style || ''}">
    ${o.pin ? pin(o.pin) : ''}
    ${b('clip', L.clip, 0)}${b('screenshot', L.shot, 1)}
    ${o.tip || ''}
  </div>`
}

const tipBubble = (title, desc, style = '', extra = '') => `<div class="hm-tip tip" style="${style}">${extra}${title}<small>${desc}</small></div>`

// 页面内小视窗：只露出网页的一段，用于局部画板
const miniView = (inner, h = 380) => `<div class="mv" style="height:${h}px">${inner}</div>`

// ── 区块剪藏（提案，D-20）：悬停在整体内容上，区块旁出现“剪藏” ─────────────────
// 入口只是扩展自己的浮层：描边 + 一枚深色胶囊，不改网页，也不在页面上留记号。
const BLK_LABELS = { zh: { clip: '剪藏', up: '选上一级', more: '更多' }, en: { clip: 'Clip', up: 'Select parent', more: 'More' } }

const blkPill = (o = {}) => {
  const L = BLK_LABELS[o.lang || 'zh']
  return `<div class="blk-pill ${o.cls || ''} ${o.press ? 'is-press' : ''}" style="${o.style || ''}" role="group" aria-label="${L.clip}">${o.pin ? pin(o.pin) : ''}
    <span class="bp-seg">${I('bookmark')}<span>${o.saved ? '已剪藏' : L.clip}</span></span>${o.up ? `<i class="sub" aria-label="${L.up}">${I('chevron-up', 'i-sm')}</i>` : ''}<i class="sub" aria-label="${L.more}">${I('ellipsis', 'i-sm')}</i>
  </div>`
}

// o: { faint, saved, pill: {…blkPill 参数}, label }
const blkOverlay = (o = {}) => `<i class="blk ${o.faint ? 'is-faint' : ''} ${o.saved ? 'is-saved' : ''} ${o.skip ? 'is-skip' : ''}" aria-hidden="true">${o.label ? `<em>${o.label}</em>` : ''}${o.pin ? pin(o.pin, 'pin-in-r') : ''}</i>${o.pill ? blkPill(o.pill) : ''}`

// 社交信息流里的一条内容
const tweet = (o = {}) => `<article class="tw ${o.hover ? 'is-hover' : ''}">
  <i class="av ${o.av || ''}" aria-hidden="true"></i>
  <div class="tw-b">
    <div class="tw-h"><b>Display Name</b><span>@handle · ${o.t || '3h'}</span></div>
    <div class="tw-t">${o.text}</div>
    ${o.link ? `<div class="tw-l">${I('link', 'i-sm')}${o.link}</div>` : ''}
    <div class="tw-m"><span>${I('message-square-text', 'i-sm')}${o.n1 || 12}</span><span>${I('rotate-ccw', 'i-sm')}${o.n2 || 48}</span><span>${I('arrow-up-right', 'i-sm')}</span></div>
  </div>
  ${o.hover ? blkOverlay(o.blk || { pill: {} }) : ''}
</article>`

const feedPage = (o = {}) => `<div class="pg pg-feed" style="${o.style || ''}">
  <div class="feed-h"><b>Home</b><span class="on">For you</span><span>Following</span></div>
  <div class="feed">
    ${tweet({ t: '5h', av: 'a1', text: 'Shipped the new retry budget today. p99 dropped 38% during the incident replay.' })}
    ${tweet({ t: '3h', av: 'a2', hover: o.hover !== false, blk: o.blk, text: 'Retries without a budget are just a slower way to take your dependency down. A short thread on what we changed ↓', link: 'example.com/retry-budgets', n1: 31, n2: 212 })}
    ${tweet({ t: '1h', av: 'a3', text: 'Reminder: idempotency keys should outlive the retry window.' })}
  </div>
</div>`

// 一篇带分节的文章：每一节是一个可剪藏的区块。o.hover: 's2'（悬停的节）；o.blk: 该节的悬停参数；o.outer: 外层 article 的淡描边
const retriesPage = (o = {}) => `<div class="pg pg-rt" style="${o.style || ''}">
  <div class="pg-nav"><b>engineering.example.com</b><span>Articles</span><span>Topics</span><span>About</span></div>
  <div class="pg-art ${o.outer ? 'has-outer' : ''}">
    ${o.outer ? blkOverlay(o.outer) : ''}
    <h1>Retries and backpressure</h1>
    <div class="pg-by">Platform Engineering · Updated Sep 12 · 7 min read</div>
    <p>A retry is a bet that the next attempt will succeed. When the dependency is already failing, it is a bet against everyone else.</p>
    <section class="sx ${o.hover === 's1' ? 'is-hover' : ''}">
      <h2>重试风暴</h2>
      <p>依赖已经饱和时，每一次重试都在给一个正在失败的系统加负载；没有预算，所有客户端会同时重试。</p>
      ${o.hover === 's1' ? blkOverlay(o.blk || { pill: {} }) : ''}
    </section>
    <section class="sx ${o.hover === 's2' ? 'is-hover' : ''}">
      <h2>指数退避加抖动</h2>
      <p>重试不要立刻发出：每次失败后把等待时间翻倍，直到上限，再乘一个 0–1 的<b>随机因子</b>，让客户端不再同时重试。</p>
      <ol><li>从一个较小的基础间隔开始。</li><li>每次失败后翻倍，不超过上限。</li><li>乘一个 0–1 的随机因子（抖动）。</li></ol>
      <p>完整推导见 <a>AWS 架构博客</a>。</p>
      ${o.hover === 's2' ? blkOverlay(o.blk || { pill: {} }) : ''}
    </section>
    <section class="sx"><h2>重试预算</h2><p>给每个下游设一个重试配额，用完就快速失败。</p></section>
  </div>
</div>`
