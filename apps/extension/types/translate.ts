

export interface TranslationConfig {
    enableGoogleTranslate: boolean
    enableBaiduTranslate: boolean
    enableYoudaoTranslate: boolean
    defaultTranslationService: string
    targetLanguage: string
    showTranslationOnHover: boolean
    autoDetectLanguage: boolean
    domainWhitelist: {
        enabled: boolean
        domains: string[]
    }
    apiKeys: {
        google: {
            key: string
        }
        baidu: {
            appId: string
            key: string
        }
        youdao: {
            appKey: string
            appSecret: string
        }
    }
    translationRules: {
        enabled: boolean
        skipChinese: boolean
        skipNumbers: boolean
        skipCryptoAddresses: boolean
        customRules: any[]
    }
}

export interface TranslationRules {
    enabled: boolean
    skipChinese: boolean
    skipNumbers: boolean
    skipCryptoAddresses: boolean
    customRules: any[]
} 