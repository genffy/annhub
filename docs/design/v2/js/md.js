// 设计稿里的极简 Markdown（只为画板与原型服务，不是产品实现）：
// 标题、段落、有序 / 无序列表、引用、围栏代码块、行内代码、粗体、链接、图片占位；不解析原始 HTML。
// 渲染出的每段文字都带 data-s（它在 content 里的起点），选区据此换算回 content 的字符偏移，
// 与 entry.md §4 的约定一致：高亮的范围是 Markdown 源文本里的偏移，不是渲染后的偏移。

const mdLines = src => {
  let at = 0
  return src.split('\n').map(t => {
    const l = { t, at }
    at += t.length + 1
    return l
  })
}

// 把 [from, to) 里的行内记号切成片段：text | b | code | a | img
function mdInline(src, from, to) {
  const out = []
  const seg = src.slice(from, to)
  const re = /!\[([^\]]*)\]\(([^)\s]+)\)|\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`|\*\*([^*]+)\*\*/g
  let p = from
  let m
  while ((m = re.exec(seg))) {
    const ms = from + m.index
    if (ms > p) out.push({ k: 'text', s: p, e: ms })
    if (m[1] !== undefined) out.push({ k: 'img', alt: m[1], url: m[2] })
    else if (m[3] !== undefined) out.push({ k: 'a', url: m[4], s: ms + 1, e: ms + 1 + m[3].length })
    else if (m[5] !== undefined) out.push({ k: 'code', s: ms + 1, e: ms + 1 + m[5].length })
    else out.push({ k: 'b', s: ms + 2, e: ms + 2 + m[6].length })
    p = ms + m[0].length
  }
  if (p < to) out.push({ k: 'text', s: p, e: to })
  return out
}

function mdBlocks(src) {
  const blocks = []
  let cur = null
  let fence = null
  for (const { t, at } of mdLines(src)) {
    if (fence) {
      if (/^```\s*$/.test(t)) fence = null
      else fence.lines.push({ s: at, e: at + t.length })
      continue
    }
    const fm = /^```(\S*)\s*$/.exec(t)
    if (fm) {
      blocks.push((fence = { k: 'code', lang: fm[1], lines: [] }))
      cur = null
      continue
    }
    if (!t.trim()) {
      cur = null
      continue
    }
    let m
    if ((m = /^(#{1,4})\s+/.exec(t))) {
      blocks.push({ k: 'h', lv: m[1].length, s: at + m[0].length, e: at + t.length })
      cur = null
    } else if ((m = /^\d+\.\s+/.exec(t))) {
      if (!cur || cur.k !== 'ol') blocks.push((cur = { k: 'ol', items: [] }))
      cur.items.push({ s: at + m[0].length, e: at + t.length })
    } else if ((m = /^[-*]\s+/.exec(t))) {
      if (!cur || cur.k !== 'ul') blocks.push((cur = { k: 'ul', items: [] }))
      cur.items.push({ s: at + m[0].length, e: at + t.length })
    } else if ((m = /^>\s?/.exec(t))) {
      if (!cur || cur.k !== 'q') blocks.push((cur = { k: 'q', lines: [] }))
      cur.lines.push({ s: at + m[0].length, e: at + t.length })
    } else {
      if (!cur || cur.k !== 'p') blocks.push((cur = { k: 'p', lines: [] }))
      cur.lines.push({ s: at, e: at + t.length })
    }
  }
  return blocks
}

// 渲染 Markdown。hls：[{ id, s, e, c, note }]；o.on：当前选中的高亮 id（描边）；o.sel：{ s, e }，在静态画板里画出浏览器选区；o.pins：{ 高亮 id: 标注编号 }
function mdRender(src, hls = [], o = {}) {
  const marks = hls.filter(h => h.e > h.s).sort((a, b) => a.s - b.s)
  const sel = o.sel && o.sel.e > o.sel.s ? o.sel : null
  const span = (s, e) => `<span data-s="${s}">${esc(src.slice(s, e))}</span>`
  // [s, e) 按高亮与选区的边界切成小段；每段各自判断是否落在某条高亮里、是否在选区里，选区画在高亮之上
  const pieces = (s, e) => {
    const cuts = new Set([s, e])
    ;[...marks, ...(sel ? [sel] : [])].forEach(h => {
      if (h.s > s && h.s < e) cuts.add(h.s)
      if (h.e > s && h.e < e) cuts.add(h.e)
    })
    const pts = [...cuts].sort((a, b) => a - b)
    let out = ''
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]
      const b = pts[i + 1]
      const h = marks.find(m => m.s <= a && m.e >= b)
      let seg = span(a, b)
      if (sel && sel.s <= a && sel.e >= b) seg = `<span class="sel the-sel">${seg}</span>`
      out += h
        ? `<mark class="hlm c-${h.c}${o.on === h.id ? ' is-on' : ''}" data-hid="${h.id}" tabindex="0" role="button" aria-label="高亮，${HL_NAMES[h.c]}">${seg}${o.pins && o.pins[h.id] && b === h.e ? pin(o.pins[h.id], 'pin-r') : ''}</mark>${b === h.e && h.note ? '<i class="hln" aria-hidden="true"></i>' : ''}`
        : seg
    }
    return out
  }
  const inline = (s, e) =>
    mdInline(src, s, e)
      .map(t => {
        if (t.k === 'text') return pieces(t.s, t.e)
        if (t.k === 'b') return `<b>${pieces(t.s, t.e)}</b>`
        if (t.k === 'code') return `<code>${pieces(t.s, t.e)}</code>`
        if (t.k === 'a') return `<a href="${esc(t.url)}" target="_blank" rel="noopener noreferrer">${pieces(t.s, t.e)}</a>`
        return `<span class="md-img">${I('image', 'i-sm')}${esc(t.alt || '图片')}<small>图片未保存</small><a href="${esc(t.url)}" target="_blank" rel="noopener noreferrer">打开原图</a></span>`
      })
      .join('')
  return mdBlocks(src)
    .map(b => {
      if (b.k === 'h') return `<h${Math.max(2, b.lv)}>${inline(b.s, b.e)}</h${Math.max(2, b.lv)}>`
      if (b.k === 'ol') return `<ol>${b.items.map(i => `<li>${inline(i.s, i.e)}</li>`).join('')}</ol>`
      if (b.k === 'ul') return `<ul>${b.items.map(i => `<li>${inline(i.s, i.e)}</li>`).join('')}</ul>`
      if (b.k === 'code') return `<pre class="md-pre"><code>${b.lines.map(l => pieces(l.s, l.e)).join('\n')}</code></pre>`
      if (b.k === 'q') return `<blockquote>${b.lines.map(l => inline(l.s, l.e)).join(' ')}</blockquote>`
      return `<p>${b.lines.map(l => inline(l.s, l.e)).join(' ')}</p>`
    })
    .join('')
}

// 在 src 里按引文找出 { s, e }，给静态画板画选区用
const mdSel = (src, quote) => {
  const s = src.indexOf(quote)
  return s < 0 ? null : { s, e: s + quote.length }
}

// Markdown 去掉语法后的纯文本：列表行摘要、搜索用（search.md §1）
const mdPlain = s =>
  String(s)
    .replace(/^```\S*\s*$/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*(?:[-*]|\d+\.)\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s*\n+\s*/g, ' ')
    .trim()

