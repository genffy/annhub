// 扩展画板共用的零件：Chrome 外壳、网页模拟、选区菜单、采集窗口的各个区块。
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

// 网页模拟。sel: none | sel（蓝色选区）| hl（高亮）| note（高亮 + 备注）
const article = (o = {}) => {
  const cls = { sel: 'sel', hl: 'hl', note: 'hl note' }[o.sel] || ''
  const selected = cls ? `<span class="${cls} the-sel">${SEL_TEXT}</span>` : SEL_TEXT
  return `<div class="pg" style="${o.style || ''}">
    <div class="pg-nav"><b>engineering.example.com</b><span>Articles</span><span>Topics</span><span>About</span></div>
    <div class="pg-art">
      <h1>Backpressure in Streams</h1>
      <div class="pg-by">Platform Engineering · Updated Sep 28 · 9 min read</div>
      <p>When a producer emits events faster than a consumer can process them, something has to give. Queues grow, memory climbs, and eventually the slowest component takes the whole pipeline down with it.</p>
      <p><b>Backpressure</b> is how a system pushes that pain back where it belongs. Instead of letting buffers absorb the mismatch indefinitely, ${selected}.</p>
      ${o.video ? `<div style="height:170px;border-radius:8px;background:linear-gradient(135deg,#2b2f3a,#4a4f60);display:grid;place-items:center;margin:0 0 20px;color:#fff">${I('play', 'i-lg')}</div>` : ''}
      <h2>Three common strategies</h2>
      <ol><li>Demand signaling: the consumer grants credits and the producer sends no more than it was granted.</li><li>Bounded buffers: queues with a hard limit that block or reject at the edge.</li><li>Load shedding: drop the least valuable work first, on purpose.</li></ol>
      <p>Retries can amplify an outage when the dependency is already saturated. Without a budget, every client retries at once.</p>
    </div>
    ${o.extra || ''}
  </div>`
}

// 选区菜单（extension.md §2.1）。items 默认四项；media 追加“媒体片段”。
// 文案按语言本地化（D-11）：中文界面称“碎片”，英文界面保留 Fragment；菜单项都用名词，不加“保存为”。
const HM_LABELS = {
  zh: { frag: '碎片', hl: '高亮', clip: '剪藏', shot: '截图', media: '媒体片段' },
  en: { frag: 'Fragment', hl: 'Highlight', clip: 'Clip', shot: 'Screenshot', media: 'Media clip' },
}

const hoverMenu = (o = {}) => {
  const L = HM_LABELS[o.lang || 'zh']
  const btnHtml = (icon, label, cls = '', p = '') => `<div class="hm-b ${cls}" role="button" aria-label="${label}">${p}${I(icon)}<span>${label}</span></div>`
  return `<div class="hm ${o.below ? 'below' : ''}" ${o.anchor ? `data-anchor="${o.anchor}" data-place="${o.below ? 'below' : 'above'}"` : ''} style="${o.style || ''}">
    ${o.pins ? pin(o.pins.menu) : ''}
    ${btnHtml('brain', L.frag, `learn ${o.hover === 0 ? 'is-hover' : ''} ${o.focus === 0 ? 'is-focus' : ''}`)}
    <i class="hm-sep" style="position:relative">${o.pins ? pin(o.pins.sep, 'pin-b') : ''}</i>
    ${btnHtml('highlighter', L.hl, o.hover === 1 ? 'is-hover' : '')}
    ${btnHtml('bookmark', L.clip, o.hover === 2 ? 'is-hover' : '')}
    ${btnHtml('scan', L.shot, o.hover === 3 ? 'is-hover' : '')}
    ${o.media ? `<i class="hm-sep"></i>${btnHtml('film', L.media, '')}` : ''}
    ${o.tip || ''}
  </div>`
}

const tipBubble = (title, desc, style = '', extra = '') => `<div class="hm-tip tip" style="${style}">${extra}${title}<small>${desc}</small></div>`

// ── 采集窗口 ──────────────────────────────────────────────────────────────
const pn = (o, key, cls = 'pin-l') => (o && o.pins && o.pins[key] ? pin(o.pins[key], cls) : '')

const cmHeader = o => `<div class="cm-h">${pn(o, 'header')}
  ${favicon(0)}<span class="ttl truncate" style="max-width:230px">${o.title || 'Backpressure in Streams'}</span><span class="host truncate">${o.host || 'engineering.example.com'}</span>
  <span class="grow"></span>${o.noBack ? '' : `<span class="link hs g4 t-sm" style="white-space:nowrap">回到原文${I('arrow-up-right', 'i-sm')}</span>`}
  <span class="btn btn-ghost btn-icon btn-sm" aria-label="关闭">${I('x')}</span>
</div>`

