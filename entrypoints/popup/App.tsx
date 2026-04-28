import { useState } from 'react'
import { i18n } from '#i18n'
import { ArrowRight, Settings, Sparkles } from 'lucide-react'

import './App.css'

function App() {
  const [activeItem, setActiveItem] = useState<string | null>(null)

  const handleSettingsClick = () => {
    // Open options page in a new tab
    chrome.tabs
      .create({
        url: chrome.runtime.getURL('options.html'),
      })
      .finally(() => {
        window.close()
      })
  }

  const menuItems = [
    {
      id: 'options',
      label: i18n.t('options.name'),
      description: i18n.t('options.tagline'),
      icon: Settings,
      onClick: handleSettingsClick,
    },
  ]

  return (
    <div className="popup-container">
      <header className="popup-header">
        <div className="popup-brand-icon">
          <Sparkles size={18} strokeWidth={2.2} />
        </div>
        <div>
          <h1>AnnHub</h1>
          <p>{i18n.t('extDescription')}</p>
        </div>
      </header>

      <nav className="popup-nav">
        {menuItems.map(item => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              className={`nav-item ${activeItem === item.id ? 'active' : ''}`}
              onClick={() => {
                setActiveItem(item.id)
                item.onClick()
              }}
              onMouseEnter={() => setActiveItem(item.id)}
              onMouseLeave={() => setActiveItem(null)}
            >
              <div className="nav-item-icon">
                <Icon size={18} strokeWidth={2.2} />
              </div>
              <div className="nav-item-content">
                <div className="nav-item-label">{item.label}</div>
                <div className="nav-item-description">{item.description}</div>
              </div>
              <ArrowRight className="nav-item-arrow" size={16} />
            </button>
          )
        })}
      </nav>

      <footer className="popup-footer">
        <p>{i18n.t('extName')}</p>
      </footer>
    </div>
  )
}

export default App
