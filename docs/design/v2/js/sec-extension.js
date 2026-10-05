// 浏览器插件章节：把页面内（sec-ext-capture）与扩展页（sec-ext-pages）的分组拼起来。
function secExtension() {
  const groups = [
    typeof extFlowGroup === 'function' && extFlowGroup(),
    typeof extModalGroup === 'function' && extModalGroup(),
    typeof extKindsGroup === 'function' && extKindsGroup(),
    typeof extStatesGroup === 'function' && extStatesGroup(),
    typeof extHlGroup === 'function' && extHlGroup(),
    typeof extShotGroup === 'function' && extShotGroup(),
    typeof extShotR5Group === 'function' && extShotR5Group(),
    typeof extLibGroup === 'function' && extLibGroup(),
    typeof extDetailGroup === 'function' && extDetailGroup(),
    typeof extShotsPageGroup === 'function' && extShotsPageGroup(),
    typeof extSettingsGroup === 'function' && extSettingsGroup(),
    typeof extPopupGroup === 'function' && extPopupGroup(),
    typeof extProtoGroup === 'function' && extProtoGroup(),
  ].filter(Boolean)
  return section(
    {
      id: 'ext',
      nav: '浏览器插件',
      eyebrow: 'Part 1 · Chrome 扩展',
      title: '在网页现场，把“值得留”变成“能用上”',
      lead: '扩展只做四件事：在原始网页中指认内容、保留来源与定位、完成一次最小主动加工、本地保存后交付给 Desktop。它不做完整复习和通用笔记编辑器。',
      sub: [
        ['ext-flow', '保存分流'],
        ['ext-modal', '采集窗口'],
        ['ext-kinds', '按 kind 的表单'],
        ['ext-states', '状态与恢复'],
        ['ext-hl', '高亮与剪藏'],
        ['ext-shot', '截图'],
        ['ext-shot-r5', '截图增强 R5'],
        ['ext-lib', '碎片库'],
        ['ext-detail', '详情与编辑'],
        ['ext-shots-page', '截图集'],
        ['ext-settings', '设置与连接'],
        ['ext-popup', '工具栏弹窗'],
        ['ext-proto', '可交互原型'],
      ].filter(([id]) => groups.some(g => g.includes(`id="${id}"`))),
    },
    ...groups,
  )
}
