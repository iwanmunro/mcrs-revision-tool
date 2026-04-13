import { useState, useEffect } from 'react'
import PasswordGate from './components/PasswordGate'
import Layout from './components/Layout'
import ChatInterface from './components/ChatInterface'
import PracticeMode from './components/PracticeMode'
import KnowledgeBase from './components/KnowledgeBase'
import { getToken, clearToken } from './services/api'
import type { Tab } from './types'

export default function App() {
  const [authenticated, setAuthenticated] = useState(false)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('chat')

  // Restore auth state from session on page reload
  useEffect(() => {
    if (getToken()) setAuthenticated(true)
  }, [])

  // Listen for 401 responses from any API call
  useEffect(() => {
    function handleExpired() {
      setAuthenticated(false)
      setSessionExpired(true)
    }
    window.addEventListener('auth:expired', handleExpired)
    return () => window.removeEventListener('auth:expired', handleExpired)
  }, [])

  if (!authenticated) {
    return (
      <PasswordGate
        onSuccess={() => { setAuthenticated(true); setSessionExpired(false) }}
        expiredMessage={sessionExpired
          ? 'Your session has expired. Please log in again.'
          : undefined}
      />
    )
  }

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === 'chat' && <ChatInterface />}
      {activeTab === 'practice' && <PracticeMode />}
      {activeTab === 'knowledge-base' && <KnowledgeBase />}
    </Layout>
  )
}
