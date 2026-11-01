import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const ignored = (path) => {
  try { execFileSync('git', ['check-ignore', '-q', path]); return true } catch { return false }
}

test('I5: provider-specific env files are ignored, the example is not', () => {
  assert.equal(ignored('.env'), true)
  assert.equal(ignored('.env.local'), true)
  assert.equal(ignored('.env.gemini'), true)
  assert.equal(ignored('.env.example'), false)
  assert.equal(ignored('npm-debug.log'), true)
})

test('I1: docker-compose publishes Postgres on loopback only', () => {
  const compose = fs.readFileSync('docker-compose.yml', 'utf8')
  assert.match(compose, /"127\.0\.0\.1:5433:5432"/)
})