const cmKinds = (kind, o = {}) => `<div class="cm-kinds">
  ${KIND_ORDER.map(k => `<span class="cm-kind ${k === kind ? `on k-${k}` : ''}">${k === kind ? I(KINDS[k].icon) : ''}${KINDS[k].zh}</span>`).join('')}
  ${o.media ? `<span class="cm-kind">${KINDS['media-clip'].zh}</span>` : ''}
  ${o.inferred === false ? '' : `<span class="chip chip-suggest" style="margin-left:6px;height:20px;font-size:11px" title="根据结构和关键词推断，可以直接改">${I('sparkles')}自动推断</span>`}
</div>`

const cmContext = o => `<div class="cm-ctx">${pn(o, 'ctx')}
  <div class="lb">选区</div>
  <div class="cm-sel ${o.selClass || ''}">${o.sel || `「…${SEL_TEXT.slice(0, 70)}…」`}</div>
  <div class="lb">上下文</div>
  <div class="cm-ctxrow">${I('chevron-right', 'i-sm')}<span class="truncate">${o.ctx || '前后各一句，可编辑'}</span></div>
  <div class="lb" style="padding-top:5px">类型</div>
  <div style="position:relative">${pn(o, 'kinds', 'pin-r')}${cmKinds(o.kind || 'concept', o)}</div>
</div>`

const cmSteps = o => {
  const deep = !!o.deep
  const order = ['guess', 'verify', 'apply']
  const label = { guess: '理解', verify: '核验', apply: '应用' }
  const curIdx = order.indexOf(o.step)
  const parts = order.map((s, i) => {
    if (s === 'guess' && !deep) return `<span class="cm-step off" title="仅深度模式"><span class="n">1</span>理解<span class="muted t-xs">深度模式</span></span>`
    const state = i === curIdx ? 'on' : i < curIdx ? 'done' : ''
    return `<span class="cm-step ${state}"><span class="n">${state === 'done' ? I('check') : i + 1}</span>${label[s]}</span>`
  })
  return `<div class="cm-steps">${pn(o, 'steps')}${parts.join(I('chevron-right', 'cm-chev'))}<span class="grow"></span><span class="seg" title="深度模式是全局偏好，也可单次切换；切换不会丢失已填内容"><span class="${deep ? '' : 'on'}">标准</span><span class="${deep ? 'on' : ''}">深度</span></span></div>`
}

const cmFooter = o => {
  const last = o.step === 'apply'
  const first = (o.deep ? o.step === 'guess' : o.step === 'verify')
  return `<div class="cm-f">
    ${cbx(o.hl !== false, '同时高亮原文')}
    <span class="grow"></span>
    ${btn('取消', { v: 'ghost' })}
    ${first ? '' : btn('上一步', { v: 'ghost' })}
    ${btn(last ? '保存' : '下一步', { v: 'primary', kbd: '⌘↵', off: o.off, focus: o.focusPrimary })}
  </div>`
}

// 三个步骤的内容区。内容区高度固定（.cm-body），步骤切换不改变窗口外框
const bodyGuess = (kind, text, o = {}) => `<div class="cm-body">${pn(o, 'body')}
  <div class="prompt">${KINDS[kind].guess}</div>
  ${textarea(text || '', { h: 112, ph: '先写下你现在的理解，再去对照来源', focus: true, caret: !!text })}
  <div class="sub">${I('pencil-line', 'i-sm')} 这一步由你自己写：模型建议只在核验时出现，且不会替你填。可以留空直接进入核验。</div>
</div>`

const SRC_LABEL = { 'source-material': '原文', manual: '手工', llm: '模型建议' }

const confirmRow = (o = {}) => `<div class="cm-confirm ${o.on ? 'on' : ''}">
  <div class="hs g10 top">
    <i class="cb ${o.on ? 'on' : ''}" style="margin-top:2px">${o.on ? I('check') : ''}</i>
    <div class="grow">
      <div class="t">确认已核对</div>
      <div class="d">${o.on ? `已确认 · 来源：${SRC_LABEL[o.source || 'source-material']} · 刚刚` : '我已回看来源，并确认当前内容。这不代表内容被证实。'}</div>
    </div>
  </div>
  <div class="cm-srcrow">
    <span class="muted">核验来源</span>
    ${rdo(o.source === undefined || o.source === 'source-material', '原文')}${rdo(o.source === 'manual', '手工')}${rdo(o.source === 'llm', o.llmOff ? '<span class="muted">模型建议 · 未启用</span>' : '模型建议')}
  </div>
</div>`

