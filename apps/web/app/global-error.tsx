'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

/**
 * Last resort when a render fails above every other boundary.
 *
 * Replaces the whole document, so it carries its own html and body and cannot
 * use anything from the root layout, including the theme or the fonts.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          display: 'flex',
          minHeight: '100dvh',
          alignItems: 'center',
          justifyContent: 'center',
          margin: 0,
          padding: '1.5rem',
          background: '#fdfdfe',
          color: '#1a1a20',
        }}
      >
        <div style={{ maxWidth: '28rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 0.5rem' }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: '0.875rem', lineHeight: 1.6, opacity: 0.7, margin: 0 }}>
            The error has been reported. Reloading usually clears it.
          </p>
          <a
            href="/"
            style={{
              display: 'inline-block',
              marginTop: '1.5rem',
              fontSize: '0.875rem',
              color: '#4f39d6',
            }}
          >
            Back to the start
          </a>
        </div>
      </body>
    </html>
  )
}
