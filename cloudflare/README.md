# Cloudflare 边缘缓存

> 依据：[docs/v2/seo-geo.md §3.7](../docs/v2/seo-geo.md)。本目录是控制台配置的仓库侧真源：`edge-cache.js` 是要粘贴的 Worker 脚本，本文件是部署与核对步骤。

语言页的 HTML 每次访问都从 Cloudflare 回源到 Netlify，是 TTFB 的大头（离两边都远的访客尤其明显）。Worker 在 Cloudflare 边缘按 POP 缓存 HTML 副本，逐请求补写同意 Cookie（规则与 `website/lib/consent.ts` 一致，`utils/__tests__/website-consent.test.ts` 核对两边不漂移）。

## 部署（约 5 分钟）

导航按 2026-10 版控制台写；旧版把第 1 步的入口叫「Workers & Pages」，现在在 **Compute** 分组下。

1. **Worker**：Cloudflare 控制台 → 侧边栏 **Compute** → Workers & Pages → Create → Worker → 名字 `annhub-edge` → Edit code → 粘贴 `edge-cache.js` 全文 → Deploy。
2. **路由**：该 Worker → Settings → Domains & Routes → Add → Route：`annhub.org/en*`（zone 选 annhub.org）→ 再加一条 `annhub.org/zh-CN*`。必须带 `*`：精确模式不匹配带 `?utm_*` 查询串的分享链接，实测会绕过 Worker。通配符可能误伤的路径（例如将来的 `/entries`）由脚本开头的守卫放行，只有 `/en` 与 `/zh-CN` 两个精确页面被缓存；其余流量（`/_next`、`/og`、法律页、根路径跳转）不经 Worker。
3. **法律页的 Cache Rule**：域名 annhub.org → **Caching → Cache Rules** → Create rule：
   - 名字 `legal-pages`；When incoming requests match：Hostname equals `annhub.org` AND（URI Path starts with `/privacy-policy` OR URI Path starts with `/terms-of-service`）；
   - Then：Eligible for cache；Edge TTL：Ignore cache-control and set this TTL → 1 hour。
     法律页没有每访客差异，不需要 Worker。

## 部署后核对（在本机，即非欧洲出口）

```sh
curl -sI https://annhub.org/en | grep -i 'x-annhub-edge\|set-cookie'   # 第一次 miss，第二次起 hit；应有 annhub-region=outside
curl -sI https://annhub.org/zh-CN | grep -i 'x-annhub-edge'             # hit
curl -sI https://annhub.org/en -H 'rsc: 1' | grep -i 'x-annhub-edge'    # 无此头（绕过缓存，直接回源）
curl -sI "https://annhub.org/en?utm_source=verify" | grep -i 'x-annhub-edge'  # 也应是 hit（查询串共享副本）
curl -s https://annhub.org/en | grep -c 'FAQPage'                       # 页面内容完整（缓存的是真页面）
```

月度检查见 seo-geo.md §7.3 第 4 条。

## 行为与边界

- 缓存键是路径，`?utm_*` 等查询串不另占副本；副本 TTL 1 小时（`s-maxage`），浏览器仍按源站的 `max-age=0` 每次向边缘校验，ETag 匹配返回 304。只有 200 响应入缓存，源站偶发错误不会污染副本。
- 带数据头（`RSC`、`x-nextjs-data`、`next-router-prefetch`）的请求绕过缓存，直接回源（同 zone 子请求直达源站，不会再进这个 Worker）。
- 副本不带任何 `Set-Cookie`；同意 Cookie 由 Worker 按请求国家逐次补写，欧洲访客不写、带着 Cookie 到欧洲会被删。HTML 先整体缓冲再存与发（页面 gzip 后约 60KB）：流式 `clone()` 的 tee 在本地运行时会截断副本，不值得为一个这么小的页面冒险。
- 内容更新后各 POP 最多 1 小时过期；要立即生效就在控制台 Caching → Configuration → Purge Everything（或按 URL 清除）。
- 免费 Workers 额度 10 万请求/天；该站流量远低于此。

## 本地试跑

```sh
# 起一个本地源站（先 cd website && npm run build）
npx next start -p 3210 &
# 做一份指向本地源站的副本，再交给 wrangler 跑（在仓库根执行）
sed -e "s|await fetch(url.toString(), { headers, redirect: 'manual' })|await fetch('http://127.0.0.1:3210' + url.pathname, { headers, redirect: 'manual' })|" \
    cloudflare/edge-cache.js > /tmp/edge-cache-test.js
npx wrangler dev /tmp/edge-cache-test.js --port 8799 --ip 127.0.0.1
# 另开终端：curl -sD - -o /dev/null -H 'x-test-country: CN' http://127.0.0.1:8799/en
```

本地与线上的两处已知差异：wrangler 会剥掉入站的 `cf-*` 头（上面用 `x-test-country` 代替国家来源），且不模拟「同 zone 子请求直达源站」（`RSC: 1` 的绕过请求在本地会自环报 500，属预期）。

## 回滚

删掉 Worker 的两条路由即可——流量立刻回到不经 Worker 的现状（Cache Rule 也一并关掉）。仓库里的文件不部署就不生效。

## 暂不做（记录取舍）

- **根路径 `/` 的语言跳转**仍在源站（Next 代理）：把它挪进 Worker 能省一次回源，等边缘缓存验证稳定后再考虑。
- **发布后自动清缓存**（GitHub Actions 调 Cloudflare API）：1 小时的陈旧窗口对营销页可接受，需要时再加。
