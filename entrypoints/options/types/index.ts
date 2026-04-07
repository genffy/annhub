export type MenuSection = 'highlights' | 'words' | 'settings' | 'about'

export interface MenuItem {
    id: string
    label: string
    icon: string
    path: string
}
