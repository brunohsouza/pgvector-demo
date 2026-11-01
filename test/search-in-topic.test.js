import { test, after } from 'node:test'
import assert from 'node:assert/strict'

process.env.EMBEDDINGS_PROVIDER = 'fake'
const { pool } = await import('../src/db.js')
const { search } = await import('../src/documents.js')
after(() => pool.end())

// A client whose connection dies mid-query: the SELECT fails, and so does the ROLLBACK after it.
function droppedConnectionClient() {
  const released = []
  const client = {
    query: async (sql) => {
      if (sql.startsWith('SELECT')) throw Object.assign(new Error('connection lost'), { code: '08006' })
      if (sql === 'ROLLBACK') throw new Error('Client was closed and is not queryable')
      return { rows: [] }
    },
    release: (err) => released.push(err),
  }
  return { client, released }
}

test('I3: a failing ROLLBACK does not hide the original error, and the broken client is destroyed', async (t) => {
  const { client, released } = droppedConnectionClient()
  t.mock.method(pool, 'connect', async () => client)
  await assert.rejects(search('young cat', { topic: 'pets' }), /connection lost/)
  assert.equal(released.length, 1)
  assert.match(released[0]?.message ?? '', /connection lost/, 'client.release() must get the error so pg-pool discards it')
})
