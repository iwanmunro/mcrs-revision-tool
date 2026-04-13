import type { Collection } from '../types'

const BASE_URL = '/api'  // Proxied to FastAPI in dev; nginx in production

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

const TOKEN_KEY = 'mrcs_token'

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY)
}

function authHeaders(): HeadersInit {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/**
 * Central fetch wrapper. On a 401, clears the stored token and fires
 * 'auth:expired' so App.tsx can redirect to the login screen.
 */
async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init)
  if (res.status === 401) {
    clearToken()
    window.dispatchEvent(new CustomEvent('auth:expired'))
    throw new Error('Session expired. Please log in again.')
  }
  return res
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function login(password: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.detail || 'Incorrect password')
  }
  const data = await res.json()
  return data.access_token as string
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export async function askQuestion(
  question: string,
  collections: string[],
): Promise<string> {
  const res = await apiFetch(`${BASE_URL}/chat/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ question, collections }),
  })
  if (!res.ok) throw new Error('Failed to get answer')
  const data = await res.json()
  return data.answer as string
}

/**
 * Stream an answer via Server-Sent Events.
 * Calls onToken for each token and onDone when complete.
 */
export async function streamQuestion(
  question: string,
  collections: string[],
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
): Promise<void> {
  let res: Response
  try {
    res = await apiFetch(`${BASE_URL}/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ question, collections }),
    })
  } catch (err: unknown) {
    onError(err instanceof Error ? err.message : 'Failed to connect to stream')
    return
  }

  if (!res.ok || !res.body) {
    onError('Failed to connect to stream')
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        let token: string
        try { token = JSON.parse(line.slice(6)) } catch { continue }
        if (token === '[DONE]') {
          onDone()
          return
        }
        if (token.startsWith('[ERROR]')) {
          onError(token.slice(8))
          return
        }
        onToken(token)
      }
    }
  }
  onDone()
}

// ---------------------------------------------------------------------------
// Practice
// ---------------------------------------------------------------------------

export async function generatePracticeQuestion(
  topic: string,
  collections: string[],
): Promise<string> {
  const res = await apiFetch(`${BASE_URL}/practice/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ topic, collections }),
  })
  if (!res.ok) throw new Error('Failed to generate question')
  const data = await res.json()
  return data.question_text as string
}

/**
 * Stream a practice question via Server-Sent Events.
 * Calls onToken for each token, onDone when complete, onError on failure.
 */
export async function streamPracticeQuestion(
  topic: string,
  collections: string[],
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
): Promise<void> {
  let res: Response
  try {
    res = await apiFetch(`${BASE_URL}/practice/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ topic, collections }),
    })
  } catch (err: unknown) {
    onError(err instanceof Error ? err.message : 'Failed to connect to stream')
    return
  }

  if (!res.ok || !res.body) {
    onError('Failed to connect to stream')
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        let token: string
        try { token = JSON.parse(line.slice(6)) } catch { continue }
        if (token === '[DONE]') { onDone(); return }
        if (token.startsWith('[ERROR]')) { onError(token.slice(8)); return }
        onToken(token)
      }
    }
  }
  onDone()
}

export async function streamFollowUp(
  practiceQuestion: string,
  userQuestion: string,
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
): Promise<void> {
  let res: Response
  try {
    res = await apiFetch(`${BASE_URL}/chat/followup/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ practice_question: practiceQuestion, user_question: userQuestion }),
    })
  } catch (err: unknown) {
    onError(err instanceof Error ? err.message : 'Failed to connect')
    return
  }

  if (!res.ok || !res.body) { onError('Failed to connect'); return }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        let token: string
        try { token = JSON.parse(line.slice(6)) } catch { continue }
        if (token === '[DONE]') { onDone(); return }
        if (token.startsWith('[ERROR]')) { onError(token.slice(8)); return }
        onToken(token)
      }
    }
  }
  onDone()
}

// ---------------------------------------------------------------------------
// Knowledge base
// ---------------------------------------------------------------------------

export async function fetchCollections(): Promise<Collection[]> {
  const res = await apiFetch(`${BASE_URL}/knowledge-base/collections`, {
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error('Failed to fetch collections')
  return res.json()
}

export async function uploadDocument(
  file: File,
  collection: string,
  overwrite: boolean,
): Promise<{ filename: string; chunks_added: number; message: string }> {
  const form = new FormData()
  form.append('file', file)
  form.append('collection', collection)
  form.append('overwrite', String(overwrite))

  const res = await apiFetch(`${BASE_URL}/knowledge-base/upload`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.detail || 'Upload failed')
  }
  return res.json()
}

export async function deleteCollection(name: string): Promise<void> {
  const res = await apiFetch(`${BASE_URL}/knowledge-base/collections/${name}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error('Failed to delete collection')
}
