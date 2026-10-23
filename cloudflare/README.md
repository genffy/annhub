# Cloudflare 静态官网

官网使用 Workers Static Assets。访问只读取静态文件；语言和地区差异由 zone 规则处理，没有请求 Worker、Next.js 服务端或付费构建服务。产品契约见 [seo-geo.md](../docs/product/seo-geo.md) 与 [permissions.md §8](../docs/product/permissions.md)。

## 配置真源

| 内容                           | 文件                                                        |
| ------------------------------ | ----------------------------------------------------------- |
| 静态目录、域名与 Wrangler 配置 | [website/wrangler.json](../website/wrangler.json)           |
| 生产公开构建变量               | [production.json](production.json)                          |
| 语言、地区与 www 规则          | [site-rules.mjs](site-rules.mjs)                            |
| 国家集合、地区 Cookie          | [website/lib/consent.ts](../website/lib/consent.ts)         |
| HTML 别名、缓存头、发布版本    | [scripts/website-static.mjs](../scripts/website-static.mjs) |
| 构建、产物传递与生产发布       | [.github/workflows/ci.yml](../.github/workflows/ci.yml)     |

Wrangler 的精确版本只写在官网的 `package.json`，本地预览与部署任务读取同一个版本。`production.json` 只能放 `NEXT_PUBLIC_*` 字符串，不能放密钥。`npm run check:consistency` 防止这些位置漂移。

## 首次上线

1. Cloudflare 账户保持 Workers Free。域名 `annhub.org` 的 zone 必须属于同一账户。
2. 创建限制到该账户和 zone 的 API Token：账户 **Workers Scripts: Edit**；zone **Workers Routes: Edit**、**Zone: Read**、**DNS: Edit**、**Transform Rules: Edit**、**Dynamic URL Redirects: Edit**。部署负责上传静态资源和绑定自定义域名，规则脚本负责 URL 改写、响应头与 www 跳转。不要使用 Global API Key。
3. GitHub 仓库创建 `website-production` environment，可将部署分支限制为 main；要无人值守发布，不设置人工 reviewer。配置：

   | 类型                    | 名称                        | 用途                                                                                        |
   | ----------------------- | --------------------------- | ------------------------------------------------------------------------------------------- |
   | Environment secret      | `CLOUDFLARE_API_TOKEN`      | 上面的部署 Token                                                                            |
   | Environment variable    | `CLOUDFLARE_ACCOUNT_ID`     | Cloudflare 账户 ID                                                                          |
   | Environment variable    | `CLOUDFLARE_ZONE_ID`        | annhub.org 的 zone ID                                                                       |
   | **Repository variable** | `CLOUDFLARE_DEPLOY_ENABLED` | 首次准备完成后设为 `true`；job 条件求值发生在 environment 加载之前，不能只放 environment 中 |

4. 合并前先验证候选站点。在已通过本地检查的分支上，用单独的 preview 环境部署，不绑定生产域名：

   ```sh
   cd website
   npm run build
   npx wrangler deploy --env preview
   ```

   在 Wrangler 给出的 workers.dev 地址检查页面和静态路由。预览构建不读取生产统计令牌；zone 上的地区和语言规则也不作用于 workers.dev。生产规则可先在仓库根输出成 JSON 供审阅：

   ```sh
   node scripts/cloudflare-rules.mjs --print
   ```

5. 域名切换只做一次：记录当前 DNS 和 Worker 路由；停用 Netlify 的 Git 自动发布，避免合并时触发原站构建；删除 `annhub-edge` 在 `annhub.org/en*` 与 `annhub.org/zh-CN*` 的两条旧路由，停用原来的法律页 Cache Rule。旧 Worker 路由会优先接管请求，不能留在新站前面。
6. 检查生产域名已有的 DNS/自定义域名绑定。Wrangler 可以创建自定义域名，但有冲突的既有 CNAME 需要先解除；在维护窗口完成这一步，再启用部署开关并合并分支。首次部署会按配置创建/更新 `annhub.org` 与 `www.annhub.org` 的绑定。保留原站用于必要的 DNS 回退，验证完成后停止其服务。
7. 自动发布结束后检查生产 SHA、根路径中英文协商、www 跳转、法律页、未知路径 404、地区 Cookie。真实欧洲出口与非欧洲出口分别核对一次；发送伪造的 `CF-IPCountry` 请求头不能替代这个验证。没有完成这些线上检查前，不能把迁移标记为生产已验收。

