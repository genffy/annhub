// macOS Desktop 章节：把各页面的分组拼起来。
function secDesktop() {
  const groups = [
    typeof deskShellGroup === 'function' && deskShellGroup(),
    typeof deskTodayGroup === 'function' && deskTodayGroup(),
    typeof deskLibraryGroup === 'function' && deskLibraryGroup(),
    typeof deskReviewGroup === 'function' && deskReviewGroup(),
    typeof deskSystemGroup === 'function' && deskSystemGroup(),
    typeof deskMenubarGroup === 'function' && deskMenubarGroup(),
    typeof deskPaletteGroup === 'function' && deskPaletteGroup(),
    typeof deskPrefsGroup === 'function' && deskPrefsGroup(),
    typeof deskProtoGroup === 'function' && deskProtoGroup(),
  ].filter(Boolean)
  return section(
    {
      id: 'desk',
      nav: '桌面端',
      eyebrow: 'Part 2 · macOS Desktop',
      title: '在专注的环境里，回忆与整理',
      lead: 'Desktop 是学习消费端和本地数据中枢：查看与整理 Fragment、完成每日提取复习，同时通过本机接口逐条接收扩展的写入。它不负责网页阅读、网页高亮或团队协作。',
      sub: [
        ['desk-shell', '窗口与导航'],
        ['desk-today', '今日'],
        ['desk-library', '碎片库'],
        ['desk-review', '复习会话'],
        ['desk-system', '系统'],
        ['desk-menubar', '菜单栏与通知'],
        ['desk-palette', '命令面板'],
        ['desk-prefs', '偏好设置'],
        ['desk-proto', '可交互原型'],
      ].filter(([id]) => groups.some(g => g.includes(`id="${id}"`))),
    },
    ...groups,
  )
}
