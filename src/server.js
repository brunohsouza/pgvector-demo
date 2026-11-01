import path from 'node:path'
import express from 'express'
import { PROVIDER, MODEL, DIM, LABEL } from './embed.js'
import {
  SQL, ensureTable, resetSampleData, createDocuments, listDocuments,
  search, updateDocument, deleteDocument,
} from './documents.js'

const app = express()
app.use(express.json({ limit: '16kb' }))
app.use(express.static(path.join(import.meta.dirname, '../public')))

const httpError = (status, message) => Object.assign(new Error(message), { status })

// Caps keep a stray request from sending a novel to the embeddings API.
const FIELDS = {
  title: { label: 'The title', max: 200 },
  topic: { label: 'The topic', max: 50 },
  body: { label: 'The text', max: 4000 },
  q: { label: 'The question', max: 500 },
}

const text = (value, field) => {
  if (value == null) return ''
  const { label, max } = FIELDS[field]
  if (typeof value !== 'string') throw httpError(400, `${label} must be text.`)
  const trimmed = value.trim()
  if (trimmed.length > max) throw httpError(400, `${label} is longer than ${max} characters.`)
  return trimmed
}

const clean = ({ title, topic, body } = {}) => {
  const doc = { title: text(title, 'title'), topic: text(topic, 'topic').toLowerCase(), body: text(body, 'body') }
  if (!doc.title || !doc.topic || !doc.body) throw httpError(400, 'Title, topic and text are all required.')
  return doc
}

const documentId = (raw) => {
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) throw httpError(404, 'Document not found.')
  return id
}

app.get('/api/info', (req, res) => {
  res.json({ provider: PROVIDER, model: MODEL, dimensions: DIM })
})

app.get('/api/documents', async (req, res) => {
  res.json({ rows: await listDocuments(), sql: SQL.list })
})

app.post('/api/documents', async (req, res) => {
  const [id] = await createDocuments([clean(req.body)])
  res.status(201).json({ id, sql: SQL.insert })
})

app.put('/api/documents/:id', async (req, res) => {
  const updated = await updateDocument(documentId(req.params.id), clean(req.body))
  if (!updated) throw httpError(404, 'Document not found.')
  res.json({ sql: SQL.update })
})

app.delete('/api/documents/:id', async (req, res) => {
  const deleted = await deleteDocument(documentId(req.params.id))
  if (!deleted) throw httpError(404, 'Document not found.')
  res.json({ sql: SQL.delete })
})

app.get('/api/search', async (req, res) => {
  const question = text(req.query.q, 'q')
  if (!question) throw httpError(400, 'Type a question first.')
  const topic = text(req.query.topic, 'topic') || undefined
  const result = await search(question, { topic })
  res.json({ ...result, sql: topic ? `${SQL.iterativeScan};\n\n${SQL.searchInTopic}` : SQL.search })
})

app.post('/api/reset', async (req, res) => {
  await resetSampleData()
  res.json({ sql: SQL.createTable })
})

app.use((err, req, res, next) => {
  if (!err.status) console.error(err)
  res.status(err.status ?? 500).json({ error: err.message })
})

const created = await ensureTable()
const port = Number(process.env.PORT ?? 3000)
// Loopback only: on conference Wi-Fi nobody else should reach the paid or destructive routes.
const host = process.env.HOST ?? '127.0.0.1'
app.listen(port, host, () => {
  console.log(`Embeddings: ${LABEL}`)
  if (created) console.log('Created the documents table with sample data.')
  console.log(`Demo running at http://localhost:${port}`)
})
