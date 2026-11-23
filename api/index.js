import formidable from 'formidable'
import fs from 'node:fs/promises'
import pdf from 'pdf-parse'
import OpenAI from 'openai'
import { randomUUID } from 'node:crypto'

const documents = globalThis.__papermindDocuments || (globalThis.__papermindDocuments = new Map())
const MAX_BYTES = 30 * 1024 * 1024
const model = () => process.env.OPENAI_MODEL || 'gpt-4o-mini'

function chunksFrom(text, page) {
  const clean = text.replace(/\s+/g, ' ').trim()
  const chunks = []
  for (let start = 0; start < clean.length; start += 1200) chunks.push({ page, text: clean.slice(start, start + 1500) })
  return chunks
}
function terms(value) { return new Set((value.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) || []).filter(w => !stop.has(w))) }
const stop = new Set('the and for are with that this from was were have has into about their they which what when where your our you not but can will would should paper research study using used use'.split(' '))
function relevant(document, question) {
  const query = terms(question)
  return document.chunks.map(chunk => ({ ...chunk, score: [...query].reduce((n, word) => n + (chunk.text.toLowerCase().includes(word) ? 1 : 0), 0) })).sort((a,b) => b.score-a.score).slice(0, 6)
}
function keywords(chunks) {
  const counts = new Map()
  chunks.flatMap(c => [...terms(c.text)]).forEach(word => counts.set(word, (counts.get(word) || 0) + 1))
  return [...counts].sort((a,b) => b[1]-a[1]).slice(0,12).map(([word]) => word)
}
function citationPages(chunks) { return [...new Set(chunks.map(c => c.page))].slice(0, 5) }
function instruction(context) {
  return `You are PaperMind, an academic research assistant. Answer only from the provided paper excerpts. Never invent facts, data, methods, or page numbers. If the answer cannot be found, say exactly: "This information is not available in the uploaded research paper." Be clear and structured. Do not include a Sources heading; citations are rendered by the app.\n\nPAPER EXCERPTS:\n${context.map(c => `[Page ${c.page}] ${c.text}`).join('\n\n')}`
}
async function generate(document, question, history = []) {
  if (!process.env.OPENAI_API_KEY) throw Object.assign(new Error('AI is not configured. Add OPENAI_API_KEY in Vercel Project Settings → Environment Variables, then redeploy.'), { status: 503 })
  const source = relevant(document, question)
  if (!source.length || source[0].score === 0) return { answer: 'This information is not available in the uploaded research paper.', citations: [] }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const completion = await client.chat.completions.create({ model: model(), temperature: 0.15, messages: [{ role: 'system', content: instruction(source) }, ...history.filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({ role: m.role, content: m.content })).slice(-6), { role: 'user', content: question }] })
  return { answer: completion.choices[0]?.message?.content || 'I could not generate an answer for that question.', citations: citationPages(source) }
}
async function parseUpload(req) {
  const form = formidable({ maxFileSize: MAX_BYTES, maxFiles: 1 })
  const [fields, files] = await form.parse(req)
  const file = Array.isArray(files.file) ? files.file[0] : files.file
  if (!file) throw Object.assign(new Error('Choose a PDF file to upload.'), { status: 400 })
  if (file.mimetype !== 'application/pdf' && !file.originalFilename?.toLowerCase().endsWith('.pdf')) throw Object.assign(new Error('Only PDF files are supported.'), { status: 415 })
  const buffer = await fs.readFile(file.filepath)
  if (buffer.length > MAX_BYTES) throw Object.assign(new Error('The maximum file size is 30 MB.'), { status: 413 })
  let pages = []
  const parsed = await pdf(buffer, { pagerender: async page => { const content = await page.getTextContent(); const text = content.items.map(item => item.str).join(' '); pages.push(text); return text } })
  if (!parsed.numpages || !pages.join('').trim()) throw Object.assign(new Error('This PDF has no extractable text. For scanned papers, run OCR before uploading.'), { status: 422 })
  const chunkList = pages.flatMap((text, index) => chunksFrom(text, index + 1))
  const id = randomUUID()
  const document = { id, name: file.originalFilename || 'Research paper.pdf', size: buffer.length, pages: parsed.numpages, chunks: chunkList, keywords: keywords(chunkList), createdAt: new Date().toISOString() }
  documents.set(id, document)
  return document
}
function json(res, status, data) { res.status(status).json(data) }

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
    const path = url.pathname.replace(/^\/api/, '')
    if (req.method === 'POST' && path === '/upload') { const document = await parseUpload(req); return json(res, 201, { document: publicDocument(document) }) }
    const match = path.match(/^\/document\/([^/]+)$/)
    if (match && req.method === 'GET') { const document = documents.get(match[1]); if (!document) return json(res, 404, { error: 'Document session not found. Upload the paper again.' }); return json(res, 200, { document: publicDocument(document) }) }
    if (match && req.method === 'DELETE') { documents.delete(match[1]); return res.status(204).end() }
    if (req.method === 'POST' && path === '/chat') { const body = await readJson(req); const document = documents.get(body.documentId); if (!document) return json(res, 404, { error: 'Document session not found. Upload the paper again.' }); if (!body.question?.trim()) return json(res, 400, { error: 'Ask a question about the uploaded paper.' }); return json(res, 200, await generate(document, body.question, body.history)) }
    const toolMatch = path.match(/^\/tools\/([^/]+)$/)
    if (toolMatch && req.method === 'POST') { const body = await readJson(req); const document = documents.get(toolMatch[1]); if (!document) return json(res, 404, { error: 'Document session not found. Upload the paper again.' }); const prompts = { summary:'Give a concise complete summary of this paper.', 'key-points':'List the 10 most important points from this paper.', methodology:'Explain the research methodology in simple English.', datasets:'Identify every dataset or source of data mentioned, and state how it was used.', limitations:'Describe the paper’s stated advantages, strengths, limitations, and weaknesses.', conclusion:'Explain the paper’s conclusion and findings.', keywords:'List the most important technical terms in the paper with brief definitions.', questions:'Generate 10 useful study questions that can be answered from this paper.', simple:'Explain the paper’s central idea in beginner-friendly language.', insights:'Identify future work or potential improvements explicitly mentioned in the paper.' }; return json(res, 200, await generate(document, prompts[body.tool] || prompts.summary)) }
    return json(res, 404, { error: 'API route not found.' })
  } catch (error) { console.error('PaperMind API error:', error.message); return json(res, error.status || 500, { error: error.message || 'Unable to process this request.' }) }
}
function publicDocument(document) { const { chunks, ...safe } = document; return safe }
function readJson(req) { if (req.body && typeof req.body === 'object') return Promise.resolve(req.body); return new Promise((resolve, reject) => { let raw=''; req.on('data', d => raw += d); req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}) } catch { reject(Object.assign(new Error('Invalid request data.'), { status:400 })) } }); req.on('error', reject) }) }

