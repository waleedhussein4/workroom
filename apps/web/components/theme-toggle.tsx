'use client'

import { useTheme } from 'next-themes'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useMounted } from '@/lib/use-mounted'
import { cn } from '@/lib/utils'

const OPTIONS = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'dark', label: 'Dark', Icon: Moon },
] as const

/**
 * Three-way theme switch.
 *
 * Renders a neutral placeholder until mounted. The server has no idea what
 * the resolved theme is, so painting a state before hydration guarantees a
 * flash of the wrong icon.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const mounted = useMounted()

  return (
    <div
      className="border-border bg-card inline-flex items-center gap-0.5 rounded-lg border p-0.5"
      role="radiogroup"
      aria-label="Colour theme"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = mounted && theme === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            onClick={() => setTheme(value)}
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
