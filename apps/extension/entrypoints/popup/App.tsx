import { useState } from 'react'
import { i18n } from '#i18n';

import './App.css'

function App() {
  const [activeItem, setActiveItem] = useState<string | null>(null)

  const handleSettingsClick = () => {
    // Open options page in a new tab
    chrome.tabs.create({
      url: chrome.runtime.getURL('options.html')
    }).finally(() => {
      window.close()
    })
  }

  const handleSidepanelClick = () => {
    chrome.tabs.create({
      url: chrome.runtime.getURL('sidepanel.html')
    }).finally(() => {
      window.close()
    })
  }

  const menuItems = [
    {
      id: 'options',
      label: i18n.t("options.name"),
      icon: '⚙️',
      onClick: handleSettingsClick
    },
    {
      id: 'chat',
      label: i18n.t("sidepanel.name"),
      icon: '💬',
      onClick: handleSidepanelClick
    }
  ]

  return (
    <div className="popup-container">
      <header className="popup-header">
        <h1>{i18n.t("extName")}</h1>
      </header>

      <nav className="popup-nav">
        {menuItems.map((item) => (
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
            <div className="nav-item-icon">{item.icon}</div>
            <div className="nav-item-content">
              <div className="nav-item-label">{item.label}</div>
            </div>
            <div className="nav-item-arrow">→</div>
          </button>
        ))}
      </nav>

      <footer className="popup-footer">
        <p>{i18n.t("extDescription")}</p>
      </footer>
    </div>
  )
}

export default App
