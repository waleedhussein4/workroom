import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface StateViewProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
  /** Tightens spacing for use inside a column or panel rather than a page. */
  compact?: boolean
}

/**
 * The empty and error state used across every data surface.
 *
 * Having one component is what stops half the app from ending up with a bare
 * "No results" string and the other half with nothing at all.
 */
export function StateView({
  icon,
  title,
  description,
  action,
  className,
  compact = false,
}: StateViewProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-16',
        className,
      )}
    >
      {icon ? (
        <div className="bg-accent text-muted-foreground mb-1 flex size-10 items-center justify-center rounded-full">
          {icon}
        </div>
      ) : null}
      <p className="text-foreground text-base font-medium">{title}</p>
      {description ? (
        <p className="text-muted-foreground max-w-sm text-sm text-balance">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

interface ErrorStateProps {
  title?: string
  description?: string
  retry?: ReactNode
  className?: string
  compact?: boolean
}

/** Error variant. Always offers a way forward rather than a dead end. */
export function ErrorState({
  title = 'Something went wrong',
  description = 'That did not load. It is usually temporary.',
  retry,
  className,
  compact = false,
}: ErrorStateProps) {
  return (
    <StateView
      title={title}
      description={description}
      action={retry}
      compact={compact}
      className={className}
    />
  )
}
