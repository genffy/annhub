import { useState } from 'react'
import { BookOpen, RefreshCw } from 'lucide-react'
import LogseqPage from './LogseqPage'
import VocabPage from './VocabPage'
import { Card, PageHeader } from '../components/ui'

type SettingsTab = 'logseq' | 'vocab'

const TABS = [
  { id: 'logseq', label: 'Logseq Sync', icon: RefreshCw },
  { id: 'vocab', label: 'Vocabulary Labeling', icon: BookOpen },
]

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('logseq')

  return (
    <Card>
      <PageHeader title="Settings" description="Configure sync, vocabulary labeling, and model options." />

      <div className="mb-6 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
              activeTab === tab.id ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
            }`}
            onClick={() => setActiveTab(tab.id as SettingsTab)}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'logseq' && <LogseqPage embedded />}
      {activeTab === 'vocab' && <VocabPage embedded />}
    </Card>
  )
}