// 核验时对照用的来源语境：选区高亮，其余淡出；深度模式再并排放上“你的理解”
const srcCard = (o = {}) => `<div class="cm-srcctx">
  ${o.guess ? `<div class="g"><span class="lb">你的理解</span>${o.guess}</div>` : ''}
  <div><span class="lb">${o.label || '来源语境'}</span>${o.text || `…<b>Backpressure</b> is how a system pushes that pain back where it belongs. Instead of letting buffers absorb the mismatch indefinitely, <mark>${SEL_TEXT}</mark>…`}</div>
</div>`

const optAdd = (label, o = {}) => `<span class="opt-add">${I('plus')}${label}${o.opt === false ? '' : ''}</span>`

const bodyVerify = (kind, o = {}) => `<div class="cm-body">${pn(o, 'body')}
  <div class="hs between"><div class="prompt">${KINDS[kind].verify}</div>${o.nolink ? '' : `<span class="link hs g4 t-sm">回看来源${I('arrow-up-right', 'i-sm')}</span>`}</div>
  ${o.extra || (o.noSrc ? '' : srcCard(o))}
  ${o.noOpt ? '' : `<div class="hs g8">${optAdd('摘要（可选）')}${optAdd('备注（可选）')}</div>`}
  <div style="margin-top:auto">${o.banner || ''}${confirmRow(o)}</div>
</div>`

const exampleBlock = (kind, o = {}) => `<div class="eg">
  <span class="muted">弱</span><span class="weak">以后可能用得上</span>
  <span class="x c-ok">好</span><span>${{ concept: '检查当前事件管道为什么在消费者变慢后耗尽内存', claim: '评审“拆服务即可提升交付速度”时，追问团队边界与发布责任', procedure: '转成当前团队的值班检查清单，下周二交 SRE 评审', decision: '用户提出共享需求时，用真实使用数据重新评估', question: '观察 Modal 退出率和完成时间，两周后复核假设', visual: '在复盘文档里作为“重试放大”的证据图', inspiration: '下次写产品设计说明时，把“判断变化”作为一个评估维度', excerpt: '在支付网关故障复盘中，检查客户端重试是否放大了流量', 'media-clip': '写入支付重试方案的幂等设计章节' }[kind]}</span>
</div>`

// state: empty | copy | vague | good
const bodyApply = (kind, o = {}) => {
  const state = o.state || 'good'
  const text = { empty: '', copy: 'the consumer signals demand upstream so the producer slows down', vague: '以后可能用得上', good: o.text || '检查当前事件管道为什么在消费者变慢后耗尽内存' }[state]
  const help = {
    empty: ['写下它会用在哪个任务、文档或判断上。', ''],
    copy: ['不能只复制原文——写下你准备怎么用它。', 'err'],
    vague: ['再具体一点：用在哪个任务？打算检查、转成、追问还是验证什么？', 'err'],
    good: ['', ''],
  }[state]
  return `<div class="${o.bare ? 'vs g8' : 'cm-body'}">${pn(o, 'body')}
    <div class="prompt">${KINDS[kind].use}</div>
    ${textarea(text, { h: 78, ph: '写下对象和动作：哪个任务、文档或判断，准备怎么用', focus: true, err: state === 'copy' || state === 'vague', caret: state === 'good' || state === 'empty' })}
    ${help[0] ? `<div class="help ${help[1] === 'err' ? 'is-error' : ''}">${help[1] === 'err' ? I('circle-alert', 'i-sm') + ' ' : ''}${help[0]}</div>` : `<div class="help c-ok">${I('circle-check', 'i-sm')} 有对象，也有动作。</div>`}
    ${o.bare ? '' : exampleBlock(kind)}
  </div>`
}

const captureModal = o => {
  const kind = o.kind || 'concept'
  const body = o.body || (o.step === 'guess' ? bodyGuess(kind, o.guessText, o) : o.step === 'apply' ? bodyApply(kind, o) : bodyVerify(kind, o))
  return `<div class="cm" style="${o.style || ''}">
    ${pn(o, 'frame', 'pin-fr')}
    ${o.top || ''}
    ${cmHeader(o)}
    ${o.ctxHtml || cmContext({ ...o, kind })}
    ${cmSteps(o)}
    ${body}
    ${o.footer || cmFooter(o)}
    ${o.over || ''}
  </div>`
}

// 把窗口放在“被压暗的网页”之上
const modalOnPage = (modal, o = {}) => `<div class="cm-back" style="height:${o.h || 620}px">
  ${article({ sel: o.sel || 'sel', style: 'transform:none' })}
  <div class="cm-scrim"></div>
  <div class="cm-wrap">${modal}</div>
</div>`
