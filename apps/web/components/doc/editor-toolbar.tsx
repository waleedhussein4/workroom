'use client'

import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Italic,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  Strikethrough,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Formatting controls.
 *
 * Active state is read through `useEditorState` so the toolbar re-renders on
 * selection changes only, rather than on every keystroke in the document.
 */
export function EditorToolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      task: e.isActive('taskList'),
      quote: e.isActive('blockquote'),
    }),
  })

  const items = [
    {
      key: 'bold',
      label: 'Bold',
      Icon: Bold,
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      key: 'italic',
      label: 'Italic',
      Icon: Italic,
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      key: 'strike',
      label: 'Strikethrough',
      Icon: Strikethrough,
      run: () => editor.chain().focus().toggleStrike().run(),
    },
    {
      key: 'code',
      label: 'Code',
      Icon: Code,
      run: () => editor.chain().focus().toggleCode().run(),
    },
    {
      key: 'h1',
      label: 'Heading 1',
      Icon: Heading1,
      run: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      key: 'h2',
      label: 'Heading 2',
      Icon: Heading2,
      run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      key: 'bullet',
      label: 'Bullet list',
      Icon: List,
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      key: 'ordered',
      label: 'Numbered list',
      Icon: ListOrdered,
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      key: 'task',
      label: 'Checklist',
      Icon: ListTodo,
      run: () => editor.chain().focus().toggleTaskList().run(),
    },
    {
      key: 'quote',
      label: 'Quote',
      Icon: Quote,
      run: () => editor.chain().focus().toggleBlockquote().run(),
    },
  ] as const

  return (
    <div className="flex flex-wrap items-center gap-0.5" role="toolbar" aria-label="Formatting">
      {items.map(({ key, label, Icon, run }) => {
        const active = state?.[key] ?? false
        return (
          <button
            key={key}
            type="button"
            aria-label={label}
            aria-pressed={active}
            title={label}
            onClick={run}
            className={cn(
              'inline-flex size-7 items-center justify-center rounded-md transition-colors',
              'duration-(--duration-micro)',
              active
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
            )}
          >
            <Icon className="size-3.5" aria-hidden />
          </button>
        )
      })}
    </div>
  )
}