// 把浏览器的选区换算成 content 里的 [s, e)：只会落在文字片段里，不会落在 Markdown 记号里
function mdOffsets(range, root, src) {
  const spans = [...root.querySelectorAll('[data-s]')].filter(sp => range.intersectsNode(sp))
  if (!spans.length) return null
  const first = spans[0]
  const last = spans[spans.length - 1]
  const at = (sp, node, off, fallbackEnd) => {
    if (sp.contains(node)) {
      if (node.nodeType === 3) return +sp.dataset.s + off
      return +sp.dataset.s + (off > 0 ? sp.textContent.length : 0)
    }
    return +sp.dataset.s + (fallbackEnd ? sp.textContent.length : 0)
  }
  let s = at(first, range.startContainer, range.startOffset, false)
  let e = at(last, range.endContainer, range.endOffset, true)
  while (s < e && /\s/.test(src[s])) s++
  while (e > s && /\s/.test(src[e - 1])) e--
  return e > s ? { s, e } : null
}

// 新建高亮：与已有高亮相交时合并为一条（entry.md §4 第 6 条）。返回 { h } 或 { error }
const HL_LIMITS = { perClip: 200, quote: 2000, note: 1000 }
function mdAddHighlight(entry, s, e, color, id) {
  const hs = entry.hls || (entry.hls = [])
  if (mdPlain(entry.content.slice(s, e)).length > HL_LIMITS.quote) return { error: `一次最多高亮 ${HL_LIMITS.quote.toLocaleString()} 个字符。` }
  const hit = hs.filter(h => h.s < e && h.e > s).sort((a, b) => a.t - b.t)
  if (!hit.length) {
    if (hs.length >= HL_LIMITS.perClip) return { error: `一条剪藏最多 ${HL_LIMITS.perClip} 条高亮。` }
    const h = { id, t: ++STORE.seq, s, e, q: mdPlain(entry.content.slice(s, e)), c: color, note: '' }
    hs.push(h)
    hs.sort((a, b) => a.s - b.s)
    return { h }
  }
  const base = hit[0]
  const note = hit.map(h => h.note).filter(Boolean).join('\n\n')
  if (note.length > HL_LIMITS.note) return { error: '合并后的备注太长，先处理备注再合并。' }
  const ns = Math.min(s, ...hit.map(h => h.s))
  const ne = Math.max(e, ...hit.map(h => h.e))
  entry.hls = hs.filter(h => h === base || !hit.includes(h))
  Object.assign(base, { s: ns, e: ne, q: mdPlain(entry.content.slice(ns, ne)), note })
  entry.hls.sort((a, b) => a.s - b.s)
  return { h: base, merged: hit.length }
}
