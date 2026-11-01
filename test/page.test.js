import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

// A DOM just big enough to run the page script: elements by id, class lists, stored listeners.
function stubDom() {
  const elements = new Map()
  const element = (id) => {
    const classes = new Set()
    const listeners = {}
    const field = () => ({ value: '', focus() {} })
    return {
      id, textContent: '', innerHTML: '', value: '', style: {}, disabled: false, dataset: {},
      title: field(), topic: field(), body: field(),
      classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
      listeners,
      addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn) },
      focus() {},
      closest: () => null,
    }
  }
  const document = {
    getElementById: (id) => { if (!elements.has(id)) elements.set(id, element(id)); return elements.get(id) },
    querySelectorAll: () => [],
    querySelector: () => null,
  }
  return { document, el: document.getElementById }
}

const jsonResponse = (ok, payload) => ({ ok, status: ok ? 200 : 400, json: async () => payload })

async function loadPage(routes) {
  const { document, el } = stubDom()
  const fetch = async (path) => {
    const route = Object.entries(routes).find(([prefix]) => path.startsWith(prefix))
    if (!route) throw new Error(`unexpected fetch ${path}`)
    return route[1]()
  }
  const context = vm.createContext({ document, fetch, console, setTimeout, performance, URLSearchParams, Event })
  const script = fs.readFileSync('public/index.html', 'utf8').match(/<script>([\s\S]*)<\/script>/)[1]
  vm.runInContext(script, context)
  await new Promise((resolve) => setTimeout(resolve, 10))
  const run = (code) => vm.runInContext(code, context)
  return { el, run }
}

const baseRoutes = {
  '/api/info': () => jsonResponse(true, { provider: 'fake', model: 'word-hash', dimensions: 1536 }),
  '/api/documents': () => jsonResponse(true, { rows: [], sql: '' }),
}

test('I2: a failed search is not remembered as the last search', async () => {
  const { el, run } = await loadPage({ ...baseRoutes, '/api/search': () => jsonResponse(false, { error: 'needs pgvector 0.8' }) })
  el('q').value = 'young cat'
  el('topic').value = 'pets'
  await run('runSearch()').catch(() => {})
  assert.equal(run('lastSearch'), null)
})

test('I2: the edit form closes after a successful save even if the re-run search fails', async () => {
  const { el, run } = await loadPage({
    ...baseRoutes,
    '/api/documents/1': () => jsonResponse(true, { sql: 'UPDATE' }),
    '/api/search': () => jsonResponse(false, { error: 'needs pgvector 0.8' }),
  })
  run('lastSearch = { q: "young cat", topic: "pets" }')
  run('openForm({ id: 1, title: "A", topic: "pets", body: "b" })')
  const form = el('edit-form')
  assert.equal(form.classList.contains('open'), true)
  form.listeners.submit[0]({ preventDefault() {}, target: form })
  // The handler hands its work to busy() without returning it, so let the fetches settle.
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(form.classList.contains('open'), false)
  assert.equal(el('sql-action').textContent, 'Updated document #1')
})
