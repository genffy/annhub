import './App.css'
import { i18n } from '#i18n';

import HighlightPage from './pages/HighlightPage'
import SettingsPage from './pages/SettingsPage'
import WordsManagementPage from './pages/WordsManagementPage'


import { MenuItem } from './types'
import { useRouter, Route } from './hooks/useRouter'


function App() {

    const routes: Route[] = [
        { path: '/highlights', component: HighlightPage },
        { path: '/words', component: WordsManagementPage },
        { path: '/settings', component: SettingsPage },
    ]


    const { currentPath, currentRoute, navigate, isActive } = useRouter(routes, '/highlights')


    const menuItems: MenuItem[] = [
        { id: 'highlights', label: i18n.t("options.menus.highlights.label"), icon: i18n.t("options.menus.highlights.icon"), path: '/highlights' },
        { id: 'words', label: 'Words Management', icon: '📚', path: '/words' },
        { id: 'settings', label: 'Settings', icon: '⚙️', path: '/settings' },
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
