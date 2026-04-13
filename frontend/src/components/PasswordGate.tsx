import { useState, FormEvent } from 'react'
import { login, setToken } from '../services/api'
import { Lock, AlertCircle } from 'lucide-react'

interface Props {
  onSuccess: () => void
  expiredMessage?: string
}

export default function PasswordGate({ onSuccess, expiredMessage }: Props) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const token = await login(password)
      setToken(token)
      onSuccess()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to sign in')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 to-brand-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="bg-brand-100 rounded-full p-4 mb-4">
            <Lock className="text-brand-600 w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">MRCS Revision Assistant</h1>
          <p className="text-gray-500 text-sm mt-1 text-center">
            Powered by a local AI — enter your access password to continue
          </p>
        </div>

        {expiredMessage && (
          <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {expiredMessage}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Access Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900
                         focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              required
              autoFocus
            />
          </div>

          {error && (
            <p className="text-red-600 text-sm text-center bg-red-50 rounded-lg p-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300
                       text-white font-semibold rounded-lg px-4 py-2.5 transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
