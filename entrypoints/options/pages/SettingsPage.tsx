import { useEffect, useState } from 'react'
import { BookOpen, RefreshCw } from 'lucide-react'
import LogseqPage from './LogseqPage'
import VocabPage from './VocabPage'
import { Card, PageHeader } from '../components/ui'

type SettingsTab = 'logseq' | 'vocab'

const TABS = [
  { id: 'vocab', label: 'Vocabulary Labeling', icon: BookOpen },
  { id: 'logseq', label: 'Logseq Sync', icon: RefreshCw },
] as const

const SETTINGS_ROUTE_PATH = '/settings'
const DEFAULT_SETTINGS_TAB: SettingsTab = 'vocab'

function readTabFromHash(): SettingsTab {
  const rawHash = window.location.hash.replace(/^#/, '')
  const [path, query = ''] = rawHash.split('?')
  if (path !== SETTINGS_ROUTE_PATH) return DEFAULT_SETTINGS_TAB

  const tab = new URLSearchParams(query).get('tab')
  return tab === 'vocab' || tab === 'logseq' ? tab : DEFAULT_SETTINGS_TAB
}

function writeTabToHash(tab: SettingsTab): void {
  const nextHash = `${SETTINGS_ROUTE_PATH}?tab=${tab}`
  if (window.location.hash.replace(/^#/, '') === nextHash) return
  window.history.replaceState(null, '', `#${nextHash}`)
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => readTabFromHash())

  useEffect(() => {
    const handleHashChange = () => setActiveTab(readTabFromHash())
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const selectTab = (tab: SettingsTab) => {
    setActiveTab(tab)
    writeTabToHash(tab)
  }

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
            onClick={() => selectTab(tab.id)}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'vocab' && <VocabPage embedded />}
      {activeTab === 'logseq' && <LogseqPage embedded />}
    </Card>
  )
}
