import { BookOpen, Highlighter, Settings } from 'lucide-react'

type OptionTarget = {
  label: string
  description: string
  path: string
  icon: typeof Highlighter
}

const OPTION_TARGETS: OptionTarget[] = [
  {
    label: 'Word Books',
    description: 'Browse Eudic word books',
    path: '/words',
    icon: BookOpen,
  },
  {
    label: 'Highlights',
    description: 'Manage saved highlights',
    path: '/highlights',
    icon: Highlighter,
  },
  {
    label: 'Settings',
    description: 'Configure AnnHub',
    path: '/settings',
    icon: Settings,
  },
]

function openOptions(path: string) {
  const url = `${chrome.runtime.getURL('options.html')}#${path}`
  chrome.tabs.create({ url })
  window.close()
}

export default function App() {
  return (
    <main className="ann-popup">
      <header className="ann-popup__header">
        <div>
          <h1>AnnHub</h1>
          <p>Options</p>
        </div>
      </header>

      <nav className="ann-popup__menu" aria-label="AnnHub options">
        {OPTION_TARGETS.map(item => (
          <button key={item.path} type="button" className="ann-popup__item" onClick={() => openOptions(item.path)}>
            <span className="ann-popup__icon" aria-hidden="true">
              <item.icon size={18} strokeWidth={2.1} />
            </span>
            <span className="ann-popup__text">
              <span className="ann-popup__label">{item.label}</span>
              <span className="ann-popup__description">{item.description}</span>
            </span>
          </button>
        ))}
      </nav>
    </main>
  )
}
