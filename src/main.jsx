import { useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BookOpen, BrainCircuit, ChevronRight, CircleHelp, FileText, LoaderCircle, MessageSquarePlus, Paperclip, Plus, Send, Sparkles, Trash2, UploadCloud, X } from 'lucide-react'
import './styles.css'

const suggestions = ['What is the main objective of this research?', 'Which dataset did the authors use?', 'Explain the methodology in simple English.', 'What are the paper\'s limitations?']
const tools = [
  ['summary', 'Quick summary'], ['key-points', 'Key points'], ['methodology', 'Methodology'], ['datasets', 'Dataset finder'], ['limitations', 'Advantages & limitations'], ['conclusion', 'Conclusion'], ['keywords', 'Important keywords'], ['questions', 'Question generator'], ['simple', 'Simple explanation'], ['insights', 'Research insights']
]
const api = async (path, options = {}) => {
  const response = await fetch(path, options)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.')
  return data
}

function App() {
  const inputRef = useRef(null)
  const [document, setDocument] = useState(null)
  const [messages, setMessages] = useState([])
  const [prompt, setPrompt] = useState('')
  const [uploading, setUploading] = useState(false)
  const [answering, setAnswering] = useState(false)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [tooling, setTooling] = useState('')

  const size = useMemo(() => document && (document.size / 1024 / 1024).toFixed(2), [document])
  async function upload(file) {
    if (!file) return
    setError('')
    if (file.type !== 'application/pdf') return setError('Please upload a PDF research paper.')
    if (file.size > 30 * 1024 * 1024) return setError('The maximum file size is 30 MB.')
    setUploading(true)
    try {
      const body = new FormData(); body.append('file', file)
      const data = await api('/api/upload', { method: 'POST', body })
      setDocument(data.document)
      setMessages([{ role: 'assistant', content: `I’ve indexed **${data.document.name}**. Ask me anything about the paper — I’ll stay grounded in its contents and cite the relevant pages.`, citations: [] }])
    } catch (e) { setError(e.message) } finally { setUploading(false) }
  }
  async function ask(question = prompt) {
    const value = question.trim()
    if (!value || !document || answering) return
    setPrompt(''); setError(''); setAnswering(true)
    setMessages(old => [...old, { role: 'user', content: value }])
    try {
      const data = await api('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documentId: document.id, question: value, history: messages.slice(-6) }) })
      setMessages(old => [...old, { role: 'assistant', content: data.answer, citations: data.citations || [] }])
    } catch (e) { setError(e.message) } finally { setAnswering(false) }
  }
  async function runTool(key) {
    if (!document || tooling) return
    setTooling(key); setError('')
    try {
      const data = await api(`/api/tools/${document.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tool: key }) })
      setMessages(old => [...old, { role: 'assistant', content: data.answer, citations: data.citations || [] }])
    } catch (e) { setError(e.message) } finally { setTooling('') }
  }
  async function removeDocument() {
    if (document) await api(`/api/document/${document.id}`, { method: 'DELETE' }).catch(() => {})
    setDocument(null); setMessages([]); setError('')
  }

  return <div className="app-shell">
    <aside className="left-sidebar"><div className="brand"><div className="brand-mark"><BrainCircuit size={22}/></div><span>PaperMind</span></div><button className="new-chat" onClick={removeDocument}><MessageSquarePlus size={18}/> New chat</button><button className="side-upload" onClick={() => inputRef.current.click()}><Plus size={18}/> Upload research paper</button><nav><p>WORKSPACE</p><button><FileText size={17}/> Recent documents</button><button><BookOpen size={17}/> Chat history</button><p>SUPPORT</p><button><CircleHelp size={17}/> Help & support</button></nav><div className="sidebar-foot">Research better, not longer.</div></aside>
    <main className="workspace">
      {!document ? <section className="landing"><div className="eyebrow"><Sparkles size={15}/> AI-powered research</div><h1>Understand research<br/>papers <em>smarter.</em></h1><p>Upload a research paper and ask anything about it. Every answer stays grounded in your document.</p><div className={`dropzone ${dragging ? 'is-dragging' : ''}`} onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files[0]) }} onClick={() => inputRef.current.click()}><div className="upload-icon"><UploadCloud size={28}/></div><strong>{uploading ? 'Processing your paper…' : 'Drop your PDF here, or click to browse'}</strong><span>PDF up to 30 MB · Text extraction and page citations included</span>{uploading && <div className="progress"><i/></div>}</div><input ref={inputRef} type="file" accept="application/pdf" hidden onChange={e => upload(e.target.files[0])}/><div className="suggested"><span>Try asking</span>{suggestions.map(q => <button key={q} onClick={() => { inputRef.current?.click() }}>{q}<ChevronRight size={15}/></button>)}</div></section> : <section className="chat-area"><header className="chat-header"><div><span className="status-dot"/> Research session active</div><button onClick={removeDocument}><Trash2 size={16}/> Clear</button></header><div className="messages">{messages.map((message, index) => <article className={`message ${message.role}`} key={index}><div className="avatar">{message.role === 'assistant' ? <BrainCircuit size={18}/> : 'You'}</div><div className="bubble"><div className="message-copy">{message.content}</div>{message.citations?.length > 0 && <div className="citations">Sources: {message.citations.map(page => <button key={page} title={`Page ${page}`}>Page {page}</button>)}</div>}</div></article>)}{answering && <article className="message assistant"><div className="avatar"><BrainCircuit size={18}/></div><div className="bubble typing"><i/><i/><i/></div></article>}</div><div className="composer"><textarea value={prompt} onChange={e => setPrompt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask() } }} placeholder="Ask about this research paper…" rows="1"/><button className="attach" onClick={() => inputRef.current.click()} aria-label="Replace paper"><Paperclip size={19}/></button><button className="send" onClick={() => ask()} disabled={!prompt.trim() || answering} aria-label="Send"><Send size={18}/></button></div></section>}
      {error && <div className="error"><X size={16}/>{error}</div>}
    </main>
    <aside className="right-sidebar"><h2>{document ? 'Document intelligence' : 'How PaperMind works'}</h2>{document ? <><div className="document-card"><div className="file-icon"><FileText size={20}/></div><div><strong>{document.name}</strong><span>{size} MB · {document.pages} pages</span></div><button onClick={removeDocument}><X size={16}/></button></div><h3>Quick research tools</h3><div className="tool-grid">{tools.map(([key, label]) => <button key={key} disabled={!!tooling} onClick={() => runTool(key)}>{tooling === key ? <LoaderCircle className="spin" size={15}/> : <Sparkles size={15}/>} {label}</button>)}</div><h3>Important keywords</h3><div className="keywords">{document.keywords?.slice(0, 10).map(k => <span key={k}>{k}</span>) || <span>Processing…</span>}</div></> : <div className="how-it-works"><div><b>1</b><p>Upload a PDF</p><span>We extract text page by page.</span></div><div><b>2</b><p>Ask naturally</p><span>Questions are matched to relevant passages.</span></div><div><b>3</b><p>Verify sources</p><span>Every response includes real page citations.</span></div></div>}</aside>
  </div>
}
createRoot(document.getElementById('root')).render(<App />)

