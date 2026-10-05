// Desktop 画板的零件：窗口外壳、侧栏、今日页、碎片库三栏。
const MAC_NAV = [
  ['today', '今日', 'sun'],
  ['library', '碎片库', 'layout-grid'],
  ['system', '系统', 'settings'],
]
const MAC_TITLE = Object.fromEntries(MAC_NAV.map(([k, t]) => [k, t]))

const macSide = (active, o = {}) => `<aside class="mw-side">
  ${MAC_NAV
    .map(([k, t, ic], i) => `<div class="mw-nav ${k === active ? 'on' : ''}" data-nav="${k}" style="position:relative">${o.pins && o.pins[k] ? pin(o.pins[k], 'pin-r') : ''}${I(ic)}<span>${t}</span>${k === 'today' && o.due ? `<span class="bd">${o.due}</span>` : ''}${o.keys ? `<span class="muted-2 t-xs" style="margin-left:auto">⌘${i + 1}</span>` : ''}</div>`)
    .join('')}
  <div class="mw-svc"><i class="dot ${o.svc === 'off' ? 'danger' : 'ok'}"></i>${o.svc === 'off' ? '本地服务未运行' : '本地服务运行中'}</div>
</aside>`

const macSearch = (o = {}) => `<span class="mw-search ${o.focus ? 'is-focus-ring' : ''}" data-act="palette">${I('search')}${o.text || '搜索碎片或命令'}<kbd>⌘K</kbd></span>`

// o: { nav, title?, tb?, body, w?, h?, due?, over?, pins?, keys?, svc? }
const macWindow = o => `<div class="mw" style="width:${o.w || 1360}px;height:${o.h || 860}px">
  <div class="mw-lights"><i></i><i></i><i></i></div>
  ${macSide(o.nav, o)}
  <div class="mw-main">
    <div class="mw-tb">${o.tb || `<span class="ttl">${o.title || MAC_TITLE[o.nav]}</span><span class="grow"></span>${macSearch()}`}</div>
    <div class="mw-body">${o.body}</div>
  </div>
  ${o.over || ''}
</div>`

// 复习状态（Desktop 本地事实；fragments §9 的派生状态）
const reviewState = f => (f.due === '到期' ? chip('到期', { icon: 'clock', v: 'warn' }) : `<span class="t-sm muted">${f.due}</span>`)

// ── 今日 ────────────────────────────────────────────────────────────────
const dueCard = (o = {}) => {
  if (o.none)
    return `<div class="mcard" style="position:relative">${o.pin ? pin(o.pin) : ''}<div class="hs g16 top"><span class="iconchip n">${I('circle-check')}</span>
      <div class="grow vs g4"><div class="t-xl b">今天没有到期复习</div><div class="muted t-md">新碎片创建后立即到期；下一批预计 明天 2 条。</div></div>
      <div class="hs g8 none">${btn('整理最近碎片', { lg: true })}</div></div></div>`
  return `<div class="mcard" style="position:relative">${o.pin ? pin(o.pin) : ''}
    <div class="hs g16 top"><span class="iconchip">${I('repeat')}</span>
      <div class="grow vs g4"><div class="t-xl b">到期复习</div>
        <div class="muted t-md">${o.session ? '还剩 3 条 · 预计 3 分钟' : '5 条 · 预计 4 分钟'}</div>
        <div class="t-sm muted">逾期主题：重试风暴 / 退避加抖动 / 幂等</div>
        ${o.session ? `<div class="hs g10" style="margin-top:8px"><div class="progress grow" style="max-width:260px"><i style="width:40%"></i></div><span class="t-sm muted tnum">已评分 2 / 5</span></div>` : ''}
      </div>
      <div class="vs g6 none" style="align-items:flex-end">${btn(o.session ? '继续复习 · 2/5' : '开始复习', { lg: true, v: 'primary', icon: 'play' })}${o.session ? '<span class="t-xs muted">中途退出的会话会保留</span>' : ''}</div>
    </div></div>`
}

