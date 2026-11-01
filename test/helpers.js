import { spawn } from 'node:child_process'
import { once } from 'node:events'
import os from 'node:os'
import net from 'node:net'

const freePort = () => new Promise((resolve) => {
  const probe = net.createServer().listen(0, () => {
    const { port } = probe.address()
    probe.close(() => resolve(port))
  })
})

// Resolves only once the server logs its URL, so no test races the listen() call.
export async function startServer(env = {}) {
  const port = await freePort()
  const child = spawn(process.execPath, ['src/server.js'], {
    env: { ...process.env, EMBEDDINGS_PROVIDER: 'fake', PORT: String(port), ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  const url = await new Promise((resolve, reject) => {
    child.stdout.on('data', (chunk) => {
      output += chunk
      const match = output.match(/Demo running at (http:\/\/\S+)/)
      if (match) resolve(match[1])
    })
    child.stderr.on('data', (chunk) => { output += chunk })
    child.on('exit', (code) => reject(new Error(`server exited with ${code}:\n${output}`)))
  })
  const stop = async () => {
    child.kill()
    await once(child, 'exit').catch(() => {})
  }
  return { url, stop }
}

// The first non-loopback IPv4 address, or undefined on a machine that has none.
export const externalAddress = () =>
  Object.values(os.networkInterfaces()).flat().find((i) => i.family === 'IPv4' && !i.internal)?.address

export async function request(url, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? headers : { 'Content-Type': 'application/json', ...headers },
    body,
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data }
}
