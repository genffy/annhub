export interface TranslationConfig {
    enableGoogleTranslate: boolean
    enableBaiduTranslate: boolean
    enableYoudaoTranslate: boolean
    defaultTranslationService: 'google' | 'baidu' | 'youdao'
    targetLanguage: string
    showTranslationOnHover: boolean
    autoDetectLanguage: boolean
    domainWhitelist: {
        enabled: boolean
        domains: string[]
    }
    apiKeys: {
        google: { key: string }
        baidu: { appId: string, key: string }
        youdao: { appKey: string, appSecret: string }
    }
}

export type MenuSection = 'translation' | 'highlights' | 'about'

export interface MenuItem {
    id: MenuSection
    label: string
    icon: string
    path: string
}

export type TabType = 'basic' | 'apiKeys' | 'advanced' | 'domainWhitelist'

export interface TabItem {
    id: TabType
    label: string
    icon: string
} 