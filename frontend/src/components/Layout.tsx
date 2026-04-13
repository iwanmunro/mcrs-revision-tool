import type { ReactNode } from 'react'
import { MessageSquare, BookOpen, Database, LogOut } from 'lucide-react'
import { clearToken } from '../services/api'
import type { Tab } from '../types'

interface Props {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  children: ReactNode
}

const TABS: { id: Tab; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: 'chat',           label: 'Ask a Question',  Icon: MessageSquare },
  { id: 'practice',       label: 'Practice Quiz',   Icon: BookOpen },
  { id: 'knowledge-base', label: 'Knowledge Base',  Icon: Database },
]

export default function Layout({ activeTab, onTabChange, children }: Props) {
  function handleLogout() {
    clearToken()
    window.location.reload()
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top navigation */}
      <header className="bg-brand-900 text-white shadow-md">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold tracking-tight">MRCS Revision Assistant</h1>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-sm text-brand-100 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>

        {/* Tab bar */}
        <nav className="max-w-5xl mx-auto px-4 flex gap-1 pb-0">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors
                ${
                  activeTab === id
                    ? 'bg-gray-50 text-brand-700'
                    : 'text-brand-200 hover:text-white hover:bg-brand-800'
                }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </nav>
      </header>

      {/* Page content */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  )
}