API 凭证只放 GitHub Secrets 或本机进程环境，不要提交到仓库或贴到日志。首次账户授权、既有域名冲突和旧路由清理不由普通代码构建自动完成。

## 日常发布

main 的 website job 构建生产静态文件、启动本地 Wrangler 检查路由，然后上传 `website-static-<SHA>`，保留一天。`ci-pass` 通过才执行部署；部署 job 下载本次运行的同名产物，检查版本和文件完整性，同步 zone 规则、上传文件，并访问生产站点验收。它只安装精确版本的 Wrangler CLI，不安装整套网站依赖，也不重复构建。

部署串行执行，进入队列后已经落后于 main 的提交会跳过。失败后可在产物仍有效时重跑失败 job；超过一天，重跑整个 CI 重新产生同一提交的产物。只有 main 当前提交可发布。

`ci-pass` 不依赖发布 job：未启用部署、缺少凭证或 Cloudflare 发布失败不会把通过的代码检查改成失败。发布失败仍会让这一轮 workflow 报红，并保留失败步骤。上线检查失败不会自动回滚，避免把别的已完成配置改动一并撤销。

## 边缘规则

- **www**：Single Redirect Rule 保留路径与查询串，301 到主域名。
- **根路径语言**：读取有效语言 Cookie；否则读取按权重排序的首选浏览器语言。该字段只在 Transform Rules 中可用，因此中文根请求先 URL 改写到 `/__annhub/language/zh-CN`，再由静态 `_redirects` 发出 302；其他根请求静态跳到 `/en`。根跳转设置 `private, no-store`。
- **统计同意**：静态语言页先清除地区 Cookie，防止缺少 zone 规则时沿用旧标记；无需先询问的国家由响应头规则设置 `outside`。其余地区与未知国家保留清除行为。HTML 始终相同。
- **语言 Cookie**：手动语言选择与浏览器默认不同、或需要更新已有选择时，在完整页面响应中追加 Cookie。地区规则先执行、语言规则后执行，使用 `add` 保留地区 Cookie。
- 规则只匹配生产主机。`cloudflare-rules.mjs` 只维护 `annhub_static_` 前缀的规则，不改写或删除同一 zone 的其他规则；不带参数只读并显示计划，`--apply` 才写入。权限错误会中止，不会被当作空 ruleset。

Cloudflare Web Analytics 保持手动嵌入，关闭自动注入。AI 爬虫策略按产品文档保持允许；这些账户设置不在规则同步脚本的管理范围内。

## 验证与回退

```sh
# 仓库根：代码、文档与配置
npm run verify

# 官网目录：构建与本地静态预览
cd website
npm run build
npm run start

# 另一个终端，仓库根：真实静态资源与路由
WEBSITE_SMOKE_ORIGIN=http://localhost:3001 node scripts/smoke-website.mjs --local

# 生产上线后：包括边缘语言规则
node scripts/smoke-website.mjs
```

`--local` 验证页面、资源、导航数据、别名、默认跳转和 404；它不声称验证 Cloudflare zone 规则。单测覆盖规则生成、国家集合、规则同步对其他规则的保留和错误处理。线上脚本还检查语言 Cookie 优先级与查询串，CI 额外核对部署的 SHA。

需要暂停发布时将仓库变量 `CLOUDFLARE_DEPLOY_ENABLED` 设为 `false`。日常回退通过撤销问题提交并合入 main，重新经过同一套检查与发布；首次迁移需要退回原托管平台时，按切换前记录恢复 DNS 和路由。Cloudflare 版本回退不自动恢复 zone 规则，不能只回退静态文件就假定配置也一起恢复。
