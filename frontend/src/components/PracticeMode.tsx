import { useState, useEffect, useRef, FormEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { RefreshCw, ChevronDown, ChevronUp, Loader2, BookOpen, Send, MessageSquare, Check, X } from 'lucide-react'
import { streamPracticeQuestion, generatePracticeQuestion, streamFollowUp, fetchCollections, fetchBankQuestions } from '../services/api'
import type { Collection } from '../types'

let fuCounter = 0
const genFuId = () => `fu-${++fuCounter}`

interface FollowUpMsg {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const TOPIC_GROUPS: { label: string; paper: 1 | 2; topics: string[] }[] = [
  {
    label: 'Paper 1 – Anatomy (Regional)',
    paper: 1,
    topics: [
      'Thoracic anatomy',
      'Abdominal anatomy and retroperitoneum',
      'Pelvic anatomy',
      'Perineal anatomy and anal canal',
      'Upper limb anatomy and brachial plexus',
      'Lower limb anatomy and femoral triangle',
      'Spinal anatomy and vertebral levels',
      'Head and neck anatomy',
      'Brain and cerebral circulation',
      'Autonomic nervous system',
    ],
  },
  {
    label: 'Paper 1 – Anatomy (Embryology & Imaging)',
    paper: 1,
    topics: [
      'Surgical embryology – thorax',
      'Surgical embryology – head and neck (branchial arches)',
      'Surgical embryology – gut and perineum',
      'Surface and imaging anatomy',
      'CT cross-sectional anatomy',
    ],
  },
  {
    label: 'Paper 1 – Physiology (General)',
    paper: 1,
    topics: [
      'Fluid compartments and Starling forces',
      'Acid-base balance and blood gas interpretation',
      'Coagulation cascade and haemostasis',
      'Metabolic response to surgery',
      'Electrolyte disturbances',
      'Oxygen delivery and consumption',
      'Thermoregulation',
    ],
  },
  {
    label: 'Paper 1 – Physiology (Organ Systems)',
    paper: 1,
    topics: [
      'Cardiovascular physiology and cardiac cycle',
      'Respiratory physiology and lung volumes',
      'Gastrointestinal physiology and secretion',
      'Renal physiology and RAAS',
      'Endocrine physiology and stress response',
      'Neurological physiology and pain pathways',
    ],
  },
  {
    label: 'Paper 1 – Pathology',
    paper: 1,
    topics: [
      'Acute and chronic inflammation',
      'Wound healing and repair',
      'Thrombosis and embolism',
      'Surgical immunology and hypersensitivity',
      'Surgical haematology and coagulopathies',
      'Principles of neoplasia and oncology',
      'Breast pathology',
      'Skin cancer – BCC, SCC, melanoma',
      'Colorectal cancer and polyps',
      'Thyroid and endocrine gland pathology',
      'Musculoskeletal and bone tumours',
      'Lymphoreticular pathology',
    ],
  },
  {
    label: 'Paper 1 – Pharmacology, Microbiology & Imaging',
    paper: 1,
    topics: [
      'Analgesics and opioid pharmacology',
      'Antibiotic classes and surgical prophylaxis',
      'Anaesthetic agents and NMBAs',
      'Local anaesthetics – mechanism and toxicity',
      'Anticoagulants and antiplatelet agents',
      'Common surgical pathogens and SSI',
      'Sepsis, necrotising fasciitis and C. difficile',
      'Imaging interpretation – CXR and AXR',
      'CT imaging phases and contrast',
      'Evidence-based surgery and statistics',
    ],
  },
  {
    label: 'Paper 2 – Common Surgical Conditions',
    paper: 2,
    topics: [
      'Colorectal cancer and IBD',
      'Appendicitis and biliary disease',
      'Pancreatitis',
      'Hernia types and management',
      'Breast disease and breast cancer management',
      'Peripheral arterial disease and acute limb ischaemia',
      'Aortic aneurysm',
      'Carotid artery disease and varicose veins',
      'DVT and pulmonary embolism',
      'Renal calculi and urological disease',
      'Prostate and bladder cancer',
      'Thyroid disease and nodule assessment',
      'Parathyroid and adrenal disease',
      'MEN syndromes and carcinoid',
      'Hip fractures and orthopaedic conditions',
      'Compartment syndrome and osteomyelitis',
      'Septic arthritis and bone tumours',
      'Head and neck cancer',
      'Neurosurgery – head injury and brain tumours',
    ],
  },
  {
    label: 'Paper 2 – Perioperative Management',
    paper: 2,
    topics: [
      'Preoperative assessment and ASA classification',
      'DVT/PE prophylaxis and VTE risk',
      'Intraoperative care and diathermy',
      'Enhanced recovery after surgery (ERAS)',
      'Postoperative complications',
      'Anastomotic leak and surgical site infection',
      'Nutritional management and refeeding syndrome',
      'Blood products and massive transfusion',
      'Perioperative management of diabetes',
      'Perioperative management of anticoagulation',
      'Metabolic and electrolyte disorders perioperatively',
    ],
  },
  {
    label: 'Paper 2 – Trauma',
    paper: 2,
    topics: [
      'ATLS primary and secondary survey',
      'Haemorrhagic shock classification',
      'Burns management (Rule of Nines, Parkland formula)',
      'Fractures – classification and open fractures (Gustilo)',
      'Hip and lower limb fractures',
      'Upper limb fractures (scaphoid, distal radius, supracondylar)',
      'Head trauma and intracranial haemorrhage',
      'Chest trauma – tension pneumothorax and haemothorax',
      'Abdominal trauma and FAST scan',
      'Pelvic trauma',
      'Soft tissue and vascular trauma',
    ],
  },
  {
    label: 'Paper 2 – Paediatric Surgery & Medico-legal',
    paper: 2,
    topics: [
      'Neonatal surgical emergencies',
      'Paediatric trauma and non-accidental injury',
      'Pyloric stenosis',
      'Paediatric hernias and undescended testis',
      'Consent and the Montgomery ruling',
      'Mental Capacity Act and best interests',
      'Confidentiality and Caldicott principles',
      'Clinical negligence and duty of candour',
    ],
  },
]

// Flat topic lists per paper for random paper-level selection
const PAPER_TOPICS: Record<'__paper1__' | '__paper2__', string[]> = {
  __paper1__: TOPIC_GROUPS.filter(g => g.paper === 1).flatMap(g => g.topics),
  __paper2__: TOPIC_GROUPS.filter(g => g.paper === 2).flatMap(g => g.topics),
}

function resolveTopic(t: string, custom: string): string {
  if (custom.trim()) return custom.trim()
  if (t === '__paper1__' || t === '__paper2__') {
    const pool = PAPER_TOPICS[t]
    return pool[Math.floor(Math.random() * pool.length)]
  }
  return t || 'any topic covered in the knowledge base'
}

export default function PracticeMode() {
  const [question, setQuestion]             = useState<string | null>(null)
  const [streamingText, setStreamingText]   = useState('')
  const [showAnswer, setShowAnswer]         = useState(false)
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [loading, setLoading]               = useState(false)
  const [error, setError]                   = useState('')
  const [collections, setCollections]       = useState<Collection[]>([])
  const [selectedCollections, setSelectedCollections] = useState<string[]>([])
  const [topic, setTopic]                   = useState('')
  const [customTopic, setCustomTopic]       = useState('')
  const [showControls, setShowControls]     = useState(true)
  const [questionMode, setQuestionMode]     = useState<'generated' | 'bank'>('generated')
  const [followUpMessages, setFollowUpMessages] = useState<FollowUpMsg[]>([])
  const [followUpInput, setFollowUpInput]   = useState('')
  const [followUpLoading, setFollowUpLoading] = useState(false)
  // Queue state
  const [queueCount, setQueueCount]         = useState(5)
  const [preloadedQueue, setPreloadedQueue] = useState<string[]>([])
  const [preloadingCount, setPreloadingCount] = useState(0)
  const [questionIndex, setQuestionIndex]   = useState(1)
  const [setTotal, setSetTotal]             = useState(1)
  const questionRef    = useRef<HTMLDivElement>(null)
  const followUpBottom = useRef<HTMLDivElement>(null)
  const fullStreamRef  = useRef('')   // accumulates every token; not bounded by the cut point
  const wantingNext    = useRef(false) // set true when user clicks Next but queue is empty

  useEffect(() => {
    fetchCollections()
      .then((cols) => {
        setCollections(cols)
        setSelectedCollections(cols.map(c => c.name))
      })
      .catch(() => setCollections([]))
  }, [])

  useEffect(() => {
    followUpBottom.current?.scrollIntoView({ behavior: 'smooth' })
  }, [followUpMessages])

  // Auto-advance when user clicked Next before the next question was ready
  useEffect(() => {
    if (wantingNext.current && preloadedQueue.length > 0) {
      wantingNext.current = false
      setLoading(false)
      advanceToNextQueued()
    }
  }, [preloadedQueue]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleCollection(name: string) {
    setSelectedCollections(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    )
  }

  const activeCols = selectedCollections.length > 0
    ? selectedCollections
    : collections.map(c => c.name)

  function advanceToNextQueued() {
    setPreloadedQueue(prev => {
      const [next, ...rest] = prev
      setQuestion(next)
      setShowAnswer(false)
      setSelectedAnswer(null)
      setFollowUpMessages([])
      setQuestionIndex(i => i + 1)
      setTimeout(() => questionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
      return rest
    })
  }

  function handleNext() {
    if (preloadedQueue.length > 0) {
      advanceToNextQueued()
    } else if (preloadingCount > 0) {
      // Queue not ready yet — wait for the useEffect to fire
      wantingNext.current = true
      setLoading(true)
    }
  }

  function resetQueueState() {
    setPreloadedQueue([])
    setPreloadingCount(0)
    setQuestionIndex(1)
    setSetTotal(1)  // updated to actual count once questions are confirmed available
  }

  async function handleGenerate() {
    const effectiveTopic = resolveTopic(topic, customTopic)
    setLoading(true)
    setError('')
    setQuestion(null)
    setStreamingText('')
    setShowAnswer(false)
    setSelectedAnswer(null)
    setFollowUpMessages([])
    setShowControls(false)
    fullStreamRef.current = ''
    resetQueueState()

    await streamPracticeQuestion(
      effectiveTopic,
      activeCols,
      (token) => {
        fullStreamRef.current += token
        // Stop updating the live preview once the answer section begins
        const cutRe = /^[*\s]*Correct\s+Answer\b/im
        if (!cutRe.test(fullStreamRef.current)) {
          setStreamingText(prev => prev + token)
        }
      },
      () => {
        const final = fullStreamRef.current.trim()
        if (!final) {
          setError('The model returned an empty response. Try again.')
        } else {
          setQuestion(final)
          setStreamingText('')
          setTimeout(() => questionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
          // Pre-generate remaining questions serially in the background.
          // Serial is faster than parallel on CPU: each request gets all threads
          // instead of sharing them, so Q2 arrives ~4x sooner than with parallel.
          const remaining = queueCount - 1
          if (remaining > 0) {
            setPreloadingCount(remaining)
            setSetTotal(1)
            ;(async () => {
              for (let i = 0; i < remaining; i++) {
                let q: string | null = null
                // retry once — a transient Ollama queue error shouldn't end the loop
                for (let attempt = 0; attempt < 2; attempt++) {
                  try {
                    q = await generatePracticeQuestion(effectiveTopic, activeCols)
                    break
                  } catch { /* retry or give up */ }
                }
                if (q) {
                  setPreloadedQueue(prev => [...prev, q!])
                  setSetTotal(prev => prev + 1)
                }
                setPreloadingCount(prev => Math.max(0, prev - 1))
              }
            })()
          } else {
            setSetTotal(1)
          }
        }
        setLoading(false)
      },
      (err) => {
        setError(err)
        setStreamingText('')
        setLoading(false)
      },
    )
  }

  async function handleBankQuestion() {
    setLoading(true)
    setError('')
    setQuestion(null)
    setStreamingText('')
    setShowAnswer(false)
    setSelectedAnswer(null)
    setFollowUpMessages([])
    setShowControls(false)
    fullStreamRef.current = ''
    resetQueueState()
    try {
      const texts = await fetchBankQuestions(queueCount)
      setQuestion(texts[0])
      setPreloadedQueue(texts.slice(1))
      setSetTotal(texts.length)  // use actual count returned, not optimistic queueCount
      setTimeout(() => questionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    } catch (e: unknown) {
      setError((e instanceof Error ? e.message : null) || 'Failed to load question')
    } finally {
      setLoading(false)
    }
  }

  async function handleFollowUp(e: FormEvent) {
    e.preventDefault()
    const userInput = followUpInput.trim()
    if (!userInput || followUpLoading || !question) return

    const userMsg: FollowUpMsg = { id: genFuId(), role: 'user', content: userInput }
    const assistantId = genFuId()
    const assistantMsg: FollowUpMsg = { id: assistantId, role: 'assistant', content: '' }

    setFollowUpMessages(prev => [...prev, userMsg, assistantMsg])
    setFollowUpInput('')
    setFollowUpLoading(true)

    await streamFollowUp(
      question,
      userInput,
      (token) => setFollowUpMessages(prev =>
        prev.map(m => m.id === assistantId ? { ...m, content: m.content + token } : m)
      ),
      () => setFollowUpLoading(false),
      (err) => {
        setFollowUpMessages(prev =>
          prev.map(m => m.id === assistantId ? { ...m, content: `⚠️ ${err}` } : m)
        )
        setFollowUpLoading(false)
      },
    )
  }

  function parseOptions(text: string): { stem: string; options: { letter: string; text: string }[] } {
    const optionRe = /^([A-E])\. +(.+)/gm
    const options: { letter: string; text: string }[] = []
    let firstIndex = Infinity
    let m
    while ((m = optionRe.exec(text)) !== null) {
      if (m.index < firstIndex) firstIndex = m.index
      options.push({ letter: m[1], text: m[2].trim() })
    }
    const stem = firstIndex < Infinity ? text.slice(0, firstIndex).trim() : text.trim()
    return { stem, options }
  }

  function parseCorrectAnswer(answerPart: string): string | null {
    // Handles formats like: "**Correct Answer:** B", "Correct Answer: B", "Correct Answer: **B**"
    const m = /Correct\s+Answer[^ABCDE\n]*([ABCDE])\b/i.exec(answerPart)
    return m ? m[1].toUpperCase() : null
  }

  function splitQuestion(raw: string): { questionPart: string; answerPart: string } {
    const normalised = raw.replace(/\n?^([A-E]\.)\s/gm, '\n\n$1 ')
    // Match various formats the model may use, anchored to line-start to avoid false matches in option text
    const splitRe = /^[*\s]*Correct\s+Answer\b|^[*\s]*Explanation\b\s*:/im
    const m = splitRe.exec(normalised)
    if (!m) return { questionPart: normalised, answerPart: '' }
    return { questionPart: normalised.slice(0, m.index), answerPart: normalised.slice(m.index) }
  }

  const { questionPart, answerPart } = question
    ? splitQuestion(question)
    : { questionPart: '', answerPart: '' }

  const parsed       = question ? parseOptions(questionPart || question) : null
  const correctAnswer = question ? parseCorrectAnswer(answerPart) : null

  function switchMode(mode: 'generated' | 'bank') {
    setQuestionMode(mode)
    setShowControls(true)
    setQuestion(null)
    setStreamingText('')
    setError('')
    setFollowUpMessages([])
    setShowAnswer(false)
    setSelectedAnswer(null)
    setPreloadedQueue([])
    setPreloadingCount(0)
    setQuestionIndex(1)
    setSetTotal(1)
  }

  return (
    <div className="space-y-5">

      {/* ── Mode toggle ── */}
      <div className="flex gap-2">
        {(['generated', 'bank'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => switchMode(mode)}
            className={`text-sm rounded-lg px-4 py-2 border font-medium transition-colors ${
              questionMode === mode
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-white text-gray-600 border-gray-300 hover:border-brand-400'
            }`}
          >
            {mode === 'generated' ? 'AI Generated' : 'Question Bank'}
          </button>
        ))}
      </div>

      {/* ── Controls ── */}
      {showControls ? (questionMode === 'bank' ? (
        /* Bank mode controls */
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-brand-600" />
            Practice from Question Bank
          </h2>
          <p className="text-sm text-gray-500">
            Draw a random SBA question from the parsed question bank.
          </p>

          {/* Questions per set */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700">Questions per set</label>
            <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
              <button type="button" onClick={() => setQueueCount(v => Math.max(1, v - 1))}
                className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 transition-colors text-lg leading-none"
              >−</button>
              <span className="px-3 py-1.5 text-sm font-semibold text-gray-900 min-w-[2rem] text-center">{queueCount}</span>
              <button type="button" onClick={() => setQueueCount(v => Math.min(10, v + 1))}
                className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 transition-colors text-lg leading-none"
              >+</button>
            </div>
            <span className="text-xs text-gray-400">Questions are drawn instantly</span>
          </div>
          <button
            onClick={handleBankQuestion}
            disabled={loading}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300
                       text-white font-medium rounded-lg px-5 py-2.5 transition-colors text-sm"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {loading ? 'Loading…' : 'Draw Question'}
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-brand-600" />
            Generate a Practice Question
          </h2>

          {/* Questions per set */}
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700">Questions per set</label>
              <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
                <button type="button" onClick={() => setQueueCount(v => Math.max(1, v - 1))}
                  className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 transition-colors text-lg leading-none"
                >−</button>
                <span className="px-3 py-1.5 text-sm font-semibold text-gray-900 min-w-[2rem] text-center">{queueCount}</span>
                <button type="button" onClick={() => setQueueCount(v => Math.min(10, v + 1))}
                  className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 transition-colors text-lg leading-none"
                >+</button>
              </div>
            </div>
            <p className="text-xs text-gray-400">Rest generate silently in background</p>
          </div>

          {/* Collection toggle pills */}
          {collections.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Knowledge bases {collections.length > 1 && <span className="font-normal text-gray-400">(select one or more)</span>}
              </label>
              <div className="flex flex-wrap gap-2">
                {collections.map((c) => {
                  const checked = selectedCollections.includes(c.name)
                  return (
                    <button
                      key={c.name}
                      type="button"
                      onClick={() => toggleCollection(c.name)}
                      className={`text-sm rounded-lg px-3 py-1.5 border transition-colors ${
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
              {selectedCollections.length === 0 && (
                <p className="text-xs text-gray-400 mt-1">No selection — all collections will be used</p>
              )}
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Topic (optional)
              </label>
              <select
                value={topic}
                onChange={(e) => { setTopic(e.target.value); setCustomTopic('') }}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2
                           focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">Random topic</option>
                <option value="__paper1__">— Paper 1 (any topic) —</option>
                <option value="__paper2__">— Paper 2 (any topic) —</option>
                {TOPIC_GROUPS.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.topics.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Or type a specific topic
              </label>
              <input
                type="text"
                value={customTopic}
                onChange={(e) => { setCustomTopic(e.target.value); setTopic('') }}
                placeholder="e.g. Brachial plexus injuries"
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2
                           focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={loading || collections.length === 0}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300
                       text-white font-medium rounded-lg px-5 py-2.5 transition-colors text-sm"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {loading ? 'Generating…' : 'Generate Question'}
          </button>

          {collections.length === 0 && (
            <p className="text-sm text-amber-600">
              Upload study materials in the <strong>Knowledge Base</strong> tab first.
            </p>
          )}
        </div>
      )) : (
        /* Compact bar */
        <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3">
          <button
            onClick={questionMode === 'bank' ? handleBankQuestion : handleGenerate}
            disabled={loading}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300
                       text-white font-medium rounded-lg px-4 py-2 transition-colors text-sm"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {loading ? (questionMode === 'bank' ? 'Loading…' : 'Generating…') : 'New Set'}
          </button>
          {(preloadedQueue.length > 0 || preloadingCount > 0) && (
            <button
              onClick={handleNext}
              disabled={loading}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300
                         text-white font-medium rounded-lg px-4 py-2 transition-colors text-sm"
            >
              {preloadedQueue.length > 0
                ? `Next → (${preloadedQueue.length} ready)`
                : `Next → (generating…)`}
            </button>
          )}
          {questionMode === 'generated' && (
            <button
              onClick={() => setShowControls(true)}
              className="text-sm text-brand-600 hover:underline"
            >
              Change topic / collection
            </button>
          )}
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
          {error}
        </div>
      )}

      {/* ── Streaming live preview (tokens arriving) ── */}
      {loading && streamingText && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 prose prose-sm max-w-none text-gray-900">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingText}</ReactMarkdown>
          <span className="inline-block w-1.5 h-4 bg-brand-500 animate-pulse ml-0.5 align-middle" />
        </div>
      )}

      {/* ── Waiting for first token ── */}
      {loading && !streamingText && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 flex items-center justify-center gap-3 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Generating question…</span>
        </div>
      )}

      {/* ── Final question card ── */}
      {question && !loading && (
        <>
          {/* Progress badge */}
          {setTotal > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-500">
                Question {questionIndex} of {setTotal}
              </span>
              {preloadingCount > 0 && (
                <span className="flex items-center gap-1.5 text-xs text-gray-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Generating {preloadingCount} more…
                </span>
              )}
              {preloadedQueue.length > 0 && preloadingCount === 0 && (
                <span className="text-xs text-emerald-600 font-medium">
                  {preloadedQueue.length} ready
                </span>
              )}
            </div>
          )}

          <div ref={questionRef} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">

          {/* Question stem */}
          <div className="p-5 prose prose-sm max-w-none text-gray-900">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {parsed?.stem || questionPart || question}
            </ReactMarkdown>
          </div>

          {/* Selectable answer options */}
          {parsed && parsed.options.length > 0 && (
            <div className="px-5 pb-5 space-y-2">
              {parsed.options.map(({ letter, text }) => {
                const isSelected = selectedAnswer === letter
                const isCorrect  = showAnswer && correctAnswer === letter
                const isWrong    = showAnswer && isSelected && letter !== correctAnswer
                const isDimmed   = showAnswer && !isCorrect && !isSelected
                return (
                  <button
                    key={letter}
                    type="button"
                    onClick={() => !showAnswer && setSelectedAnswer(letter === selectedAnswer ? null : letter)}
                    disabled={showAnswer}
                    className={`w-full text-left flex items-center gap-3 rounded-lg px-4 py-3 border text-sm transition-colors
                      ${
                        isCorrect ? 'border-green-500 bg-green-50 text-green-800' :
                        isWrong   ? 'border-red-400 bg-red-50 text-red-800' :
                        isDimmed  ? 'border-gray-100 text-gray-300' :
                        isSelected ? 'border-brand-500 bg-brand-50 text-brand-800' :
                        'border-gray-200 hover:border-brand-400 hover:bg-gray-50 text-gray-800 cursor-pointer'
                      }`}
                  >
                    <span className={`font-semibold w-6 shrink-0 ${
                      isCorrect ? 'text-green-600' : isWrong ? 'text-red-500' : isDimmed ? 'text-gray-300' : 'text-gray-500'
                    }`}>
                      {letter}.
                    </span>
                    <span className="flex-1">{text}</span>
                    {isCorrect && <Check className="w-4 h-4 text-green-600 shrink-0" />}
                    {isWrong   && <X     className="w-4 h-4 text-red-500  shrink-0" />}
                  </button>
                )
              })}
            </div>
          )}

          {/* Reveal answer */}
          <div className="border-t border-gray-100">
            <button
              onClick={() => setShowAnswer(v => !v)}
              className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium
                         text-brand-700 hover:bg-brand-50 transition-colors"
            >
              {showAnswer ? 'Hide answer & explanation' : 'Reveal answer & explanation'}
              {showAnswer ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>

          {showAnswer && (
            <div className="px-5 pb-5 pt-3 border-t border-brand-100 bg-brand-50 prose prose-sm max-w-none text-gray-900">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {answerPart || '*Answer is included in the question above.*'}
              </ReactMarkdown>
            </div>
          )}

          {/* ── Follow-up Q&A (always shown once question is loaded) ── */}
          {(
            <div className="border-t border-gray-200">
              <div className="flex items-center gap-2 px-5 py-3 bg-gray-50 border-b border-gray-100">
                <MessageSquare className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-700">Ask a follow-up question</span>
              </div>

              {followUpMessages.length > 0 && (
                <div className="px-5 py-3 space-y-3 max-h-96 overflow-y-auto">
                  {followUpMessages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                        msg.role === 'user'
                          ? 'bg-brand-600 text-white'
                          : 'bg-white border border-gray-200 text-gray-800'
                      }`}>
                        {msg.role === 'assistant' ? (
                          <div className="prose prose-sm max-w-none">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {msg.content || '…'}
                            </ReactMarkdown>
                          </div>
                        ) : msg.content}
                      </div>
                    </div>
                  ))}
                  <div ref={followUpBottom} />
                </div>
              )}

              <form
                onSubmit={handleFollowUp}
                className="flex gap-2 items-center px-5 py-3 border-t border-gray-100"
              >
                <input
                  type="text"
                  value={followUpInput}
                  onChange={(e) => setFollowUpInput(e.target.value)}
                  placeholder="e.g. Why is option B wrong? Explain the anatomy in more detail."
                  disabled={followUpLoading}
                  className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2
                             focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={followUpLoading || !followUpInput.trim()}
                  className="bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300
                             text-white rounded-lg p-2 transition-colors flex-shrink-0"
                >
                  {followUpLoading
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Send className="w-4 h-4" />
                  }
                </button>
              </form>
            </div>
          )}
        </div>

          {/* Next button — shown below the card when more questions are queued */}
          {(preloadedQueue.length > 0 || preloadingCount > 0) && (
            <button
              onClick={handleNext}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700
                         text-white font-medium rounded-xl px-5 py-3 transition-colors text-sm"
            >
              {preloadedQueue.length > 0
                ? <>Next question → <span className="opacity-75 text-xs">({preloadedQueue.length} ready)</span></>
                : <><Loader2 className="w-4 h-4 animate-spin" /> Waiting for next question…</>}
            </button>
          )}
        </>
      )}
    </div>
  )
}

