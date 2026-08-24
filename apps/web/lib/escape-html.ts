const REPLACEMENTS: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/**
 * Escapes text for interpolation into an HTML email.
 *
 * React escapes everything it renders, so the application almost never needs
 * this. Emails are built as strings, which puts them outside that safety net,
 * and the strings involved include names and workspace names that users chose.
 *
 * The ampersand has to be replaced first, or the escapes produced by the
 * later replacements get escaped again.
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => REPLACEMENTS[character] ?? character)
}
