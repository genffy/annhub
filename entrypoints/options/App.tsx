import { useState, useEffect } from 'react'
import './App.css'
import { i18n } from '#i18n';

import HighlightPage from './pages/HighlightPage'


import { MenuItem } from './types'
import { TranslationConfig } from '../../types/translate'
import { useRouter, Route } from './hooks/useRouter'
import MessageUtils from '../../utils/message'


function App() {
    const [config, setConfig] = useState<TranslationConfig>({
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
            google: { key: '' },
            baidu: { appId: '', key: '' },
            youdao: { appKey: '', appSecret: '' }
        },
        translationRules: {
            enabled: true,
            skipChinese: false,
            skipNumbers: true,
            skipCryptoAddresses: true,
            customRules: []
        }
    })

    const [isSaving, setIsSaving] = useState(false)
    const [saveMessage, setSaveMessage] = useState('')


    const routes: Route[] = [
        { path: '/highlights', component: HighlightPage },
    ]


    const { currentPath, currentRoute, navigate, isActive } = useRouter(routes, '/highlights')


    const menuItems: MenuItem[] = [
        { id: 'highlights', label: i18n.t("options.menus.highlights.label"), icon: i18n.t("options.menus.highlights.icon"), path: '/highlights' },
    ]

    // Load config from background script on component mount
    useEffect(() => {
        const loadConfig = async () => {
            try {
                const response = await MessageUtils.sendMessage({
                    type: 'GET_CONFIG',
                    configType: 'translation'
                })

                if (response.success && response.data) {
                    setConfig(prev => ({
                        ...prev,
                        ...response.data,
                        apiKeys: {
                            ...prev.apiKeys,
                            ...response.data.apiKeys
                        }
                    }))
                }
            } catch (error) {
                console.error('Failed to load config:', error)
            }
        }

        loadConfig()
    }, [])

    const handleConfigChange = (key: keyof TranslationConfig, value: any) => {
        setConfig(prev => ({
            ...prev,
            [key]: value
        }))
    }

    const handleApiKeyChange = (service: 'google' | 'baidu' | 'youdao', key: string, value: string) => {
        setConfig(prev => ({
            ...prev,
            apiKeys: {
                ...prev.apiKeys,
                [service]: {
                    ...prev.apiKeys[service],
                    [key]: value
                }
            }
        }))
    }

    const handleSave = async () => {
        setIsSaving(true)
        try {
            const response = await MessageUtils.sendMessage({
                type: 'SET_CONFIG',
                configType: 'translation',
                config: config
            })

            if (response.success) {
                setSaveMessage(i18n.t('network.success'))
            } else {
                setSaveMessage(i18n.t('network.errorWithReason', [response.error || i18n.t('network.unknow')]))
            }
            setTimeout(() => setSaveMessage(''), 3000)
        } catch (error) {
            setSaveMessage(i18n.t('network.retry'))
            setTimeout(() => setSaveMessage(''), 3000)
        } finally {
            setIsSaving(false)
        }
    }


    const renderCurrentPage = () => {
        if (!currentRoute) return null

        const Component = currentRoute.component

        switch (currentPath) {
            case '/highlights':
                return <Component />
            default:
                return null
        }
    }

    return (
        <div className="options-layout">
            <aside className="sidebar">
                <div className="sidebar-header">
                    <h1>⚙️ {i18n.t("options.name")}</h1>
                </div>
                <nav className="sidebar-nav">
                    {menuItems.map((item) => (
                        <button
                            key={item.id}
                            className={`nav-item ${isActive(item.path) ? 'active' : ''}`}
                            onClick={() => navigate(item.path)}
                        >
                            <span className="nav-icon">{item.icon}</span>
                            <span className="nav-label">{item.label}</span>
                        </button>
                    ))}
                </nav>
            </aside>

            <main className="main-content">
                <div className="content-wrapper">
                    {renderCurrentPage()}
                </div>
            </main>
        </div>
    )
}

export default App 