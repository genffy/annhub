# Cloudflare 边缘缓存

> 依据：[docs/v2/seo-geo.md §3.7](../docs/v2/seo-geo.md)。本目录是控制台配置的仓库侧真源：`edge-cache.js` 是要粘贴的 Worker 脚本，本文件是部署与核对步骤。

语言页的 HTML 每次访问都从 Cloudflare 回源到 Netlify，是 TTFB 的大头（离两边都远的访客尤其明显）。Worker 在 Cloudflare 边缘按 POP 缓存 HTML 副本，逐请求补写同意 Cookie（规则与 `website/lib/consent.ts` 一致，`utils/__tests__/website-consent.test.ts` 核对两边不漂移）。

## 部署（约 5 分钟）

1. **Worker**：Cloudflare 控制台 → Workers & Pages → Create → Worker → 名字 `annhub-edge` → Edit code → 粘贴 `edge-cache.js` 全文 → Deploy。
2. **路由**：该 Worker → Settings → Domains & Routes → Add → Route：`annhub.org/en`（zone 选 annhub.org）→ 再加一条 `annhub.org/zh-CN`。只匹配这两个精确路径，其余流量（`/_next`、`/og`、法律页、根路径跳转）不受影响。
3. **法律页的 Cache Rule**：Caching → Cache Rules → Create rule：
   - 名字 `legal-pages`；When incoming requests match：Hostname equals `annhub.org` AND（URI Path starts with `/privacy-policy` OR URI Path starts with `/terms-of-service`）；
   - Then：Eligible for cache；Edge TTL：Ignore cache-control and set this TTL → 1 hour。
     法律页没有每访客差异，不需要 Worker。

## 部署后核对（在本机，即非欧洲出口）

```sh
curl -sI https://annhub.org/en | grep -i 'x-annhub-edge\|set-cookie'   # 第一次 miss，第二次起 hit；应有 annhub-region=outside
curl -sI https://annhub.org/zh-CN | grep -i 'x-annhub-edge'             # hit
curl -sI https://annhub.org/en -H 'rsc: 1' | grep -i 'x-annhub-edge'    # 无此头（绕过缓存，直接回源）
curl -s https://annhub.org/en | grep -c 'FAQPage'                       # 页面内容完整（缓存的是真页面）
```

月度检查见 seo-geo.md §7.3 第 4 条。

## 行为与边界

- 缓存键是路径，`?utm_*` 等查询串不另占副本；副本 TTL 1 小时（`s-maxage`），浏览器仍按源站的 `max-age=0` 每次向边缘校验，ETag 匹配返回 304。
- 带数据头（`RSC`、`x-nextjs-data`、`next-router-prefetch`）的请求绕过缓存，永远拿到源站响应。
- 副本不带任何 `Set-Cookie`；同意 Cookie 由 Worker 按请求国家逐次补写，欧洲访客不写、带着 Cookie 到欧洲会被删。
- 内容更新后各 POP 最多 1 小时过期；要立即生效就在控制台 Caching → Configuration → Purge Everything（或按 URL 清除）。
- 免费 Workers 额度 10 万请求/天；该站流量远低于此。

## 回滚

删掉 Worker 的两条路由即可——流量立刻回到不经 Worker 的现状（Cache Rule 也一并关掉）。仓库里的文件不部署就不生效。

## 暂不做（记录取舍）

- **根路径 `/` 的语言跳转**仍在源站（Next 代理）：把它挪进 Worker 能省一次回源，等边缘缓存验证稳定后再考虑。
- **发布后自动清缓存**（GitHub Actions 调 Cloudflare API）：1 小时的陈旧窗口对营销页可接受，需要时再加。
