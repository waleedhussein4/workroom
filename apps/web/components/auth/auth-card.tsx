import type { ReactNode } from 'react'

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="bg-card border-border rounded-xl border p-6 shadow-sm">
      <h1 className="text-foreground text-lg font-semibold tracking-tight">{title}</h1>
      {description ? (
        <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{description}</p>
      ) : null}
      <div className="mt-6">{children}</div>
      {footer ? (
        <div className="border-border text-muted-foreground mt-6 border-t pt-4 text-sm">
          {footer}
        </div>
      ) : null}
    </div>
  )
}