const recentList = (ids, pinN) => `<div class="mcard" style="padding:14px 20px 6px;position:relative">${pinN ? pin(pinN) : ''}<div class="mh" style="margin-bottom:2px">最近由扩展写入</div>
  ${ids.map(id => { const f = fragById(id); return `<div class="mrow">${kchip(f.kind)}<span class="grow truncate b t-md">${esc(f.title)}</span><span class="t-sm muted truncate" style="max-width:190px">${f.host}</span><span class="t-sm muted none" style="width:56px;text-align:right">${f.when}</span></div>` }).join('')}</div>`

// 次要统计：北极星 M-18（本周成功提取的去重碎片数），只放在今日页最底部
const weekLine = (n, pinN) => `<div class="t-sm muted" style="padding-top:2px;position:relative">${pinN ? pin(pinN) : ''}本周成功提取 <b class="tnum">${n}</b> 个碎片</div>`

const todayBody = (v = 'default', o = {}) => `<div class="today">
  <div><h1>今天需要完成什么</h1><div class="sub">10 月 3 日 周六${v === 'none' ? '' : ' · 今日建议 5 / 20 条'}</div></div>
  ${v === 'none' ? dueCard({ none: true }) : dueCard({ session: v === 'session', pin: o.pins ? 1 : 0 })}
  ${recentList(['f1', 'f3', 'f10'], o.pins ? 2 : 0)}
  ${weekLine(4, o.pins ? 3 : 0)}
</div>`

// ── 碎片库 ──────────────────────────────────────────────────────────────
const filterPane = (o = {}) => `<div class="lib-f" style="position:relative">${o.pin ? pin(o.pin, 'pin-in-r') : ''}
  <div><div class="mh">类型</div>
    ${[['concept', 12, true], ['claim', 4, false], ['procedure', 6, true], ['decision', 3, false], ['question', 5, false], ['inspiration', 4, false], ['visual', 7, false], ['excerpt', 2, false]]
      .map(([k, n, on]) => `<div class="it">${cbx(on)}<span>${KINDS[k].zh}</span><span class="ct">${n}</span></div>`)
      .join('')}</div>
  <div><div class="mh">来源</div>
    ${['engineering.example.com', 'sre.example.org', 'arch.example.net'].map((h, i) => `<div class="it">${favicon(i)}<span class="truncate">${h}</span></div>`).join('')}
    <div class="it link">更多…</div></div>
  <div><div class="mh">标签</div><div class="hs g4 wrap">${tags(['retry', 'reliability', 'streams', 'api'])}</div></div>
  <div><div class="mh">保存的视图</div>
    <div class="it on">${I('clock', 'i-sm')}<span>到期</span><span class="ct">5</span></div>
    <div class="it">${I('circle-alert', 'i-sm')}<span>待加强</span><span class="ct">2</span></div>
    <div class="it">${I('circle-dashed', 'i-sm')}<span>新建</span><span class="ct">3</span></div>
    <div class="it link">${I('plus', 'i-sm')}保存当前视图</div></div>
</div>`

const libTableRows = (ids, sel) => ids.map(id => {
  const f = fragById(id)
  return `<tr class="${id === sel ? 'sel' : ''}"><td><div class="c1 truncate">${esc(f.title)}</div><div class="c2 truncate">${f.host} · ${f.tags.map(t => '#' + t).join(' ')}</div></td><td>${kchip(f.kind, { sm: true })}</td><td>${reviewState(f)}</td><td class="t-sm muted">${f.when}</td></tr>`
}).join('')

