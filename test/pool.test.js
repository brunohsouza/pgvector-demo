import { test, after } from 'node:test'
import assert from 'node:assert/strict'

process.env.EMBEDDINGS_PROVIDER = 'fake'
const { pool } = await import('../src/db.js')
after(() => pool.end())

test('I3: the pool logs idle-connection errors instead of crashing the process', () => {
  assert.ok(pool.listenerCount('error') > 0, 'no error listener on the pool')
})
