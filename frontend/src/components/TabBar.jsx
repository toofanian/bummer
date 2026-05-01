export default function TabBar({ tabs, activeTab, onTabChange }) {
  return (
    <div className="flex border-b border-border flex-shrink-0" role="tablist">
      {tabs.map(tab => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={activeTab === tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`tab-underline flex-1 py-3 text-sm font-bold font-mono tracking-wider uppercase transition-all duration-200 bg-transparent border-none cursor-pointer ${
            activeTab === tab.id ? 'text-text' : 'text-text-dim'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
