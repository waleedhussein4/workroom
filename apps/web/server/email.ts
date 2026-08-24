import 'server-only'
import { escapeHtml } from '@/lib/escape-html'

/**
 * Outbound email.
 *
 * Falls back to logging when no provider is configured, so verification and
 * invitation flows can be exercised locally without signing up for anything.
 * That fallback is a development convenience and nothing more: in production
 * it means the link exists only in a runtime log, and nobody can finish
 * signing up.
 */

interface Email {
  to: string
  subject: string
  /** Plain text. Also used to build the HTML part. */
  text: string
  /** The single action the message exists for, rendered as a button. */
  action?: { label: string; url: string }
}

export class EmailNotConfiguredError extends Error {
  constructor() {
    super('No email provider is configured')
    this.name = 'EmailNotConfiguredError'
  }
}

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)
}

/**
 * Minimal HTML wrapper.
 *
 * Table-free and inline-styled on purpose: this is one paragraph and one
 * button, and every layout trick that helps a marketing email adds a way for
 * a client to render this one wrongly. Colours are literal because email
 * clients do not have the app's CSS variables, and `prefers-color-scheme`
 * support is patchy enough that a single light treatment is more predictable
 * than a half-working dark one.
 */
function renderHtml({ subject, text, action }: Email): string {
  const paragraphs = text
    .split('\n\n')
    .map((part) => part.trim())
    .filter(Boolean)
    // The action is rendered as a button, so its bare URL is dropped from the
    // prose to avoid showing the same link twice.
    .filter((part) => !action || part !== action.url)
    .map(
      (part) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1a1a20">${escapeHtml(part)}</p>`,
    )
    .join('')

  const button = action
    ? `<p style="margin:24px 0 0">
         <a href="${escapeHtml(action.url)}"
            style="display:inline-block;background:#4f39d6;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:500">
           ${escapeHtml(action.label)}
         </a>
       </p>
       <p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#6b6b76">
         If the button does not work, paste this into your browser:<br>
         <span style="color:#4f39d6;word-break:break-all">${escapeHtml(action.url)}</span>
       </p>`
    : ''

  return `<!doctype html>
<html lang="en"><body style="margin:0;padding:24px;background:#f6f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e6e6ea;border-radius:12px;padding:28px">
    <p style="margin:0 0 20px;font-size:15px;font-weight:600;color:#1a1a20">Workroom</p>
    <h1 style="margin:0 0 16px;font-size:17px;font-weight:600;color:#1a1a20">${escapeHtml(subject)}</h1>
    ${paragraphs}
    ${button}
  </div>
</body></html>`
}

export async function sendEmail(email: Email): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM

  if (!apiKey || !from) {
    console.info(
      [
        '',
        '─── email (not sent, no provider configured) ───',
        `to:      ${email.to}`,
        `subject: ${email.subject}`,
        '',
        email.text,
        email.action ? `\n${email.action.label}: ${email.action.url}` : '',
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
    body: JSON.stringify({
      from,
      to: email.to,
      subject: email.subject,
      text: email.text,
      html: renderHtml(email),
    }),
    // A hung provider must not hold a sign-up request open indefinitely.
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok) {
    // The recipient address is deliberately not logged with the failure.
    // Provider errors echo the payload back, and a log line pairing an
    // address with "delivery failed" is exactly the sort of thing that ends
    // up in a screenshot.
    console.error(`Email provider returned ${response.status} for "${email.subject}"`)
    throw new Error(`Email provider returned ${response.status}`)
  }
}
