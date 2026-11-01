import express from 'express'
import { PROVIDER, MODEL, DIM } from './embed.js'
import {
  SQL, ensureTable, resetSampleData, createDocuments, listDocuments,
  search, updateDocument, deleteDocument,
} from './documents.js'

const app = express()
app.use(express.json())
app.use(express.static(new URL('../public', import.meta.url).pathname))

const clean = ({ title, topic, body } = {}) => {
  const doc = { title: title?.trim(), topic: topic?.trim().toLowerCase(), body: body?.trim() }
  if (!doc.title || !doc.topic || !doc.body) {
    throw Object.assign(new Error('Title, topic and text are all required.'), { status: 400 })
  }
  return doc
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
  const updated = await updateDocument(Number(req.params.id), clean(req.body))
  if (!updated) return res.status(404).json({ error: 'Document not found.' })
  res.json({ sql: SQL.update })
})

app.delete('/api/documents/:id', async (req, res) => {
  const deleted = await deleteDocument(Number(req.params.id))
  if (!deleted) return res.status(404).json({ error: 'Document not found.' })
  res.json({ sql: SQL.delete })
})

app.get('/api/search', async (req, res) => {
  const question = req.query.q?.trim()
  if (!question) return res.status(400).json({ error: 'Type a question first.' })
  const topic = req.query.topic || undefined
  const result = await search(question, { k: 3, topic })
  res.json({ ...result, sql: topic ? SQL.searchInTopic : SQL.search })
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
app.listen(port, () => {
  console.log(`Embeddings: ${PROVIDER} · ${MODEL} · ${DIM} dimensions`)
  if (created) console.log('Created the documents table with sample data.')
  console.log(`Demo running at http://localhost:${port}`)
})
