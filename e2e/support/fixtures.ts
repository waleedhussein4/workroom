import { test as base, expect, type Locator, type Page } from '@playwright/test'
import { ACCOUNTS } from './accounts'

/**
 * Two signed-in browser contexts.
 *
 * Separate contexts rather than separate pages, so the two have genuinely
 * separate cookies and storage. This is what makes a collaboration test three
 * lines instead of thirty.
 */
/**
 * Console messages that are noise rather than defects.
 *
 * Kept deliberately short. The point of failing on console errors is that the
 * list stays short; every addition is a decision to stop looking at something.
 */
const IGNORED_CONSOLE = [
  // Dev-only warning from Next's fast refresh machinery.
  /Fast Refresh/i,
  // Chromium emits this for any request the page cancels, including ones the
  // app cancels on purpose when a component unmounts.
  /net::ERR_ABORTED/,
  // Websocket teardown during navigation.
  /WebSocket is closed before the connection is established/i,
  // The browser reporting an HTTP status, not the application failing. Several
  // tests visit a workspace or an invitation that deliberately does not exist.
  // A genuinely missing asset would be caught by the build rather than here.
  /Failed to load resource.*(404|403|401)/,
]

/**
 * Fails a test if the page logged an error.
 *
 * Added after a recording session surfaced "useInsertionEffect must not
 * schedule updates" on every single drag. The board worked, every assertion
 * passed, and the bug was invisible to the suite because nothing was looking
 * at the console.
 */
const consoleErrors = new WeakMap<Page, string[]>()

function isIgnored(text: string): boolean {
  return IGNORED_CONSOLE.some((pattern) => pattern.test(text))
}

function watchConsole(page: Page) {
  const errors: string[] = []
  consoleErrors.set(page, errors)

  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (!isIgnored(text)) errors.push(text)
  })
  page.on('pageerror', (error) => {
    if (!isIgnored(error.message)) errors.push(error.message)
  })
}

/**
 * Asserts the page logged nothing alarming.
 *
 * Called explicitly rather than automatically at teardown. Several tests visit
 * a page that is meant to 404, and a rule that has to be argued out of on a
 * third of the suite is not a rule worth having. Where it is called, it means
 * something: this page did real work and should have done it quietly.
 *
 * Added after a recording session surfaced "useInsertionEffect must not
 * schedule updates" on every single drag. The board worked, every assertion
 * passed, and nothing in the suite was looking at the console.
 */
export function expectNoConsoleErrors(page: Page) {
  expect(consoleErrors.get(page) ?? [], 'the page logged console errors').toEqual([])
}

export const test = base.extend<{ alice: Page; aliceSecondWindow: Page; bob: Page }>({
  alice: async ({ browser }, use) => {
    const context = await browser.newContext({ storageState: ACCOUNTS.alice.storageState })
    const page = await context.newPage()
    watchConsole(page)
    await use(page)
    await context.close()
  },
  // A second window for the same person. Realtime sync is per connection,
  // not per account, so this exercises the same fan-out path as two people
  // without needing an invitation round trip.
  aliceSecondWindow: async ({ browser }, use) => {
    const context = await browser.newContext({ storageState: ACCOUNTS.alice.storageState })
    const page = await context.newPage()
    watchConsole(page)
    await use(page)
    await context.close()
  },
  bob: async ({ browser }, use) => {
    const context = await browser.newContext({ storageState: ACCOUNTS.bob.storageState })
    const page = await context.newPage()
    watchConsole(page)
    await use(page)
    await context.close()
  },
})

export { expect }

/**
 * Realtime propagation is slower than a local state update, so assertions that
 * wait on another browser get their own timeout rather than raising the global
 * one and slowing every failure down.
 */
export const eventually = expect.configure({ timeout: 15_000 })

/** Creates a workspace and returns its slug. */
export async function createWorkspace(page: Page, name: string): Promise<string> {
  await page.goto('/workspaces')
  await page.getByRole('button', { name: 'New workspace' }).first().click()
  await page.getByLabel('Name').fill(name)
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await page.waitForURL(/\/w\/[^/]+$/, { timeout: 15_000 })
  const slug = new URL(page.url()).pathname.split('/')[2]
  if (!slug) throw new Error(`Could not read a workspace slug from ${page.url()}`)
  return slug
}

