import { useState } from 'react'
import HighlightList from '../../components/ui/highlight-list'
import { i18n } from '#i18n'

type ViewMode = 'highlights' | 'chats'

function App() {
    const [currentView, setCurrentView] = useState<ViewMode>('highlights')

    const viewOptions = [
        { value: 'highlights', label: i18n.t("highlight.name"), icon: '📝' },
        { value: 'chats', label: i18n.t("sidepanel.name"), icon: '💬' },
    ]

    const renderContent = () => {
        switch (currentView) {
            case 'highlights':
                return (
                    <HighlightList
                        className="sidebar-highlight-list"
                        showHeader={false}
                        showPagination={true}
                        initialPageSize={10}
                    />
                )
            case 'chats':
                return (
                    <div className="sidebar-section">
                        <h3>{i18n.t("sidepanel.name")}</h3>
                        <p>{i18n.t("wip", [i18n.t("sidepanel.name")])}</p>
                    </div>
                )
            default:
                return null
        }
    }

    return (
        <div className="sidebar-container">
            <div className="sidebar-header">
                <h1>{i18n.t("sidepanel.title")}</h1>

                <div className="view-selector">
                    <select
                        value={currentView}
                        onChange={(e) => setCurrentView(e.target.value as ViewMode)}
                        className="view-select"
                    >
                        {viewOptions.map(option => (
                            <option key={option.value} value={option.value}>
                                {option.icon} {option.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="sidebar-content">
                {renderContent()}
            </div>
        </div>
    )
}

export default App 