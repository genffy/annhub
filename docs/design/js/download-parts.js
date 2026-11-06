// 资料库里选择与下载的零件（download.md §3）。静态画板与可交互原型共用同一份：
// attrs 参数把 data-* 带进原型，静态画板不传。

const DL_CAP = 200
const DL_DIR = '下载/AnnHub/AnnHub-download-2026-10-11/'

// ── 页头：搜索框与「选择」 ───────────────────────────────────────────────────────
// 选择中：搜索框置灰并写明原因（`/` 不响应），「选择」显示为按下
const dlSearchOff = (w = 300, o = {}) =>
  `<div class="search is-off" aria-disabled="true" title="选择时无法搜索" style="flex:none;width:${w}px;position:relative">${o.pin ? pin(o.pin) : ''}${I('search')}<span class="truncate">选择时无法搜索</span></div>`

// 视图里没有条目时「选择」不可用
const dlPickBtn = (on, o = {}) => btn('选择', { icon: 'list-checks', lg: true, off: !!o.off, attrs: `aria-pressed="${!!on}" title="${on ? '退出选择 · Esc' : o.off ? '没有可选的条目' : '选择条目'}" ${o.attrs || ''}` })

// 页头右侧：搜索框之后是「选择」。o 同 searchBox（q、focus、w、pin），off 让「选择」不可用
const dlHeadRight = (picking, o = {}) => `<div class="hs g8" style="flex:none">${picking ? dlSearchOff(o.w || 320, o) : searchBox(o)}${dlPickBtn(picking, o)}</div>`

// ── 工具条槽：筛选条与选择条在同一个位置互换 ──────────────────────────────────────────
const dlSlot = (inner, o = {}) => `<div class="dl-slot ${o.cls || ''}"><div class="dl-slot-in">${inner}</div></div>`

// 选择条：✕ 退出 · 已选 N 条 · 全选 M 条 · 清除 · [说明，弹性] · 下载所选。n 已选数，m 当前列表的总数；cap 是上限（原型里可以改小来试选满）
const dlBar = (o = {}) => {
  const n = o.n || 0
  const m = o.m || 0
  const cap = o.cap || DL_CAP
  const over = m > cap
  const full = n >= cap
  const hint = o.hint ?? (full ? `已选满 ${cap} 条` : over ? `一次最多选 ${cap} 条` : n === 0 ? '点击卡片选择，Shift 加点击选一段' : '')
  const a = o.attrs || {}
  return `<div class="dl-bar" role="toolbar" aria-label="选择">${o.pin ? pin(o.pin) : ''}
    ${btn('', { icon: 'x', iconOnly: true, sm: true, v: 'ghost', attrs: `aria-label="退出选择" title="退出选择 · Esc" ${a.done || ''}` })}
    <span class="dl-n tnum${n > 0 ? ' on' : ''}" role="status" aria-live="polite">已选 ${n} 条</span>
    ${btn(`全选<span class="m"> ${m} 条</span>`, { sm: true, v: 'ghost', cls: 'dl-all', off: over || (n > 0 && n >= m) || m === 0, attrs: a.all || '' })}
    ${btn('清除', { sm: true, v: 'ghost', off: n === 0, attrs: a.clear || '' })}
    <span class="dl-hint"><span>${hint}</span></span>
    ${btn('下载所选', { sm: true, v: 'primary', icon: 'download', off: n === 0, attrs: `${n === 0 ? 'title="先选择条目"' : ''} ${a.dl || ''}` })}
  </div>`
}

// ── 卡片：自绘的选中标记，圆心在卡片的角上 ────────────────────────────────────────────
// o: { on, hov, focus, off, pinN, attrs }；复用 entryCard 的内容，标题为空时不留空行
const dlCard = (e, o = {}) => {
  const cls = ['dl-w', o.on && 'is-on', o.hov && 'is-hov', o.focus && 'is-focus', o.off && 'is-off'].filter(Boolean).join(' ')
  let inner = entryCard(e)
  if (!e.title) inner = inner.replace('<div class="ec-ttl clamp-2"></div>', '')
  return `<div class="${cls}" role="checkbox" aria-checked="${!!o.on}" ${o.off ? 'aria-disabled="true"' : ''} tabindex="0" aria-label="${esc(e.title || e.host)}，${e.host}" ${o.attrs || ''}>${o.pinN ? pin(o.pinN, 'pin-in-r') : ''}${inner}<i class="dl-mk">${I('check')}</i></div>`
}

