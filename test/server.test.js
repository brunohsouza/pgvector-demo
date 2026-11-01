import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { startServer, externalAddress, request } from './helpers.js'

let server
before(async () => { server = await startServer() })
after(() => server.stop())

const port = () => new URL(server.url).port

test('I1: the API answers on loopback only', async (t) => {
  const { status } = await request(`http://127.0.0.1:${port()}/api/info`)
  assert.equal(status, 200)
  const address = externalAddress()
  if (!address) return t.skip('no non-loopback interface on this machine')
  await assert.rejects(fetch(`http://${address}:${port()}/api/info`, { signal: AbortSignal.timeout(2000) }))
})

test('I4: non-string document fields are a 400, not a 500', async () => {
  const { status, data } = await request(`${server.url}/api/documents`, {
    method: 'POST', body: JSON.stringify({ title: 1, topic: ['tax'], body: 'x' }),
  })
  assert.equal(status, 400)
  assert.match(data.error, /text/i)
})

test('I4: missing fields keep the friendly message', async () => {
  const { status, data } = await request(`${server.url}/api/documents`, { method: 'POST', body: JSON.stringify({ title: ' ' }) })
  assert.equal(status, 400)
  assert.equal(data.error, 'Title, topic and text are all required.')
})

test('I4: an over-long body is rejected before it reaches the embedding call', async () => {
  const { status } = await request(`${server.url}/api/documents`, {
    method: 'POST', body: JSON.stringify({ title: 'T', topic: 'tax', body: 'x'.repeat(5000) }),
  })
  assert.equal(status, 400)
})

test('I4: validation messages name the field the way the page does', async () => {
  const long = await request(`${server.url}/api/search?q=${'x'.repeat(600)}`)
  assert.equal(long.data.error, 'The question is longer than 500 characters.')
  const typed = await request(`${server.url}/api/documents`, { method: 'POST', body: JSON.stringify({ title: 1, topic: 'tax', body: 'x' }) })
  assert.equal(typed.data.error, 'The title must be text.')
})

test('I4: a request body over 16 kB is refused', async () => {
  const { status } = await request(`${server.url}/api/documents`, {
    method: 'POST', body: JSON.stringify({ title: 'T', topic: 'tax', body: 'x'.repeat(20_000) }),
  })
  assert.equal(status, 413)
})

test('I4: repeated query keys are a 400, not a 500', async () => {
  const q = await request(`${server.url}/api/search?q=a&q=b`)
  assert.equal(q.status, 400)
  const topic = await request(`${server.url}/api/search?q=cat&topic=a&topic=b`)
  assert.equal(topic.status, 400)
})

test('I4: non-numeric ids are a 404 on PUT and DELETE', async () => {
  for (const id of ['abc', '1.5', '-1', 'NaN']) {
    const put = await request(`${server.url}/api/documents/${id}`, {
      method: 'PUT', body: JSON.stringify({ title: 'T', topic: 'tax', body: 'x' }),
    })
    assert.equal(put.status, 404, `PUT ${id}`)
    const del = await request(`${server.url}/api/documents/${id}`, { method: 'DELETE' })
    assert.equal(del.status, 404, `DELETE ${id}`)
  }
})
