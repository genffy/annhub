
export interface MixedSelectionContent {
    text: string
    images: Array<{
        element: HTMLImageElement
        src: string
        alt: string
        rect: DOMRect
    }>
    hasText: boolean
    hasImages: boolean
    totalElements: number
}