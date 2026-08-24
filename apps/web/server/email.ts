/**
 * Outbound email.
 *
 * Falls back to logging when no provider is configured, so verification and
 * invitation flows are exercised end to end in development without signing up
 * for anything. The link is printed to the server console.
 */

interface Email {
  to: string
  subject: string
  text: string
}

export async function sendEmail({ to, subject, text }: Email): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM

  if (!apiKey || !from) {
    console.info(
      [
        '',
        '─── email (not sent, no provider configured) ───',
        `to:      ${to}`,
        `subject: ${subject}`,
        '',
        text,
        '───────────────────────────────────────────────',
        '',
      ].join('\n'),
    )
    return
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, text }),
  })

  if (!response.ok) {
    // Do not include the body: provider errors can echo the recipient back.
    throw new Error(`Email provider returned ${response.status}`)
  }
}
