/** The annotation layer's stylesheet: one rule per surface, all under the layer's namespace. Moved verbatim from layer.ts's begin(). */
import { ROOT_ATTR, ROOT_VALUE } from './annotation-roots'
export const layerStyles = `      /* The host rides the top layer via popover=manual; the UA stylesheet for [popover]
         shrinks it to fit-content with an auto margin and a Canvas background, so every
         one of those is overridden back to a full, transparent, click-through viewport. */
      [${ROOT_ATTR}="${ROOT_VALUE}"] { position: fixed; inset: 0; width: 100%; height: 100%; max-width: none; max-height: none; margin: 0; border: 0; padding: 0; background: transparent; overflow: visible; z-index: 2147483647; pointer-events: none; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-annot-canvas { position: absolute; inset: 0; pointer-events: none; }
      [${ROOT_ATTR}="${ROOT_VALUE}"].ann-annot-drawing .ann-annot-canvas { pointer-events: auto; cursor: crosshair; touch-action: none; }
      /* the toolbar on the window's edge is one of the always-dark pills (visual.md §2): --annov-pill-* never follow the system */
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-annot-toolbar { position: absolute; left: 8px; top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; align-items: center; gap: 2px; max-height: calc(100vh - 16px); overflow-y: auto; scrollbar-width: none; box-sizing: border-box; padding: 5px; border-radius: 12px; background: var(--annov-pill-bg, #1b1f2a); box-shadow: var(--annov-pill-shadow, 0 12px 30px -8px rgb(0 0 0 / 0.55), 0 0 0 1px rgb(255 255 255 / 0.07)); pointer-events: auto; color: var(--annov-pill-text, #eceff6); }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-annot-toolbar button { display: grid; place-items: center; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 8px; background: transparent; color: inherit; cursor: pointer; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-annot-toolbar button:hover { background: var(--annov-pill-hover, rgb(255 255 255 / 0.12)); }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-annot-toolbar button.ann-annot-active { background: color-mix(in srgb, var(--annov-pill-focus, #b9a3f2) 28%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--annov-pill-focus, #b9a3f2) 60%, transparent); }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-annot-toolbar button:disabled { opacity: .4; cursor: default; pointer-events: none; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-annot-toolbar button:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--annov-pill-focus, #b9a3f2); }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-annot-toolbar svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-annot-divider { width: 20px; height: 1px; margin: 5px 0; background: var(--annov-pill-line, rgb(255 255 255 / 0.14)); }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-annot-swatch { width: 14px !important; height: 14px !important; margin: 2px 0; border: 0 !important; border-radius: 50% !important; background: var(--swatch) !important; box-shadow: 0 0 0 1.5px var(--annov-pill-kbd-line, rgb(255 255 255 / 0.22)) !important; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-annot-swatch:hover { background: var(--swatch) !important; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-annot-swatch.ann-annot-active { box-shadow: 0 0 0 2px var(--annov-pill-bg, #1b1f2a), 0 0 0 3.5px var(--annov-pill-text, #eceff6) !important; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-annot-widths { display: flex; flex-direction: column; align-items: center; gap: 2px; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-annot-widths button { width: 26px !important; height: 20px !important; border-radius: 6px; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-annot-widths i { display: block; border-radius: 50%; background: currentColor; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-annot-notice { position: absolute; top: 16px; left: 50%; transform: translateX(-50%); max-width: calc(100vw - 32px); box-sizing: border-box; padding: 7px 14px; border-radius: 999px; background: var(--annov-pill-bg, #1b1f2a); color: var(--annov-pill-text, #eceff6); box-shadow: var(--annov-pill-shadow, 0 12px 30px -8px rgb(0 0 0 / 0.55), 0 0 0 1px rgb(255 255 255 / 0.07)); font: 12px/1.4 -apple-system, sans-serif; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-annot-text-input { position: absolute; min-width: 110px; min-height: 32px; padding: 4px; box-sizing: border-box; border: 1px solid #4c91ff; background: var(--annov-surface, #fff); color: var(--annov-text, #20252b); font: 16px/1.3 -apple-system, sans-serif; resize: both; pointer-events: auto; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-annot-step-ring { position: absolute; box-sizing: border-box; border: 2px solid #4c91ff; border-radius: 50%; pointer-events: none; }
      [${ROOT_ATTR}="${ROOT_VALUE}"] .ann-annot-step-ring button { position: absolute; top: -10px; right: -10px; display: grid; place-items: center; width: 20px; height: 20px; padding: 0; border: 0; border-radius: 50%; background: #4c91ff; color: #fff; font: 600 15px/1 -apple-system, sans-serif; cursor: pointer; pointer-events: auto; }
`
