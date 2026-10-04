import './App.css'
import { i18n } from '#i18n'
import { Images, Library, Settings, Sparkles } from 'lucide-react'
import { extensionPageUrl } from '../../utils/extension-pages'

import SettingsPage from './pages/SettingsPage'

import { useRouter, Route } from './hooks/useRouter'

function App() {
  const routes: Route[] = [{ path: '/settings', component: SettingsPage }]

  const { currentPath, currentRoute, navigate, isActive } = useRouter(routes, '/settings')

  const menuItems = [{ id: 'settings', label: '设置', icon: Settings, path: '/settings' }]

  const renderCurrentPage = () => {
    if (!currentRoute) return null

    const Component = currentRoute.component

    switch (currentPath) {
      case '/settings':
        return <Component />
      default:
        return <SettingsPage />
    }
  }

  return (
    <div className="min-h-screen bg-ann-page text-ann-text">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-ann-border bg-ann-surface p-4 shadow-sm backdrop-blur lg:flex lg:flex-col">
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-ann-border bg-ann-surface p-3 shadow-sm">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ann-accent text-ann-on-accent shadow-sm">
            <Sparkles className="h-5 w-5" strokeWidth={2.2} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-none text-ann-text">AnnHub</p>
            <p className="mt-1 truncate text-xs text-ann-muted">{i18n.t('options.name')}</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1" aria-label="AnnHub">
          <a className={navLinkClass(false)} href={extensionPageUrl('library')} data-testid="nav-library">
            <Library className="h-4 w-4" />
            <span>碎片库</span>
          </a>
          <a className={navLinkClass(false)} href={extensionPageUrl('screenshots')} data-testid="nav-screenshots">
            <Images className="h-4 w-4" />
            <span>截图集</span>
          </a>
          {menuItems.map(item => (
            <NavItem key={item.id} active={isActive(item.path)} icon={item.icon} label={item.label} onClick={() => navigate(item.path)} />
          ))}
        </nav>
      </aside>

      <header className="sticky top-0 z-10 border-b border-ann-border bg-ann-surface px-4 py-3 backdrop-blur lg:hidden">
        <div className="mb-3 flex items-center gap-2 font-semibold">
          <Sparkles className="h-5 w-5" />
          <span>{i18n.t('options.name')}</span>
        </div>
        <nav className="flex gap-2 overflow-x-auto">
          <a className="inline-flex shrink-0 items-center gap-2 rounded-full bg-ann-alt px-3 py-2 text-sm text-ann-muted hover:bg-ann-alt" href={extensionPageUrl('library')}>
            <Library className="h-4 w-4" />
            碎片库
          </a>
          <a className="inline-flex shrink-0 items-center gap-2 rounded-full bg-ann-alt px-3 py-2 text-sm text-ann-muted hover:bg-ann-alt" href={extensionPageUrl('screenshots')}>
            <Images className="h-4 w-4" />
            截图集
          </a>
          {menuItems.map(item => (
            <button
              key={item.id}
              type="button"
              className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-sm transition ${isActive(item.path) ? 'bg-ann-accent text-ann-on-accent' : 'bg-ann-alt text-ann-muted hover:bg-ann-alt'}`}
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

const navLinkClass = (active: boolean) =>
  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
    active ? 'bg-ann-accent text-ann-on-accent shadow-sm' : 'text-ann-muted hover:bg-ann-alt hover:text-ann-text'
  }`

function NavItem({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof Settings; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
        active ? 'bg-ann-accent text-ann-on-accent shadow-sm' : 'text-ann-muted hover:bg-ann-alt hover:text-ann-text'
      }`}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </button>
  )
}

export default App
