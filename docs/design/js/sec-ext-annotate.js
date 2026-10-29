// 浏览器扩展 · 页面批注：批注层与工具栏、墨迹截进截图编辑器、叠放与全屏。
// 依据 annotate §1（#89）。讲解网页时在当前标签页上画箭头、圈重点、写字，画完截进截图编辑器；退出即清除。

// 被批注的网页：与截图画板同一套骨架（帖子 + 图表）
const annotScene = () => `
  <i class="bar" style="left:60px;top:20px;width:300px"></i><i class="bar" style="left:60px;top:38px;width:520px"></i>
  <div class="post" style="left:60px;top:72px;width:640px;height:92px;box-sizing:border-box">
    <div class="av"></div>
    <div><span class="nm">Display Name</span><span class="hd">@handle · 3h</span></div>
    <div class="tx">Retries amplified the outage: downstream p99 went from 120ms to 2s within five minutes.</div>
  </div>
  <i class="bar" style="left:60px;top:190px;width:640px"></i>
  <i class="bar" style="left:60px;top:208px;width:420px"></i>
  <i class="bar" style="left:60px;top:246px;width:640px"></i><i class="bar" style="left:60px;top:264px;width:560px"></i>`

// 批注墨迹：画在页面内容之上的 SVG（红色箭头、青色椭圆、序号 1）
const annotInk = (o = {}) => `<svg class="annot-ink" viewBox="0 0 760 330" aria-hidden="true">
  <defs><marker id="annot-head${o.k || ''}" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0L7 3.5L0 7z" fill="#e5484d"/></marker></defs>
  <path d="M96 232 L 200 168" stroke="#e5484d" stroke-width="3" fill="none" stroke-linecap="round" marker-end="url(#annot-head${o.k || ''})"/>
  <ellipse cx="330" cy="180" rx="92" ry="42" fill="none" stroke="#0f9d8f" stroke-width="3"/>
  <circle cx="330" cy="222" r="14" fill="#e5484d" stroke="#fff" stroke-width="2"/>
  <text x="330" y="228" font-size="15" font-weight="700" fill="#fff" text-anchor="middle" font-family="var(--font-ui)">1</text>
  ${o.dim ? `<text x="96" y="290" font-size="12" fill="#9aa1b2" font-family="var(--font-ui)">墨迹跟着内容走 · 退出即清除</text>` : ''}
</svg>`

// 窗口边上的批注工具栏（竖排）：指针、画笔、荧光笔、直线、箭头、矩形、椭圆、文字、序号 · 五色 · 线宽 · 自动擦除 · 撤销/清空/截图/退出
const annotToolbar = (o = {}) => `<div class="annot-tb">
  ${[['mouse-pointer', 'pointer', '指针：页面照常可点'], ['pencil-line', 'pen', '画笔'], ['highlighter', 'highlighter', '荧光笔'], ['slash', 'line', '直线'], ['arrow-up-right', 'arrow', '箭头'], ['square', 'rect', '矩形'], ['circle', 'ellipse', '椭圆'], ['type', 'text', '文字'], ['list-ordered', 'step', '序号']]
    .map(([icon, tool, title]) => `<span class="tb-b ${o.tool === tool ? 'on' : ''}" title="${title}">${I(icon)}</span>`)
    .join('')}
  <i class="tb-sep"></i>
  <span class="tb-dots">${['#e5484d', '#ffd84d', '#0f9d8f', '#fff', '#111'].map((c, i) => `<i class="${i === (o.color ?? 0) ? 'on' : ''}" style="background:${c}"></i>`).join('')}</span>
  <i class="tb-sep"></i>
  <span class="annot-wd"><i style="width:4px;height:4px"></i></span><span class="annot-wd ${o.width !== 'thin' && o.width !== 'thick' ? 'on' : ''}"><i style="width:7px;height:7px"></i></span><span class="annot-wd ${o.width === 'thick' ? 'on' : ''}"><i style="width:11px;height:11px"></i></span>
  <i class="tb-sep"></i>
  <span class="annot-erase">${o.erase || '自动擦除 · 关'}</span>
  <i class="tb-sep"></i>
  <span class="tb-b" title="撤销">${I('undo-2')}</span><span class="tb-b" title="清空">${I('eraser')}</span><span class="tb-b" title="带着墨迹截图">${I('camera')}</span>
  <i class="tb-sep"></i>
  <span class="tb-b" title="退出批注">${I('x')}</span>
  ${o.pins ? pin(o.pins, 'pin-b') : ''}
</div>`

