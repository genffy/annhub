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
    `
    document.head.appendChild(style)
}

export function removeVocabStyles(): void {
    document.getElementById(STYLE_ID)?.remove()
}
