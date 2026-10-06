// 设计画布的骨架：章节 / 分组 / 画板的生成，自适应缩放，主题与标注开关，灯箱。
const DOC_BASE = '../../v2/'

// 'extension §4.1 · kinds §4' → 指向 docs/v2 对应文件的链接
const docRef = s =>
  s
    .split(' · ')
    .map(part => {
      const [name, ...rest] = part.split(' ')
      const file = DOC_FILES[name]
      const label = `${file || name}${rest.length ? ` ${rest.join(' ')}` : ''}`
      return file ? `<a class="cv-ref" href="${DOC_BASE}${file}" target="_blank" rel="noopener">${label}</a>` : `<span class="cv-ref">${label}</span>`
    })
    .join('')

let boardSeq = 0

// o: { title, w, h?, body, notes?, ref?, tag?, proposal?, live?, cls? }
// h 省略时按内容高度自适应
const board = o => {
  const id = o.id || `b${++boardSeq}`
  const tagHtml = [o.tag && `<span class="cv-tag">${o.tag}</span>`, o.proposal && `<span class="cv-tag is-proposal">提案 · 文档未定义</span>`, o.live && `<span class="cv-tag is-live">可交互</span>`]
    .filter(Boolean)
    .join('')
  const notes = o.notes && o.notes.length ? `<ol class="cv-notes">${o.notes.map(n => `<li>${n}</li>`).join('')}</ol>` : ''
  return `<figure class="cv-board ${o.live ? 'is-live' : ''}" id="${id}" data-w="${o.w}" style="margin:0">
    <div class="cv-board-head"><h4>${o.title}</h4>${tagHtml}${o.ref ? `<span class="cv-refs">${docRef(o.ref)}</span>` : ''}</div>
    <div class="cv-frame">
      <div class="cv-scale"><div class="cv-canvas ${o.cls || 'ui'}" style="width:${o.w}px;${o.h ? `height:${o.h}px;` : ''}${o.style || ''}">${o.body}</div></div>
      ${o.live ? '' : `<button type="button" class="cv-expand" aria-label="放大查看" data-expand>${I('maximize-2')}</button>`}
    </div>
    ${notes}
  </figure>`
}

const row = (...items) => `<div class="cv-row">${items.flat().join('')}</div>`

const group = (o, ...rows) => `<div class="cv-group" id="${o.id}">
  <h3 class="cv-h3">${o.title}${o.small ? `<small>${o.small}</small>` : ''}</h3>
  ${o.desc ? `<p class="cv-desc">${o.desc}</p>` : ''}
  ${rows.flat().join('')}
</div>`

// groups: [{id, title, ...}] 用于生成章节顶部的小导航
const section = (o, ...groups) => `<section class="cv-section" id="${o.id}" data-title="${o.nav}">
  <div class="cv-eyebrow">${o.eyebrow}</div>
  <h2 class="cv-h2">${o.title}</h2>
  ${o.lead ? `<p class="cv-lead">${o.lead}</p>` : ''}
  ${o.sub ? `<nav class="cv-subnav">${o.sub.map(([id, label]) => `<a href="#${id}">${label}</a>`).join('')}</nav>` : ''}
  ${groups.flat().join('')}
</section>`

// ── 运行时 ────────────────────────────────────────────────────────────────

function fitBoards() {
  document.querySelectorAll('.cv-row').forEach(rowEl => {
    const boards = [...rowEl.children].filter(el => el.classList.contains('cv-board'))
    if (!boards.length) return
    const gap = parseFloat(getComputedStyle(rowEl).columnGap) || 28
    const total = boards.reduce((s, b) => s + +b.dataset.w, 0) + gap * (boards.length - 1)
    const fitAll = Math.min(1, rowEl.clientWidth / total)
    // 并排会缩得太小（窄窗口）时改为逐块换行，每块各自按行宽缩放
    const stack = boards.length > 1 && fitAll < 0.62
    rowEl.style.flexWrap = stack ? 'wrap' : 'nowrap'
    boards.forEach(b => {
      const w = +b.dataset.w
      const s = stack ? Math.min(1, rowEl.clientWidth / w) : fitAll
      const canvas = b.querySelector('.cv-canvas')
      b.querySelector('.cv-scale').style.transform = s === 1 ? '' : `scale(${s})`
      const frame = b.querySelector('.cv-frame')
      frame.style.width = `${w * s}px`
      frame.style.height = `${canvas.offsetHeight * s}px`
      b.style.width = `${Math.max(w * s, 300)}px`
      b.__scale = s
    })
  })
  placeAnchored()
}

