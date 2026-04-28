import './App.css'
import { i18n } from '#i18n'
import { BookOpen, Highlighter, Settings, Sparkles } from 'lucide-react'

import HighlightPage from './pages/HighlightPage'
import SettingsPage from './pages/SettingsPage'
import WordsManagementPage from './pages/WordsManagementPage'

import { useRouter, Route } from './hooks/useRouter'

function App() {
  const routes: Route[] = [
    { path: '/highlights', component: HighlightPage },
    { path: '/words', component: WordsManagementPage },
    { path: '/settings', component: SettingsPage },
  ]

  const { currentPath, currentRoute, navigate, isActive } = useRouter(routes, '/highlights')

  const menuItems = [
    { id: 'highlights', label: i18n.t('options.menus.highlights.label'), icon: Highlighter, path: '/highlights' },
    { id: 'words', label: i18n.t('options.menus.words.label'), icon: BookOpen, path: '/words' },
    { id: 'settings', label: i18n.t('options.menus.settings.label'), icon: Settings, path: '/settings' },
  ]

  const renderCurrentPage = () => {
    if (!currentRoute) return null

    const Component = currentRoute.component

    switch (currentPath) {
      case '/highlights':
      case '/words':
      case '/settings':
        return <Component />
      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur lg:flex lg:flex-col">
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white shadow-sm">
            <Sparkles className="h-5 w-5" strokeWidth={2.2} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-none text-slate-950">AnnHub</p>
            <p className="mt-1 truncate text-xs text-slate-500">{i18n.t('options.name')}</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {menuItems.map(item => (
            <NavItem key={item.id} active={isActive(item.path)} icon={item.icon} label={item.label} onClick={() => navigate(item.path)} />
          ))}
        </nav>
      </aside>

      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="mb-3 flex items-center gap-2 font-semibold">
          <Sparkles className="h-5 w-5" />
          <span>{i18n.t('options.name')}</span>
        </div>
        <nav className="flex gap-2 overflow-x-auto">
          {menuItems.map(item => (
            <button
              key={item.id}
              type="button"
              className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-sm transition ${isActive(item.path) ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              onClick={() => navigate(item.path)}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="w-full px-4 py-6 lg:ml-64 lg:w-[calc(100%-16rem)] lg:px-8 lg:py-8">{renderCurrentPage()}</main>
    </div>
  )
}

function NavItem({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof Highlighter; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
        active ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
      }`}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </button>
  )
}

export default App