function extAnnotateGroup() {
  const enter = board({
    title: '批注层 · 指针与画图',
    ref: 'annotate §1.1 · §1.2',
    w: 760,
    body: `<div class="shot" style="height:400px">${annotScene()}${annotInk({ k: 'a' })}
      ${annotToolbar({ tool: 'arrow', pins: 1 })}
      <div class="annot-cursor" style="left:198px;top:162px">${I('move-up-right')}</div>
      <div class="shot-hint" style="left:auto;right:14px;transform:none">工具栏弹窗：<b>在页面上批注</b> · 或自行绑定的快捷键</div></div>`,
    notes: [
      '入口在<b>工具栏弹窗</b>（“在页面上批注”），快捷键<b>默认不绑定</b>，用户在浏览器的快捷键设置里自己指定；<code>chrome://</code> 等受限页面没有这个入口。',
      '进入时没有选中工具，是<b>指针</b>：页面照常点击、选中、滚动。选中一种工具后，按下拖动就是画，这一下不触发页面自己的动作；要点页面时切回“指针”。',
      '工具栏立在<b>窗口边上</b>：画笔、荧光笔、直线、箭头、矩形、椭圆、文字、序号，五种颜色，三档线宽（画笔/直线/荧光笔），自动擦除（关 · 3 秒 · 8 秒），撤销、清空、截图、退出。画法与截图编辑器相同；每次进入从默认开始：红色、中档线宽、序号从 1。',
      '自动擦除只作用于页面上的墨迹，到时自己消失，<b>不进撤销</b>，也不影响已经截进编辑器或入库的图片。',
    ],
  })

  const editor = board({
    title: '截进截图编辑器',
    ref: 'annotate §1.3',
    w: 760,
    body: `<div class="shot" style="height:400px">${annotScene()}
      <div class="shot-sel" style="left:52px;top:96px;width:480px;height:180px"><span class="shot-size">480 × 180</span></div>
      <svg class="annot-ink" viewBox="0 0 760 330" style="clip-path:inset(96px 226px 54px 52px)" aria-hidden="true">
        <defs><marker id="annot-head-b" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0L7 3.5L0 7z" fill="#e5484d"/></marker></defs>
        <path d="M96 232 L 200 168" stroke="#e5484d" stroke-width="3" fill="none" stroke-linecap="round" marker-end="url(#annot-head-b)"/>
        <ellipse cx="330" cy="180" rx="92" ry="42" fill="none" stroke="#0f9d8f" stroke-width="3"/>
      </svg>
      ${annotToolbar({ tool: 'pointer', pins: 1 })}</div>`,
    notes: [
      '工具栏的“截图”和截图快捷键一样，<b>带着墨迹进入截图会话</b>：拖拽区域或单击元素都可以，取景时墨迹仍然可见、不挡指针。',
      '截取的那一刻，墨迹和扩展的其他界面一起隐藏；进入编辑器后，墨迹按<b>截取那一刻在屏幕上的位置</b>画回图上，成为普通标注：完全落在取景框外的不进图，跨过边界的在边界处截断。',
      '编辑器里<b>全部墨迹算一步</b>：撤销一次拿掉全部，之后的标注照常逐步撤销；也可以接着画。确认入库、复制与下载的图片都带着墨迹。',
      '会话结束——确认、取消或出错——之后<b>回到批注层</b>，墨迹还在，可以接着画、再截。',
    ],
  })

  const stack = board({
    title: '叠放与清理 · 页面的最上层',
    ref: 'annotate §1.2 · §1.4 · market §4.7',
    w: 760,
    body: `<div style="padding:26px 30px;display:flex;flex-direction:column;gap:14px;background:var(--surface-2)">
      ${[
        ['页面自己的浮层（吸顶导航、弹窗、客服挂件）', 46, 'var(--surface)', '#c8ccd6', '被盖住'],
        ['网页进入全屏（播放器、视频本身）', 46, 'var(--surface)', '#c8ccd6', '批注层留在全屏画面之上'],
        ['浏览器原生的模态对话框开着', 46, 'var(--surface)', '#c8ccd6', '批注层移进对话框，照常可以画'],
        ['AnnHub 批注层 + 工具栏', 52, '#a78bfa', '#fff', '始终在最上层'],
      ]
        .map(
          ([label, h, bg, fg, note], i) =>
            `<div style="position:relative;height:${h}px;border-radius:8px;background:${bg};color:${fg};display:flex;align-items:center;padding:0 14px;font-size:12.5px;box-shadow:0 1px 0 rgb(0 0 0 / 0.06);outline:${i === 3 ? '2px dashed #a78bfa' : 'none'};outline-offset:2px">${label}<span style="margin-left:auto;color:${i === 3 ? '#fff' : '#6b7280'}">${note}</span></div>`,
        )
        .join('')}
    </div>`,
    notes: [
      '批注层进入浏览器<b>顶层（top layer）</b>：网页打开全屏、弹出层之后再显示一次，批注层重新盖上去；模态对话框挡住指针时，批注层<b>移进对话框</b>，关上后移回原处。',
      '批注层开着时，<b>选区菜单和区块胶囊不出现</b>——它们会挡住要讲解的内容——退出批注后恢复；区块模式的快捷键只给出提示“先退出批注”。截图会话进行中时不打开批注，由截图界面提示先完成或取消，已画的选区与标注不受影响。',
      '<b>退出即清除</b>：工具栏的“退出”或 Esc（输入中的文字框先关）。退出、刷新或打开别的网页后，页面上不留任何痕迹；墨迹不保存，不写进条目、设置或导出。马赛克不在批注层里：要打码，截进编辑器之后再打。',
    ],
  })

  return group(
    { id: 'ext-annotate', title: '页面批注：讲清楚一个界面', small: 'annotate §1', desc: '在当前标签页上画箭头、圈出重点、写字，画完一键截进截图编辑器；退出即清除，页面不留痕迹。' },
    row(enter),
    row(editor, stack),
  )
}
