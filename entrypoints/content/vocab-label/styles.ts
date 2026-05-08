const STYLE_ID = 'ann-vocab-label-styles'

export function injectVocabStyles(): void {
    if (document.getElementById(STYLE_ID)) return

    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = `
        ruby.ann-vocab-ruby {
            ruby-position: over;
        }
        ruby.ann-vocab-ruby rt {
            font-size: 0.65em;
            color: #888;
            line-height: 1;
            user-select: none;
            pointer-events: none;
        }
        .ann-vocab-underline {
            text-decoration: underline;
            text-decoration-color: #e91e63;
            text-decoration-style: dotted;
            text-underline-offset: 2px;
        }
        .ann-vocab-feedback-menu {
            position: fixed;
            z-index: 2147483647;
            display: none;
            gap: 4px;
            padding: 6px;
            border-radius: 8px;
            border: 1px solid rgba(0, 0, 0, 0.12);
            background: #fff;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
            font-size: 12px;
        }
        .ann-vocab-feedback-menu.is-open {
            display: flex;
        }
        .ann-vocab-feedback-menu button {
            border: 1px solid #ddd;
            background: #fafafa;
            border-radius: 6px;
            padding: 2px 8px;
            cursor: pointer;
            font-size: 12px;
            line-height: 1.6;
        }
        .ann-vocab-feedback-menu button:hover {
            background: #f0f0f0;
        }
    `
    document.head.appendChild(style)
}

export function removeVocabStyles(): void {
    document.getElementById(STYLE_ID)?.remove()
}
