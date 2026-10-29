// 浏览器扩展章节：把页面内（选区菜单、剪藏、区块剪藏、截图与截图输出）与扩展自己的页面（资料库、阅读与高亮、详情、属性、设置、弹窗）的分组拼起来。
function secExtension() {
  const groups = [
    typeof extFlowGroup === 'function' && extFlowGroup(),
    typeof extClipGroup === 'function' && extClipGroup(),
    typeof extBlockGroup === 'function' && extBlockGroup(),
    typeof extShotGroup === 'function' && extShotGroup(),
    typeof extAnnotateGroup === 'function' && extAnnotateGroup(),
    typeof extRecordGroup === 'function' && extRecordGroup(),
    typeof extShotOutGroup === 'function' && extShotOutGroup(),
    typeof extShotPreciseGroup === 'function' && extShotPreciseGroup(),
    typeof extAppGroup === 'function' && extAppGroup(),
    typeof extReadGroup === 'function' && extReadGroup(),
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
      title: '两种方式留下内容，在库里读成自己的',
      lead: '扩展做三件事：在网页里一步留下内容（剪藏——选中一段或指一下整块——和截图），把它们存成同一种带属性的条目，再让用户在资料库里阅读、划出高亮、整理、检索与导出。页面里不留任何标记；扩展自己的所有页面都是左导航 + 右内容。',
      sub: [
        ['ext-flow', '选区菜单'],
        ['ext-clip', '选区剪藏'],
        ['ext-block', '区块剪藏'],
        ['ext-shot', '截图'],
        ['ext-annotate', '页面批注'],
        ['ext-record', '标签页录制'],
        ['ext-shot-out', '截图输出'],
        ['ext-shot-precise', '精确选区'],
        ['ext-app', '资料库'],
        ['ext-read', '阅读与高亮'],
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
