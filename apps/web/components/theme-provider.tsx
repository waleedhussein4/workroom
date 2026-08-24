'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'

/**
 * Wraps next-themes with this project's settings.
 *
 * `attribute="class"` matches the `@custom-variant dark` selector in
 * globals.css. `disableTransitionOnChange` stops every colour token animating
 * at once when the theme flips, which otherwise looks like a glitch rather
 * than a deliberate change.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  )
}
