'use client'

import { useEffect, useMemo, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCaret from '@tiptap/extension-collaboration-caret'
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'
import { Loader2, WifiOff } from 'lucide-react'
import { EditorToolbar } from '@/components/doc/editor-toolbar'
import { PresenceStack } from '@/components/doc/presence-stack'

/**
 * The collaborative document editor.
 *
 * Text lives in a Yjs XmlFragment rather than in Postgres. Two people typing
 * in the same sentence merge per character; the sync server persists a
 * snapshot on a debounce.
 *
 * Three things here are load-bearing for Next:
 *
 *   - `immediatelyRender: false`, because Tiptap throws on a server render
 *     otherwise.
 *   - the Y.Doc and provider are created inside the component and destroyed on
 *     unmount, never at module scope. Module-scope instances leak across fast
 *     refresh and, in development, StrictMode opens two connections with two
 *     client ids.
 *   - this whole file is loaded through next/dynamic with ssr disabled, since
 *     ProseMirror touches `document` at import time.
 */

export interface EditorUser {
  id: string
  name: string
  color: string
}

interface Peer {
  name: string
  color: string
}

export function DocEditor({
  documentId,
  user,
  canEdit,
}: {
  documentId: string
  user: EditorUser
  canEdit: boolean
}) {
  const room = `doc:${documentId}`
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [peers, setPeers] = useState<Peer[]>([])
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null)

  // Created once per mount, torn down on unmount.
  const doc = useMemo(() => new Y.Doc(), [])

  useEffect(() => {
    let disposed = false
    let created: HocuspocusProvider | undefined

    async function connect() {
      const base = process.env.NEXT_PUBLIC_SYNC_URL
      if (!base) {
        setStatus('disconnected')
        return
      }

      const response = await fetch('/api/realtime/ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room }),
      })
      if (!response.ok) {
        setStatus('disconnected')
        return
      }
      const { token } = (await response.json()) as { token: string }
      if (disposed) return

      created = new HocuspocusProvider({
        url: base,
        name: room,
        document: doc,
        token,
        onStatus: ({ status: next }) => {
          setStatus(next === 'connected' ? 'connected' : 'connecting')
        },
        onDisconnect: () => setStatus('disconnected'),
      })

      created.setAwarenessField('user', { name: user.name, color: user.color })

      const readPeers = () => {
        const states = created?.awareness?.getStates() ?? new Map()
        const others: Peer[] = []
        for (const [clientId, state] of states) {
          if (clientId === created?.awareness?.clientID) continue
          const info = (state as { user?: Peer }).user
          if (info) others.push(info)
        }
        setPeers(others)
      }

      created.on('awarenessUpdate', readPeers)
      readPeers()
      setProvider(created)
    }

    void connect()

    return () => {
      disposed = true
      created?.destroy()
      setProvider(null)
    }
  }, [room, doc, user.name, user.color])

  const editor = useEditor(
    {
      // Required under any SSR framework, and Tiptap 3 throws without it.
      immediatelyRender: false,
      editable: canEdit,
      extensions: [
        StarterKit.configure({
          // Collaboration brings its own history backed by the CRDT. Leaving
          // the default one enabled means two undo stacks fighting.
          undoRedo: false,
        }),
        Placeholder.configure({ placeholder: 'Start writing…' }),
        Link.configure({ openOnClick: false, autolink: true }),
        TaskList,
        TaskItem.configure({ nested: true }),
        ...(provider
          ? [
              Collaboration.configure({ document: doc }),
              CollaborationCaret.configure({
                provider,
                user: { name: user.name, color: user.color },
              }),
            ]
          : []),
      ],
      editorProps: {
        attributes: {
          class: 'prose-editor focus:outline-none',
        },
      },
    },
    [provider, canEdit],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-border/70 flex items-center justify-between border-b px-6 py-2">
        {canEdit && editor ? <EditorToolbar editor={editor} /> : <span />}
        <div className="flex items-center gap-3">
          <ConnectionBadge status={status} />
          <PresenceStack peers={peers} />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-6 py-10">
          {editor ? (
            <EditorContent editor={editor} />
          ) : (
            <div className="flex flex-col gap-3" aria-label="Loading document">
              <div className="bg-muted h-6 w-2/3 animate-pulse rounded" />
              <div className="bg-muted h-4 w-full animate-pulse rounded" />
              <div className="bg-muted h-4 w-5/6 animate-pulse rounded" />
              <div className="bg-muted h-4 w-4/6 animate-pulse rounded" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ConnectionBadge({ status }: { status: 'connecting' | 'connected' | 'disconnected' }) {
  if (status === 'connected') return null

  return (
    <span
      role="status"
      className="text-muted-foreground flex items-center gap-1.5 text-xs"
      title={
        status === 'connecting'
          ? 'Connecting to the sync server'
          : 'Not connected. Edits are kept locally and will merge when the connection returns.'
      }
    >
      {status === 'connecting' ? (
        <Loader2 className="size-3 animate-spin" aria-hidden />
      ) : (
        <WifiOff className="size-3" aria-hidden />
      )}
      {status === 'connecting' ? 'Connecting' : 'Offline'}
    </span>
  )
}
