// 浏览器扩展章节：把页面内（选区菜单、剪藏、高亮、截图）与扩展自己的页面（资料库、详情、属性、设置、弹窗）的分组拼起来。
function secExtension() {
  const groups = [
    typeof extFlowGroup === 'function' && extFlowGroup(),
    typeof extClipGroup === 'function' && extClipGroup(),
    typeof extHlGroup === 'function' && extHlGroup(),
    typeof extShotGroup === 'function' && extShotGroup(),
    typeof extShotR3Group === 'function' && extShotR3Group(),
    typeof extAppGroup === 'function' && extAppGroup(),
    typeof extDetailGroup === 'function' && extDetailGroup(),
    typeof extPropsGroup === 'function' && extPropsGroup(),
    typeof extSettingsGroup === 'function' && extSettingsGroup(),
    typeof extStatesGroup === 'function' && extStatesGroup(),
    typeof extPopupGroup === 'function' && extPopupGroup(),
    typeof extProtoGroup === 'function' && extProtoGroup(),
  ].filter(Boolean)
  return section(
    {
      id: 'ext',
      nav: '浏览器扩展',
      eyebrow: 'Chrome 扩展',
      title: '三种方式留下内容，一个库找回它们',
      lead: '扩展做三件事：在网页里一步保存内容（剪藏、高亮、截图），把它们存成同一种带属性的条目，让用户随时检索、整理与导出。页面里只有一个选区菜单；扩展自己的所有页面都是左导航 + 右内容。',
      sub: [
        ['ext-flow', '选区菜单'],
        ['ext-clip', '剪藏'],
        ['ext-hl', '高亮'],
        ['ext-shot', '截图'],
        ['ext-shot-r3', '精确选区 R3'],
        ['ext-app', '资料库'],
        ['ext-detail', '详情与属性'],
        ['ext-props', '属性页'],
        ['ext-settings', '设置'],
        ['ext-states', '空状态与导出'],
        ['ext-popup', '工具栏弹窗'],
        ['ext-proto', '可交互原型'],
      ].filter(([id]) => groups.some(g => g.includes(`id="${id}"`))),
    },
    ...groups,
  )
}
