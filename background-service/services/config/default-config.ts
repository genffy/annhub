
export const defaultTranslationConfig = {
    enableGoogleTranslate: true,
    enableBaiduTranslate: false,
    enableYoudaoTranslate: false,
    defaultTranslationService: 'google',
    targetLanguage: 'zh-CN',
    showTranslationOnHover: true,
    autoDetectLanguage: true,

    domainWhitelist: {
        enabled: true,
        domains: ['x.com', 'twitter.com']
    },
    apiKeys: {
        google: {
            key: '',
        },
        baidu: {
            appId: '',
            key: '',
        },
        youdao: {
            appKey: '',
            appSecret: '',
        },
    },
    translationRules: {
        enabled: true,
        skipChinese: false,
        skipNumbers: true,
        skipCryptoAddresses: true,
        customRules: [],
    },
}


export const defaultTranslationRules = {
    enabled: true,
    skipChinese: false,
    skipNumbers: true,
    skipCryptoAddresses: true,
    customRules: [],
}