// ── 下载对话框 ───────────────────────────────────────────────────────────────────────
const DL_CHIP = { prepare: ['准备', ''], progress: ['进行中', ''], full: ['完整', 'ok'], partial: ['部分', 'warn'], failed: ['失败', 'danger'], cancelled: ['已取消', ''] }

// o: { n, clips, shots, files, form, media, offline, many, done, total, attrs }
// attrs: { form(v) → 属性串, media, cancel, start, close, retry, show }
const dlDialog = (state, o = {}) => {
  const a = o.attrs || {}
  const n = o.n ?? 3
  const clips = o.clips ?? 2
  const shots = o.shots ?? 1
  const files = o.files ?? 14
  const form = o.form || 'folder'
  const [label, v] = DL_CHIP[state]
  const where = form === 'zip' ? `${DL_DIR.replace(/\/$/, '')}.zip` : DL_DIR
  const segs = [['folder', '文件夹'], ['zip', 'ZIP']]
    .map(([k, t]) => `<span role="radio" tabindex="0" aria-checked="${form === k}" class="${form === k ? 'on' : ''}" ${a.form ? a.form(k) : ''}>${t}</span>`)
    .join('')
  const mediaOn = o.media !== false && !o.offline
  const body = {
    prepare: `<div class="dl-sum"><div><b>${n} 条</b><span class="muted"> · 剪藏 ${clips} · 截图 ${shots}</span></div><div class="t-sm muted">预计约 ${files} 个文件</div></div>
      <div class="vs g12" style="margin-bottom:14px">
        <div class="field"><div class="label">形态</div><span class="seg" role="radiogroup" aria-label="形态" style="align-self:flex-start">${segs}</span><div class="help">${form === 'zip' ? '保存为一个文件' : '每条一个文件夹，外加一份清单 README'}</div><div class="help">保存到 <span class="mono dl-path">${where}</span></div></div>
        <div class="field"><span class="hs g8 ${o.offline ? 'is-dim' : ''}" role="checkbox" tabindex="${o.offline ? -1 : 0}" aria-checked="${mediaOn}" ${o.offline ? 'aria-disabled="true"' : ''} ${a.media || ''}>${cbx(mediaOn, '同时下载媒体')}</span>
          ${o.offline ? `<div class="help hs g6 c-warn">${I('wifi-off', 'i-sm')}<span>当前离线，只保存 Markdown，媒体保留原地址。</span></div>` : '<div class="help">图片、视频与音频，需要联网。</div>'}</div>
        ${o.many ? banner('info', `<b>文件较多</b>（约 ${files} 个），建议选 ZIP。`) : ''}
      </div>
      <div class="hs g8 end">${btn('取消', { v: 'ghost', attrs: a.close || '' })}${btn('下载', { v: 'primary', icon: 'download', attrs: a.start || '' })}</div>`,
    progress: `<div class="help" style="margin:2px 0 12px">正在取回媒体并写入文件，不会上传到任何地方。</div>
      <div class="vs g6" style="margin-bottom:14px"><div class="hs between t-sm"><span>取回媒体 · 写入文件</span><span class="tnum b">${o.done ?? 12} / ${o.total ?? 31}</span></div><div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${o.total ?? 31}" aria-valuenow="${o.done ?? 12}"><i style="width:${Math.round(((o.done ?? 12) / (o.total ?? 31)) * 100)}%"></i></div></div>
      <div class="hs g8 end">${btn('取消', { v: '', attrs: a.cancel || '' })}</div>`,
    cancelled: `${banner('info', `<b>已取消</b>：已写好的文件已删除；浏览器建好的空文件夹留在 <span class="mono dl-path">${where}</span>。`)}<div class="help" style="margin:10px 0 12px">已选的 ${n} 条还在，可以改形态后重新下载。</div>
      <div class="hs g8 end">${btn('关闭', { v: 'ghost', attrs: a.close || '' })}${btn('重新下载', { v: 'primary', icon: 'download', attrs: a.start || '' })}</div>`,
    full: `${banner('ok', `<b>已下载</b>：${n} 条条目、${o.images ?? 11} 张图片，保存在 <span class="mono dl-path">${where}</span>。`)}<div class="help" style="margin:10px 0 12px">${form === 'zip' ? 'ZIP 里每条一个文件夹，外加一份清单 README。' : '每条一个文件夹，外加一份清单 README。'}</div>
      <div class="hs g8 end">${btn('显示文件', { icon: 'folder-open', attrs: a.show || '' })}${btn('完成', { v: 'primary', attrs: a.close || '' })}</div>`,
    partial: `${banner('warn', '<b>部分下载</b>：2 项媒体未保存，Markdown 里保留了原地址，README 列出了原因。')}
      <ul class="dl-miss"><li><span class="u">cdn.example.net/img/p99-curve.png</span><span class="r">图床拒绝访问</span></li><li><span class="u">cdn.example.net/video/demo.mp4</span><span class="r">超过 200 MB</span></li></ul>
      <div class="help" style="margin:10px 0 12px">其余 12 个文件已正常写入。</div>
      <div class="hs g8 end">${btn('显示文件', { icon: 'folder-open', attrs: a.show || '' })}${btn('完成', { v: 'primary', attrs: a.close || '' })}</div>`,
    failed: `${banner('danger', '<b>下载失败</b>：浏览器中断了一个文件的写入（磁盘已满或没有权限）。')}<div class="help" style="margin:10px 0 12px">已选的 3 条没有丢；已经写好的文件保留，重试会重新下载。</div>
      <div class="hs g8 end">${btn('关闭', { v: 'ghost', attrs: a.close || '' })}${btn('重试', { v: 'primary', icon: 'rotate-ccw', attrs: a.retry || '' })}</div>`,
  }[state]
  return `<div class="dlg" role="dialog" aria-modal="true" aria-label="下载所选条目" style="${o.style || ''}"><div class="hs between" style="margin-bottom:6px"><h3>下载所选条目</h3>${chip(label, { v })}</div>${body}</div>`
}

