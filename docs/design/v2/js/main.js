// 组装各章节并初始化画布。章节脚本以 function 声明导出（挂在 window 上），缺失的章节会被跳过。
const SECTION_DEFS = [
  ['overview', '总览', 'secOverview'],
  ['system', '设计系统', 'secSystem'],
  ['ext', '浏览器扩展', 'secExtension'],
  ['journey', '一周走查', 'secJourney'],
  ['open', '范围边界', 'secOpen'],
]

const sections = SECTION_DEFS.filter(([, , fn]) => typeof window[fn] === 'function')

document.getElementById('nav').innerHTML = sections.map(([id, label]) => `<a href="#${id}">${label}</a>`).join('')
document.getElementById('app').innerHTML =
  sections.map(([, , fn]) => window[fn]()).join('') +
  `<footer class="cv-footer ui">
    本稿由 <code>docs/design/v2/</code> 下的静态文件构成，无需构建，起一个静态服务后打开 <code>index.html</code>。图标来自仓库已安装的 lucide-react（扩展同源）。<br />
    文案与规则以 <a href="../../v2/README.md">docs/v2</a> 为准；本稿只做视觉与交互表达，不另写规则。
  </footer>`

initChrome()
fitBoards()
if (typeof fillSystemRuntime === 'function') fillSystemRuntime()
if (typeof initProtoCapture === 'function') initProtoCapture()
if (typeof initProtoApp === 'function') initProtoApp()

// 调试 / 单板查看：index.html?solo=关键字（匹配画板标题）或 ?solo=序号，只渲染对应画板，便于逐块放大检查。
const soloKey = new URLSearchParams(location.search).get('solo')
if (soloKey) {
  const all = [...document.querySelectorAll('.cv-board')]
  const hit = /^\d+$/.test(soloKey) ? [all[+soloKey]] : all.filter(b => b.querySelector('h4').textContent.includes(soloKey))
  const app = document.getElementById('app')
  app.innerHTML = ''
  hit.filter(Boolean).forEach(b => {
    const r = document.createElement('div')
    r.className = 'cv-row'
    r.appendChild(b)
    app.appendChild(r)
  })
  document.querySelector('.cv-nav').style.visibility = 'hidden'
  fitBoards()
}
