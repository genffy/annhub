import { useState } from 'react'
import LogseqPage from './LogseqPage'
import VocabPage from './VocabPage'

type SettingsTab = 'logseq' | 'vocab'

const TABS: Array<{ id: SettingsTab; label: string; icon: string }> = [
    { id: 'logseq', label: 'Logseq Sync', icon: '🔄' },
    { id: 'vocab', label: 'Vocabulary Labeling', icon: '📚' },
]

export default function SettingsPage() {
    const [activeTab, setActiveTab] = useState<SettingsTab>('logseq')

    return (
        <div className="content-section">
            <h2>Settings</h2>
            <p className="section-description">
                Configure sync, vocabulary labeling, and model options.
            </p>

            <div className="tab-container">
                <div className="tab-nav">
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            type="button"
                            className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            <span className="tab-icon">{tab.icon}</span>
                            <span className="tab-label">{tab.label}</span>
                        </button>
                    ))}
                </div>

                <div className="tab-content-wrapper">
                    <div className="tab-content">
                        {activeTab === 'logseq' && <LogseqPage embedded />}
                        {activeTab === 'vocab' && <VocabPage embedded />}
                    </div>
                </div>
            </div>
        </div>
    )
}
