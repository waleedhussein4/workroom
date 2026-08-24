import { Server } from '@hocuspocus/server'
import { Database } from '@hocuspocus/extension-database'
import { loadDocumentState, storeDocumentState } from './persistence'
import { verifyTicket, type TicketClaims } from './ticket'
import { createPublishHandler } from './publish'

/**
 * The sync server.
 *
 * Two kinds of room over one socket:
 *
 *   doc:<id>    a real Y.Doc. Text lives in a Y.XmlFragment, Tiptap binds to
 *               it, and the state is snapshotted to Postgres.
 *   board:<id>  no document at all. Carries awareness (who is looking, who is
 *               dragging what) and the mutation events the web app publishes
 *               after a write commits. Board data itself lives in Postgres.
 *
 * This runs as its own process rather than inside Next because serverless
 * functions cap connection lifetime, and a document sync that drops every few
 * minutes and has to resync is not a real-time system.
 */

const port = Number(process.env.PORT ?? 1234)

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`${name} is not set.`)
    process.exit(1)
  }
  return value
}

const jwtSecret = requiredEnv('REALTIME_JWT_SECRET')
const internalSecret = requiredEnv('SYNC_INTERNAL_SECRET')
requiredEnv('DATABASE_URL')

function roomKind(name: string): 'doc' | 'board' | null {
  if (name.startsWith('doc:')) return 'doc'
  if (name.startsWith('board:')) return 'board'
  return null
}

function roomId(name: string): string {
  return name.slice(name.indexOf(':') + 1)
}

const publish = createPublishHandler(internalSecret)

const server = new Server<TicketClaims>({
  name: process.env.INSTANCE_NAME ?? 'workroom-sync',
  port,

  // How often a document is snapshotted to Postgres: after two seconds of
  // quiet, and never more than ten seconds behind however fast someone types.
  // These are the library's current defaults, set explicitly because the spec
  // quotes the numbers and a default is not a promise.
  debounce: 2_000,
  maxDebounce: 10_000,

  /** Health check and the internal publish endpoint. */
  async onRequest({ request, response, instance }) {
    await publish({ request, response, instance })
  },

  /**
   * Every connection presents a short-lived ticket minted by the web app,
   * which already checked workspace membership and role.
   *
   * The room check is the important line. Without it a valid ticket for one
   * room would open any room, which would undo the entire authorization model.
   */
  async onAuthenticate(data) {
    const claims = await verifyTicket(data.token, jwtSecret)

    if (claims.room !== data.documentName) {
      throw new Error('Ticket is not valid for this room')
    }
    if (roomKind(data.documentName) === null) {
      throw new Error('Unknown room type')
    }

    // Viewers connect, see everyone, and change nothing.
    data.connectionConfig.readOnly = !claims.canWrite

    return claims
  },

  extensions: [
    new Database({
      async fetch({ documentName }) {
        if (roomKind(documentName) !== 'doc') return null
        return loadDocumentState(roomId(documentName))
      },
      async store({ documentName, state }) {
        // Board rooms hold no document. Persisting their empty Y.Doc would
        // write rows nothing ever reads.
        if (roomKind(documentName) !== 'doc') return
        await storeDocumentState(roomId(documentName), state)
      },
    }),
  ],
})

await server.listen()

console.info(`sync server listening on :${port}`)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.info(`${signal} received, shutting down`)
    void server.destroy().then(() => process.exit(0))
  })
}