// 带 data-anchor 的元素（如选区菜单）按目标元素的实际位置摆放，避免手写坐标随字体回退而错位
function placeAnchored() {
  document.querySelectorAll('[data-anchor]').forEach(el => {
    const view = el.offsetParent
    if (!view) return
    const target = view.querySelector(el.dataset.anchor)
    if (!target) return
    const rects = target.getClientRects()
    const r = el.dataset.rect === 'last' ? rects[rects.length - 1] : rects[0]
    if (!r) return
    const board = el.closest('.cv-board')
    const scale = (board && board.__scale) || 1
    const vr = view.getBoundingClientRect()
    const cx = (r.left + r.width / 2 - vr.left) / scale
    const w = el.offsetWidth
    const h = el.offsetHeight
    const left = Math.min(Math.max(8, cx - w / 2), view.clientWidth - w - 8)
    const below = el.dataset.place === 'below'
    el.style.left = `${left}px`
    el.style.top = `${below ? (r.bottom - vr.top) / scale + 10 : (r.top - vr.top) / scale - h - 10}px`
    el.style.setProperty('--caret', `${cx - left}px`)
  })
}

let fitQueued = false
const queueFit = () => {
  if (fitQueued) return
  fitQueued = true
  requestAnimationFrame(() => {
    fitQueued = false
    fitBoards()
  })
}

function initChrome() {
  const root = document.documentElement
  const themeBtn = document.getElementById('tool-theme')
  const pinsBtn = document.getElementById('tool-pins')
  const saved = localStorage.getItem('annhub-design-theme')
  if (saved) root.dataset.theme = saved
  const syncTheme = () => {
    const dark = root.dataset.theme === 'dark'
    themeBtn.setAttribute('aria-pressed', String(dark))
    themeBtn.querySelector('span').textContent = dark ? '暗色' : '亮色'
    themeBtn.querySelector('use').setAttribute('href', dark ? '#i-moon' : '#i-sun')
  }
  syncTheme()
  themeBtn.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem('annhub-design-theme', root.dataset.theme)
    syncTheme()
    if (typeof fillSystemRuntime === 'function') requestAnimationFrame(fillSystemRuntime)
  })
  const pinsOn = localStorage.getItem('annhub-design-pins') !== '0'
  document.body.classList.toggle('pins-on', pinsOn)
  pinsBtn.setAttribute('aria-pressed', String(pinsOn))
  pinsBtn.addEventListener('click', () => {
    const on = !document.body.classList.contains('pins-on')
    document.body.classList.toggle('pins-on', on)
    pinsBtn.setAttribute('aria-pressed', String(on))
    localStorage.setItem('annhub-design-pins', on ? '1' : '0')
  })

  // 灯箱：按 100% 展示静态克隆
  const box = document.getElementById('lightbox')
  const body = box.querySelector('.cv-lightbox-body')
  const close = () => {
    box.classList.remove('is-open')
    body.innerHTML = ''
  }
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-expand]')
    if (t) {
      const canvas = t.closest('.cv-board').querySelector('.cv-canvas')
      body.innerHTML = ''
      body.appendChild(canvas.cloneNode(true))
      box.classList.add('is-open')
    }
    if (e.target === box || e.target.closest('.cv-lightbox-close') || e.target === body) close()
  })
  document.addEventListener('keydown', e => e.key === 'Escape' && close())

  // 滚动时高亮当前章节
  const links = [...document.querySelectorAll('.cv-nav a')]
  const io = new IntersectionObserver(
    entries => {
      entries.forEach(en => {
        if (en.isIntersecting) links.forEach(a => a.classList.toggle('is-active', a.getAttribute('href') === `#${en.target.id}`))
      })
    },
    { rootMargin: '-30% 0px -60% 0px' },
  )
  document.querySelectorAll('.cv-section').forEach(s => io.observe(s))

  window.addEventListener('resize', queueFit)
  window.addEventListener('load', queueFit)
  document.fonts && document.fonts.ready.then(queueFit)
}