// ── 单条下载的状态条：浮在内容区底部，沿用页面里提示条的深色形态 ─────────────────────────────
// o: { n, total, missing, attrs: { cancel, show, retry, close } }
const dlStatus = (state, o = {}) => {
  const a = o.attrs || {}
  const act = (label, at) => `<i class="sepd"></i><span class="act" role="button" tabindex="0" ${at || ''}>${label}</span>`
  const x = `<span class="x" role="button" tabindex="0" aria-label="关闭" ${a.close || ''}>${I('x', 'i-sm')}</span>`
  const total = o.total ?? 12
  const n = o.n ?? 3
  const cfg = {
    progress: { icon: I('loader-circle', 'spin'), text: `正在下载 ${n}/${total}`, tail: act('取消', a.cancel), bar: Math.round((n / total) * 100) },
    full: { icon: I('circle-check'), text: '已下载', tail: act('显示文件', a.show) },
    partial: { icon: I('triangle-alert'), text: `部分下载：${o.missing ?? 2} 项媒体未保存`, tail: act('显示文件', a.show) + x, cls: 'is-warn' },
    failed: { icon: I('circle-alert'), text: '下载失败：网络中断', tail: act('重试', a.retry) + x, cls: 'is-error' },
    busy: { icon: I('info'), text: '上一个还在进行', tail: '', cls: 'is-info' },
  }[state]
  return `<div class="toast ct dl-st ${cfg.cls || ''} ${cfg.bar != null ? 'has-bar' : ''}" role="${state === 'failed' ? 'alert' : 'status'}">${cfg.icon}<span>${cfg.text}</span>${cfg.tail}${cfg.bar != null ? `<span class="tbar"><i style="--p:${cfg.bar}%"></i></span>` : ''}</div>`
}