const detailPane = (f, o = {}) => `<div class="lib-d">
  <div class="hs g8" style="padding:12px 18px;border-bottom:1px solid var(--mac-sep);position:relative">${o.pins ? pin(3, 'pin-in') : ''}${kchip(f.kind, { full: true })}<span class="grow"></span><span class="lockhint">${I('lock')}采集字段只读</span><span class="btn btn-ghost btn-icon btn-sm">${I('ellipsis')}</span></div>
  <div style="overflow:hidden;flex:1">
    <div class="dsec2"><div class="t-xl b" style="letter-spacing:-0.01em">${esc(f.title)}</div></div>
    <div class="dsec2" style="position:relative">${o.pins ? pin(4, 'pin-in-r') : ''}<div class="mh">${I('target', 'i-sm')}用户应用</div><div class="t-md" style="line-height:1.6;border-left:3px solid var(--brand);padding-left:12px">检查当前事件管道为什么在消费者变慢后耗尽内存</div>
      <div class="mh" style="margin-top:12px">${I('pencil-line', 'i-sm')}我的理解</div><div class="t-md" style="line-height:1.6;color:var(--fg-2)">下游通过需求信号、暂停、缓冲或丢弃，把压力传回上游</div></div>
    <div class="dsec2"><div class="mh">${I('badge-check', 'i-sm')}核验</div><div class="hs g6 wrap">${chip('已确认 · 周一 10:12', { icon: 'circle-check', v: 'ok' })}${srcBadge('source-material')}</div><div class="t-md" style="margin-top:7px;color:var(--fg-2);line-height:1.55">不只是固定速率限流，还涉及队列边界和反馈机制。</div></div>
    <div class="dsec2" style="position:relative">${o.pins ? pin(5, 'pin-in-r') : ''}<div class="mh">${I('quote', 'i-sm')}原始语境</div><div class="quote t-sm" style="line-height:1.6">…the consumer signals demand upstream so the producer slows down…</div><div class="hs g6 t-sm" style="margin-top:7px"><span class="truncate muted grow">Backpressure in Streams · ${f.host}</span><span class="link hs g4">回到来源${I('arrow-up-right', 'i-sm')}</span></div></div>
    <div class="dsec2" style="position:relative">${o.pins ? pin(6, 'pin-in-r') : ''}<div class="mh">${I('repeat', 'i-sm')}复习</div><div class="vs g4 t-sm"><div class="hs between"><span class="muted">状态</span><span>复习中 · 间隔 1 天 · 下次 明天</span></div><div class="hs between"><span class="muted">已复习 / 遗忘</span><span class="tnum">3 次 / 0 次</span></div><div class="hs between"><span class="muted">最近评分</span><span class="hs g6">${chip('良好 · 周五', {})}${chip('较难 · 周六', {})}</span></div></div></div>
    <div class="dsec2"><div class="mh">${I('tag', 'i-sm')}标签和元数据</div><div class="hs g4 wrap">${tags(f.tags)}</div><div class="t-sm muted" style="margin-top:7px">${f.host} · 采集于 ${f.when} · 修订 2</div></div>
  </div>
</div>`

const libraryBody = (o = {}) => `<div class="lib3">
  ${filterPane({ pin: o.pins ? 1 : 0 })}
  <div class="lib-l">
    <div class="lib-bar" style="position:relative">${o.pins ? pin(2, 'pin-in') : ''}<span class="mw-search" style="min-width:160px;flex:1">${I('search')}搜索碎片</span>
      ${btn('排序：到期优先', { sm: true, icon: 'arrow-down-wide-narrow' })}${btn('列', { sm: true, icon: 'columns-3' })}<span class="t-sm muted none">共 128 条</span></div>
    <div style="overflow:hidden;flex:1;padding:0 8px"><table class="mt"><colgroup><col /><col style="width:92px" /><col style="width:84px" /><col style="width:96px" /></colgroup>
      <thead><tr><th>内容 ${I('chevrons-up-down')}</th><th>类型</th><th>复习</th><th>采集时间</th></tr></thead>
      <tbody>${libTableRows(['f2', 'f1', 'f4', 'f5', 'f3', 'f10', 'f9', 'f12', 'f6', 'f7', 'f8', 'f11'], o.sel || 'f1')}</tbody></table></div>
  </div>
  ${detailPane(fragById(o.sel || 'f1'), { pins: o.pins })}
</div>`
