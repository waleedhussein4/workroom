import { AlertCircle } from 'lucide-react'

/** Inline error for a form. Announced so a screen reader hears the failure. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p
      role="alert"
      className="text-destructive bg-destructive-subtle flex items-start gap-2 rounded-md px-3 py-2 text-sm"
    >
      <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{message}</span>
    </p>
  )
}
