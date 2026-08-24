import { ForbiddenError, NotFoundError, UnauthenticatedError } from '@/server/guard'

/**
 * The shape every Server Action returns.
 *
 * Actions do not throw across the network boundary. In production Next
 * replaces a thrown error's message with a generic string, so throwing means
 * the user sees "An error occurred in the Server Components render" and
 * nothing useful. Returning a discriminated union instead keeps the failure
 * legible on the client and keeps the caller honest about handling it.
 */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

/**
 * Runs an action body and converts known failures into messages.
 *
 * Anything unrecognised is logged server-side and reported generically, so an
 * unexpected database error cannot leak column names or ids to the client.
 */
export async function actionResult<T>(run: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await run() }
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return { ok: false, error: 'Sign in to continue.' }
    }
    if (error instanceof ForbiddenError) {
      return { ok: false, error: 'You do not have permission to do that.' }
    }
    if (error instanceof NotFoundError) {
      return { ok: false, error: `${error.message}.` }
    }
    // Errors thrown deliberately inside an action are safe to show. Anything
    // else is not.
    if (error instanceof Error && error.name === 'Error') {
      return { ok: false, error: error.message }
    }
    console.error('Unhandled action error', error)
    return { ok: false, error: 'Something went wrong. Try again.' }
  }
}
