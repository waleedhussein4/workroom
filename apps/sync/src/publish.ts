import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Hocuspocus } from '@hocuspocus/server'

/**
 * HTTP surface: a health check and the internal publish endpoint.
 *
 * Board events are published by the web server after a database write
 * commits, not by the client that made the change. Only the server knows a
 * write actually landed and passed authorization; a client-published event
 * could announce a mutation that never happened, or one it was not allowed to
 * make.
 *
 * Guarded by a shared secret and not reachable from a browser. It should not
 * be exposed publicly.
 */

interface RequestContext {
  request: IncomingMessage
  response: ServerResponse
  instance: Hocuspocus
}

const MAX_BODY_BYTES = 64 * 1024

export function createPublishHandler(secret: string) {
  return async function handle({ request, response, instance }: RequestContext): Promise<void> {
    const url = new URL(request.url ?? '/', 'http://localhost')

    if (url.pathname === '/health') {
      const memory = process.memoryUsage()
      json(response, 200, {
        ok: true,
        documents: instance.documents.size,
        // Reported because documents stay resident after the last client
        // leaves, and memory that never comes back down is the usual way a
        // Yjs server dies. The load harness reads this before and after.
        rssMb: Math.round(memory.rss / 1024 / 1024),
        heapMb: Math.round(memory.heapUsed / 1024 / 1024),
        uptimeSeconds: Math.round(process.uptime()),
      })
    }

    // Anything else falls through to Hocuspocus's own handler.
    if (url.pathname !== '/internal/publish') return

    if (request.method !== 'POST') json(response, 405, { error: 'Method not allowed' })

    // Compared with a constant-time check so the secret cannot be recovered
    // by timing the response.
    const expected = `Bearer ${secret}`
    const supplied = request.headers.authorization ?? ''
    if (!timingSafeEqual(supplied, expected)) {
      json(response, 401, { error: 'Unauthorized' })
    }

    let payload: { room?: unknown; event?: unknown }
    try {
      payload = JSON.parse(await readBody(request)) as { room?: unknown; event?: unknown }
    } catch (error) {
      // A thrown null is `json` signalling the response is done, not a parse
      // failure. Let it through.
      if (error === null) throw error
      json(response, 400, { error: 'Bad request' })
      return
    }

    if (typeof payload.room !== 'string' || payload.event === undefined) {
      json(response, 400, { error: 'Bad request' })
    }

    // Stateless broadcast reaches everyone in the room without touching the
    // document. A room with nobody in it simply has nothing to deliver to,
    // which is not an error: those clients refetch when they next connect.
    const document = instance.documents.get(payload.room)
    document?.broadcastStateless(JSON.stringify(payload.event))

    json(response, 202, { delivered: document !== undefined })
  }
}

/**
 * Writes a response and stops the request there.
 *
 * Hocuspocus runs its own handler after `onRequest` unless the hook rejects
 * with a falsy value, which it treats as "already handled". Without this the
 * server writes a second set of headers and crashes the process.
 */
function json(response: ServerResponse, status: number, body: unknown): never {
  response.writeHead(status, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(body))
  throw null
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

async function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    let size = 0

    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Body too large'))
        request.destroy()
        return
      }
      data += chunk.toString('utf8')
    })
    request.on('end', () => resolve(data))
    request.on('error', reject)
  })
}
