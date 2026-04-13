import { useState, useEffect, useRef, FormEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Send, Loader2, AlertCircle } from 'lucide-react'
import { streamQuestion, fetchCollections } from '../services/api'
import type { Message, Collection } from '../types'

let messageCounter = 0
const genId = () => `msg-${++messageCounter}-${Date.now()}`

export default function ChatInterface() {
  const [messages, setMessages]       = useState<Message[]>([])
  const [input, setInput]             = useState('')
  const [loading, setLoading]         = useState(false)
  const [collections, setCollections] = useState<Collection[]>([])
  const [selectedCollections, setSelectedCollections] = useState<string[]>([])
  const bottomRef                     = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchCollections()
      .then((cols) => {
        setCollections(cols)
        setSelectedCollections(cols.map(c => c.name))
      })
      .catch(() => setCollections([]))
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const question = input.trim()
    if (!question || loading) return

    const userMsg: Message = {
      id: genId(),
      role: 'user',
      content: question,
      timestamp: new Date(),
    }
    const assistantId = genId()
    const assistantMsg: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setInput('')
    setLoading(true)

      const activeCols = selectedCollections.length > 0 ? selectedCollections : collections.map(c => c.name)
    await streamQuestion(
      question,
      activeCols,
      (token) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: m.content + token } : m,
          ),
        )
      },
      () => setLoading(false),
      (err) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: `⚠️ Error: ${err}` }
              : m,
          ),
        )
        setLoading(false)
      },
    )
  }

  const placeholder =
    collections.length === 0
      ? 'Upload some documents in the Knowledge Base tab first…'
      : 'Ask a question about anatomy, physiology, surgical principles…'

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)]">
      {/* Collection selector */}
      {collections.length > 1 && (
        <div className="mb-3 flex items-center flex-wrap gap-2">
          <span className="text-sm font-medium text-gray-600">Collections:</span>
          {collections.map((c) => {
            const checked = selectedCollections.includes(c.name)
            return (
              <button
                key={c.name}
                type="button"
                onClick={() => setSelectedCollections(prev =>
                  prev.includes(c.name) ? prev.filter(n => n !== c.name) : [...prev, c.name]
                )}
                className={`text-sm rounded-lg px-3 py-1 border transition-colors ${
                  checked
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-brand-400'
                }`}
              >
                {c.name}
                <span className={`ml-1.5 text-xs ${checked ? 'opacity-75' : 'text-gray-400'}`}>
                  {c.document_count}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Empty state */}
      {messages.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-400 gap-3">
          <div className="text-5xl">💬</div>
          <p className="text-lg font-medium text-gray-500">Ask anything about MRCS Part A</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
            {[
              'Explain the boundaries of the femoral triangle',
              'What is the mechanism of action of heparin?',
              'Describe the coagulation cascade',
              'What are the branches of the external carotid artery?',
            ].map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => setInput(suggestion)}
                className="text-sm bg-brand-50 hover:bg-brand-100 text-brand-700 rounded-lg px-3 py-2 text-left transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      {messages.length > 0 && (
        <div className="flex-1 overflow-y-auto space-y-4 pb-4 pr-1">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm
                  ${
                    msg.role === 'user'
                      ? 'bg-brand-600 text-white rounded-br-sm'
                      : 'bg-white text-gray-800 border border-gray-200 rounded-bl-sm'
                  }`}
              >
                {msg.role === 'assistant' ? (
                  <div className="prose prose-sm max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content || '…'}
                    </ReactMarkdown>
                  </div>
                ) : (
                  msg.content
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="mt-3 flex gap-2 items-end bg-white border border-gray-300 rounded-xl p-2 shadow-sm"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSubmit(e as unknown as FormEvent)
            }
          }}
          placeholder={placeholder}
          rows={1}
          disabled={loading || collections.length === 0}
          className="flex-1 resize-none bg-transparent text-gray-900 placeholder-gray-400 text-sm
                     focus:outline-none disabled:opacity-50 py-1 px-1 max-h-40"
        />
        <button
          type="submit"
          disabled={loading || !input.trim() || collections.length === 0}
          className="bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-white
                     rounded-lg p-2 transition-colors flex-shrink-0"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </button>
      </form>

      {collections.length === 0 && (
        <p className="flex items-center gap-1.5 text-xs text-amber-600 mt-2">
          <AlertCircle className="w-3.5 h-3.5" />
          No knowledge base found. Go to the <strong>Knowledge Base</strong> tab to upload study materials.
        </p>
      )}
    </div>
  )
}