/**
 * Creates a fresh board and opens it.
 *
 * A new workspace comes seeded with an example board that already has cards
 * on it, which is right for a first impression and wrong for a test that
 * asserts exact column contents. A newly created board gets the three default
 * columns and nothing in them.
 */
export async function openEmptyBoard(page: Page, slug: string): Promise<string> {
  await page.goto(`/w/${slug}`)
  const before = await page.getByTestId('board-link').count()
  await page.getByRole('button', { name: 'New board' }).first().click()
  await expect(page.getByTestId('board-link')).toHaveCount(before + 1, { timeout: 15_000 })

  // The list is ordered by name, and a new board is "Untitled board".
  await page.getByTestId('board-link').filter({ hasText: 'Untitled board' }).first().click()
  await page.waitForURL(/\/w\/[^/]+\/b\/[^/]+$/, { timeout: 15_000 })
  return page.url()
}

/** Opens the workspace's seeded board and returns its url. */
export async function openFirstBoard(page: Page, slug: string): Promise<string> {
  await page.goto(`/w/${slug}`)
  // Explicit test id rather than a name match: the workspace nav also has a
  // "Boards" link, and matching by text picks that one first.
  await page.getByTestId('board-link').first().click()
  await page.waitForURL(/\/w\/[^/]+\/b\/[^/]+$/, { timeout: 15_000 })
  return page.url()
}

/** Adds a card to the first column. */
export async function addCard(page: Page, title: string): Promise<void> {
  await page.getByRole('button', { name: 'Add card' }).first().click()
  const input = page.getByPlaceholder('Card title')
  await input.fill(title)
  await input.press('Enter')
  await expect(page.getByText(title, { exact: true })).toBeVisible({ timeout: 15_000 })
}

/**
 * Drags one element onto another using real pointer events.
 *
 * `locator.dragTo` drives the HTML5 drag-and-drop API, which dnd-kit does not
 * use. It listens for pointer events, so the drag has to be performed as a
 * sequence of moves. The intermediate steps matter: a single jump from start
 * to finish never crosses the activation threshold and the drag never begins.
 */
export async function dragCard(page: Page, from: Locator, to: Locator): Promise<void> {
  const source = await from.boundingBox()
  const target = await to.boundingBox()
  if (!source || !target) throw new Error('Cannot drag: an element has no bounding box')

  const startX = source.x + source.width / 2
  const startY = source.y + source.height / 2
  const endX = target.x + target.width / 2
  const endY = target.y + target.height / 2

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  // dnd-kit's pointer sensor has an activation constraint: it waits for a
  // small movement before treating this as a drag rather than a click. A
  // nudge first, then a pause, gets past it reliably.
  await page.mouse.move(startX + 6, startY + 6)
  await page.waitForTimeout(120)

  const steps = 20
  for (let step = 1; step <= steps; step++) {
    await page.mouse.move(
      startX + ((endX - startX) * step) / steps,
      startY + ((endY - startY) * step) / steps,
    )
    await page.waitForTimeout(16)
  }

  await page.waitForTimeout(120)
  await page.mouse.up()
  await page.waitForTimeout(200)
}

/**
 * Card titles in a column, in display order.
 *
 * Selected by test id rather than by role: the workspace navigation and the
 * board both render lists, and picking "the first list on the page" is exactly
 * the kind of selector that breaks when unrelated markup moves.
 */
export function columnItems(page: Page, index = 0) {
  // Direct li children rather than getByRole('listitem'): dnd-kit sets its own
  // role on the draggable element, and the empty-column placeholder is also an
  // li, so a role query matches the wrong things.
  return page.getByTestId('column-cards').nth(index).locator('> li[data-testid^="card-"]')
}

/**
 * Waits until a board has joined its realtime room.
 *
 * The commonest cause of a flaky collaboration test is acting in one window
 * before the other has subscribed, so the event is broadcast to a room nobody
 * is listening in yet. This makes that wait explicit instead of hoping a
 * timeout covers it.
 */
export async function waitForLive(page: Page): Promise<void> {
  await expect(page.getByTestId('board-presence')).toHaveAttribute('data-connected', 'true', {
    timeout: 20_000,
  })
}
