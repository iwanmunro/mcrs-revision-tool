export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export interface Collection {
  name: string
  document_count: number
}

export interface PracticeQuestion {
  raw: string
  topic: string
  collection: string
}

export type Tab = 'chat' | 'practice' | 'knowledge-base'
