import { useState, useEffect, useRef } from 'react'
import { Upload, Trash2, RefreshCw, Database, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { fetchCollections, uploadDocument, deleteCollection } from '../services/api'
import type { Collection } from '../types'

type UploadStatus =
  | { type: 'idle' }
  | { type: 'uploading' }
  | { type: 'success'; message: string }
  | { type: 'error'; message: string }

export default function KnowledgeBase() {
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading]         = useState(true)
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>({ type: 'idle' })
  const [collection, setCollection]   = useState('default')
  const [newCollection, setNewCollection] = useState('')
  const [overwrite, setOverwrite]     = useState(false)
  const [deletingName, setDeletingName] = useState<string | null>(null)
  const fileInputRef                  = useRef<HTMLInputElement>(null)

  async function loadCollections() {
    setLoading(true)
    try {
      const cols = await fetchCollections()
      setCollections(cols)
    } catch {
      setCollections([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCollections()
  }, [])

  const effectiveCollection = newCollection.trim() || collection

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploadStatus({ type: 'uploading' })
    const messages: string[] = []
    let hadError = false

    for (const file of Array.from(files)) {
      try {
        const result = await uploadDocument(file, effectiveCollection, overwrite)
        messages.push(result.message)
      } catch (err: unknown) {
        hadError = true
        messages.push(
          `${file.name}: ${err instanceof Error ? err.message : 'Upload failed'}`,
        )
      }
    }

    setUploadStatus({
      type: hadError ? 'error' : 'success',
      message: messages.join('\n'),
    })
    await loadCollections()

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleDelete(name: string) {
    if (!confirm(`Delete the entire "${name}" collection? This cannot be undone.`)) return
    setDeletingName(name)
    try {
      await deleteCollection(name)
      await loadCollections()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to delete collection')
    } finally {
      setDeletingName(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Upload card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <Upload className="w-5 h-5 text-brand-600" />
          Upload Documents
        </h2>
        <p className="text-sm text-gray-500">
          Supports <strong>PDF</strong>, <strong>CSV</strong>, <strong>TXT</strong>, and{' '}
          <strong>Markdown</strong> files. Each file is split into chunks and added to the
          selected collection.
        </p>

        <div className="grid sm:grid-cols-2 gap-4">
          {/* Existing collection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Add to existing collection
            </label>
            <select
              value={collection}
              onChange={(e) => setCollection(e.target.value)}
              disabled={!!newCollection.trim()}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2
                         focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
            >
              <option value="default">default</option>
              {collections
                .filter((c) => c.name !== 'default')
                .map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>

          {/* New collection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Or create a new collection
            </label>
            <input
              type="text"
              value={newCollection}
              onChange={(e) => setNewCollection(e.target.value.replace(/\s+/g, '_'))}
              placeholder="e.g. mrcs_anatomy"
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2
                         focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-600 select-none cursor-pointer">
          <input
            type="checkbox"
            checked={overwrite}
            onChange={(e) => setOverwrite(e.target.checked)}
            className="rounded"
          />
          Replace existing chunks for re-uploaded files
        </label>

        {/* Drop zone */}
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            void handleUpload(e.dataTransfer.files)
          }}
          className="border-2 border-dashed border-gray-300 hover:border-brand-400 rounded-xl
                     p-8 text-center cursor-pointer transition-colors"
        >
          <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-500">
            Click or drag and drop files here
          </p>
          <p className="text-xs text-gray-400 mt-1">PDF, CSV, TXT, MD</p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.csv,.txt,.md,.markdown"
            onChange={(e) => void handleUpload(e.target.files)}
            className="hidden"
          />
        </div>

        {/* Upload status */}
        {uploadStatus.type === 'uploading' && (
          <div className="flex items-center gap-2 text-sm text-brand-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            Uploading and processing…
          </div>
        )}
        {uploadStatus.type === 'success' && (
          <div className="flex items-start gap-2 text-sm text-green-700 bg-green-50 rounded-lg p-3">
            <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <pre className="whitespace-pre-wrap font-sans">{uploadStatus.message}</pre>
          </div>
        )}
        {uploadStatus.type === 'error' && (
          <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 rounded-lg p-3">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <pre className="whitespace-pre-wrap font-sans">{uploadStatus.message}</pre>
          </div>
        )}
      </div>

      {/* Collections list */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Database className="w-5 h-5 text-brand-600" />
            Collections
          </h2>
          <button
            onClick={loadCollections}
            className="text-sm text-gray-500 hover:text-brand-600 flex items-center gap-1 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading…
          </div>
        ) : collections.length === 0 ? (
          <p className="text-sm text-gray-400">
            No collections yet. Upload some documents above to get started.
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {collections.map((col) => (
              <div key={col.name} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{col.name}</p>
                  <p className="text-xs text-gray-400">{col.document_count} chunks</p>
                </div>
                <button
                  onClick={() => handleDelete(col.name)}
                  disabled={deletingName === col.name}
                  className="text-red-400 hover:text-red-600 disabled:opacity-40 transition-colors p-1"
                  title="Delete collection"
                >
                  {deletingName === col.name ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
