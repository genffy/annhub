# 来源页面结构夹具

这些文件保留公开页面的嵌套、类名、语言标记、公式与脚注关系；正文、作者名、代码示例、图片和外部链接替换成中性样本。脚本、表单和远程样式不执行。它们验证真实 DOM 结构经过正文提取后的结果，不表示已经覆盖登录状态或线上改版。

| 文件                      | 原始来源                                                                                        | 保留的结构                                                                           |
| ------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `encyclopedia.html`       | [Wikipedia：Quadratic formula](https://en.wikipedia.org/wiki/Quadratic_formula)                 | 正文容器、MathML 与 TeX、参考文献锚点、表格                                          |
| `documentation.html`      | [Python Tutorial：More Control Flow Tools](https://docs.python.org/3/tutorial/controlflow.html) | Sphinx 正文、Pygments 代码、外层语言标记、节标题                                     |
| `issue.html`              | [Defuddle issue 56](https://github.com/kepano/defuddle/issues/56) 的上游夹具                    | 主帖、评论、时间元素、Markdown 容器                                                  |
| `x-rich-article.html`     | 上游 X 长文页面夹具                                                                             | X 的 DraftEditor 长文、分块 div、代码标题、列表；移除 testid 后仍验证语义提取        |
| `x-rendered-article.html` | [公开 X 长文](https://x.com/arscontexta/status/2013045749580259680)的可见页面结构               | 普通 div 正文、语义标题、Shiki 代码与独立语言标签；无 contenteditable 或 testid 锚点 |

上游夹具取自 [Defuddle 固定提交](https://github.com/kepano/defuddle/tree/3e8bde9f5f855bc968e95837a750c5968a9fe639/tests/fixtures)，其 MIT 声明见 [DEFUDDLE-LICENSE.txt](DEFUDDLE-LICENSE.txt)。百科与 Python 页面直接取公开 HTML；保留公式和结构，替换叙述文字。百科来源的许可见 [Wikipedia 版权说明](https://en.wikipedia.org/wiki/Wikipedia:Copyrights)，Python 来源的许可见 [Python 文档许可](https://docs.python.org/3/license.html)。
