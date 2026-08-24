import { test as base, expect, type Locator, type Page } from '@playwright/test'
import { ACCOUNTS } from './accounts'

/**
 * Two signed-in browser contexts.
 *
 * Separate contexts rather than separate pages, so the two have genuinely
 * separate cookies and storage. This is what makes a collaboration test three
 * lines instead of thirty.
 */
export const test = base.extend<{ alice: Page; aliceSecondWindow: Page; bob: Page }>({
  alice: async ({ browser }, use) => {
    const context = await browser.newContext({ storageState: ACCOUNTS.alice.storageState })
    const page = await context.newPage()
    await use(page)
    await context.close()
  },
  // A second window for the same person. Realtime sync is per connection,
  // not per account, so this exercises the same fan-out path as two people
  // without needing an invitation round trip.
  aliceSecondWindow: async ({ browser }, use) => {
    const context = await browser.newContext({ storageState: ACCOUNTS.alice.storageState })
    const page = await context.newPage()
    await use(page)
    await context.close()
  },
  bob: async ({ browser }, use) => {
    const context = await browser.newContext({ storageState: ACCOUNTS.bob.storageState })
    const page = await context.newPage()
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
