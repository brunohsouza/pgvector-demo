import { pool, toSql } from './db.js'
import { DIM, embed } from './embed.js'
import { sampleDocuments } from './sample-data.js'

// The SQL lives in named constants so the web page can show exactly what ran.
export const SQL = {
  createTable: `CREATE TABLE documents (
  id         bigserial PRIMARY KEY,
  title      text NOT NULL,
  body       text NOT NULL,
  topic      text NOT NULL,
  embedding  vector(${DIM}) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON documents USING hnsw (embedding vector_cosine_ops);`,

  insert: `INSERT INTO documents (title, body, topic, embedding)
VALUES ($1, $2, $3, $4)
RETURNING id::int`,

  list: `SELECT id::int, title, topic, body, updated_at
  FROM documents
 ORDER BY id`,

  search: `SELECT id::int, title, topic, body,
       1 - (embedding <=> $1) AS similarity
  FROM documents
 ORDER BY embedding <=> $1
 LIMIT $2`,

  iterativeScan: `SET LOCAL hnsw.iterative_scan = strict_order`,

  searchInTopic: `SELECT id::int, title, topic, body,
       1 - (embedding <=> $1) AS similarity
  FROM documents
 WHERE topic = $2
 ORDER BY embedding <=> $1
 LIMIT $3`,

  update: `UPDATE documents
   SET title = $2, body = $3, topic = $4, embedding = $5, updated_at = now()
 WHERE id = $1`,

  delete: `DELETE FROM documents WHERE id = $1`,
}

// SETUP: the vector size is part of the column type, so it follows the model.
export async function createTable() {
  await pool.query('DROP TABLE IF EXISTS documents')
  await pool.query(SQL.createTable)
}

// Recreate the table if it is missing or sized for a different model.
export async function ensureTable() {
  const { rows } = await pool.query(
    `SELECT format_type(atttypid, atttypmod) AS type
       FROM pg_attribute
      WHERE attrelid = to_regclass('documents') AND attname = 'embedding'`,
  )
  if (rows[0]?.type === `vector(${DIM})`) return false
  await resetSampleData()
  return true
}

export async function resetSampleData() {
  await createTable()
  return createDocuments(sampleDocuments)
}

// CREATE: embed every body in one API call, then insert the rows.
export async function createDocuments(docs) {
  const vectors = await embed(docs.map((d) => d.body), 'document')
  const ids = []

  for (const [i, d] of docs.entries()) {
    const { rows } = await pool.query(SQL.insert, [d.title, d.body, d.topic, toSql(vectors[i])])
    ids.push(rows[0].id)
  }
  return ids
}

// READ: every row, for the table on the page.
export async function listDocuments() {
  const { rows } = await pool.query(SQL.list)
  return rows
}

// READ: the k nearest documents to a question, optionally within one topic.
export async function search(question, { k = 3, topic } = {}) {
  const t0 = performance.now()
  const [q] = await embed(question, 'query')
  const t1 = performance.now()
  const rows = topic ? await searchInTopic(q, topic, k) : (await pool.query(SQL.search, [toSql(q), k])).rows
  const t2 = performance.now()
  return { rows, embedMs: Math.round(t1 - t0), queryMs: Math.round(t2 - t1) }
}

// With a filter, turn on iterative scans first (pgvector 0.8+), or the
// WHERE runs after the index scan and you get fewer rows than you asked for.
async function searchInTopic(q, topic, k) {
  const client = await pool.connect()
  let releaseError
  try {
    await client.query('BEGIN')
    await client.query(SQL.iterativeScan)
    const { rows } = await client.query(SQL.searchInTopic, [toSql(q), topic, k])
    await client.query('COMMIT')
    return rows
  } catch (err) {
    // ROLLBACK itself fails when the connection is gone; the original error is the one to report.
    await client.query('ROLLBACK').catch(() => {})
    // Passing the error to release() makes pg-pool discard the client instead of reusing a dead one.
    if (isConnectionError(err)) releaseError = err
    if (err.code === '42602' || err.code === '42704') {
      throw Object.assign(new Error('Filtered search needs pgvector 0.8 or later.'), { status: 400 })
    }
    throw err
  } finally {
    client.release(releaseError)
  }
}

// SQLSTATE class 08 is "connection exception" and 57P01 is "admin shutdown"; socket errors carry no code at all.
const isConnectionError = (err) => !err.code || err.code.startsWith('08') || err.code === '57P01'

// UPDATE: new text means a new vector, written in the same statement.
export async function updateDocument(id, { title, body, topic }) {
  const [v] = await embed(body, 'document')
  const { rowCount } = await pool.query(SQL.update, [id, title, body, topic, toSql(v)])
  return rowCount
}

// DELETE: the vector lives in the row, so it goes with the row.
export async function deleteDocument(id) {
  const { rowCount } = await pool.query(SQL.delete, [id])
  return rowCount
}
