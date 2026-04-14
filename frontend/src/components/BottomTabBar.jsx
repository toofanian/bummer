// BottomTabBar.jsx

const TABS = [
  { id: 'home', label: 'Home', icon: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
      <path d="M10 2L2 9h3v7h4v-4h2v4h4V9h3L10 2z" />
    </svg>
  )},
  { id: 'library', label: 'Library', icon: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
      <path d="M4 3h2v14H4V3zm4 0h2v14H8V3zm4 2h2v12h-2V5zm4-2h2v14h-2V3z" />
    </svg>
  )},
  { id: 'collections', label: 'Collections', icon: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
      <path d="M3 3h6v6H3V3zm8 0h6v6h-6V3zm-8 8h6v6H3v-6zm8 0h6v6h-6v-6z" />
    </svg>
  )},
  { id: 'digest', label: 'Digest', icon: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
      <path d="M4 4h12v2H4V4zm0 4h12v2H4V8zm0 4h8v2H4v-2z" />
    </svg>
  )},
]

export default function BottomTabBar({ activeTab, onTabChange, syncing }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[200] flex items-stretch justify-around bg-surface border-t border-border pb-[env(safe-area-inset-bottom,0px)]"
         style={{ height: `calc(50px + env(safe-area-inset-bottom, 0px))` }}
    >
      {TABS.map(tab => (
        <button
          key={tab.id}
          aria-label={tab.label}
          onClick={() => onTabChange(tab.id)}
          className={`flex flex-col items-center justify-center gap-0.5 flex-1 bg-transparent border-none p-0 rounded-none transition-colors duration-75 active:scale-90 active:opacity-70 ${
            activeTab === tab.id ? 'text-text' : 'text-text-dim'
          }`}
        >
          {tab.icon}
          <span className={`text-xs${tab.id === 'library' && syncing ? ' animate-pulse' : ''}`}>{tab.label}</span>
        </button>
      ))}
    </nav>
  )
}
