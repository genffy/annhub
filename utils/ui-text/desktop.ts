import { defineMessages } from './define'

/** Delivery to and sync from Desktop, as shown in status chips and the Settings page (storage.md §8–§9). */
export const desktop = defineMessages({
  'desktop.error.invalidUrl': { zh: '接口地址不是有效的 URL', en: 'The endpoint is not a valid URL' },
  'desktop.error.notLoopback': {
    zh: '接口地址必须是本机的 Desktop 服务，例如 http://127.0.0.1:8765',
    en: 'The endpoint must be the Desktop service on this Mac, for example http://127.0.0.1:8765',
  },
  'desktop.status.noToken': { zh: '未配置配对码（在 Desktop 的「系统」页复制）', en: 'No pairing code set (copy it from Desktop’s “System” page)' },
  'desktop.status.online': { zh: '在线', en: 'Online' },
  'desktop.status.unreachable': { zh: 'Desktop 未运行或端口不可达', en: 'Desktop is not running or the port is unreachable' },
  'desktop.error.tokenMismatch': {
    zh: '配对码不匹配（Desktop 已与其他配对码配对，请重新配对）',
    en: 'The pairing code does not match (Desktop is paired with another code — pair again)',
  },
  'desktop.error.originRejected': { zh: '来源被拒绝（403）', en: 'The origin was rejected (403)' },
  'desktop.error.pullFailed': { zh: '拉取变更失败 HTTP {status}', en: 'Pulling changes failed (HTTP {status})' },
  'desktop.label.fragment': { zh: '碎片 {id}', en: 'Fragment {id}' },
  'desktop.label.image': { zh: '图片 {id}', en: 'Image {id}' },
  'desktop.item.deleted': { zh: '{label} 已在 Desktop 本地删除，不再交付', en: '{label} was deleted on Desktop and will not be delivered' },
  'desktop.item.conflict': { zh: '{label} 与 Desktop 已有记录冲突（409），未交付', en: '{label} conflicts with an existing Desktop record (409) and was not delivered' },
  'desktop.item.tooLarge': {
    zh: '{label} 超过双方上限（413），未交付；本地原图已保留',
    en: '{label} exceeds the limit on both sides (413) and was not delivered; the local original is kept',
  },
  'desktop.item.invalid': { zh: '{label} 未通过 Desktop 校验（422），未交付', en: '{label} did not pass Desktop validation (422) and was not delivered' },
  'desktop.item.rejected': { zh: '{label} 被 Desktop 拒绝（HTTP {status}），未交付', en: '{label} was rejected by Desktop (HTTP {status}) and was not delivered' },
  'desktop.item.parked': {
    zh: '{label} 多次收到 Desktop 错误（HTTP {status}），已暂停自动重试',
    en: '{label} got repeated Desktop errors (HTTP {status}); automatic retries are paused',
  },
  'desktop.item.retryLater': { zh: '{label}：Desktop 错误 HTTP {status}，稍后重试', en: '{label}: Desktop error HTTP {status}, will retry later' },
  'desktop.item.localInvalid': { zh: '碎片 {id} 无法生成交付请求，已跳过：{error}', en: 'Fragment {id} could not produce a delivery request and was skipped: {error}' },
  'desktop.needsAttention': {
    zh: '{count} 项未能交付到 Desktop，需要处理（设置 → Desktop 连接）',
    en: '{count} item(s) could not be delivered to Desktop and need attention (Settings → Desktop connection)',
  },
})
