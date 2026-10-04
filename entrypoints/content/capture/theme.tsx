/**
 * Shared surface tokens for the in-page windows (docs/v2/visual.md): one
 * brand-purple accent, light and dark token sets that follow the system, and
 * a surface of their own so the page being read is never restyled. The tokens
 * are CSS variables declared inside the shadow root; inline styles reference
 * them with var(--ann-*).
 */
export const THEME_CSS = `
[data-ann-theme] {
  --ann-surface: #ffffff;
  --ann-surface-alt: #f6f7f9;
  --ann-border: #d6d8de;
  --ann-text: #1a1d24;
  --ann-muted: #636977;
  --ann-accent: #673ab8;
  --ann-accent-contrast: #ffffff;
  --ann-accent-soft: #efe9fa;
  --ann-mark: #fff2a8;
  --ann-danger: #c6373c;
  --ann-danger-bg: #fdf0f0;
  --ann-success: #226a3c;
  --ann-success-bg: #eef7ef;
  --ann-overlay: rgba(15, 15, 20, 0.45);
  --ann-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
}
@media (prefers-color-scheme: dark) {
  [data-ann-theme] {
    --ann-surface: #1f2127;
    --ann-surface-alt: #2a2d35;
    --ann-border: #3d414c;
    --ann-text: #ececf1;
    --ann-muted: #a3a8b6;
    --ann-accent: #8a63d2;
    --ann-accent-contrast: #ffffff;
    --ann-accent-soft: #332a4a;
    --ann-mark: #5c4b00;
    --ann-danger: #ff8a8e;
    --ann-danger-bg: #3a2325;
    --ann-success: #7fd8a1;
    --ann-success-bg: #1f3328;
    --ann-overlay: rgba(0, 0, 0, 0.6);
    --ann-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
  }
}
[data-ann-theme] button:focus-visible,
[data-ann-theme] input:focus-visible,
[data-ann-theme] textarea:focus-visible,
[data-ann-theme] select:focus-visible {
  outline: 2px solid var(--ann-accent);
  outline-offset: 2px;
}
`

export function ThemeStyle() {
  return <style>{THEME_CSS}</style>
}
