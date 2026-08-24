import { test, expect, createWorkspace, openEmptyBoard, addCard } from './support/fixtures'

/**
 * Small-viewport behaviour.
 *
 * The bar here is not that the layout is beautiful on a phone, it is that
 * nothing is unreachable and the page never scrolls sideways as a whole. A
 * board scrolls its column row horizontally on purpose; the document doing so
 * means something has overflowed.
 */
const PHONE = { width: 390, height: 844 }

test.describe('on a small viewport', () => {
  test.use({ viewport: PHONE })

  test('every workspace section is reachable', async ({ alice }) => {
    const slug = await createWorkspace(alice, `Phone ${Date.now()}`)
    await alice.goto(`/w/${slug}`)

    // These tabs used to be hidden below the small breakpoint, which stranded
    // Docs and Members entirely on a phone.
    for (const name of ['Boards', 'Docs', 'Members']) {
      await expect(alice.getByRole('link', { name, exact: true })).toBeVisible()
    }

    await alice.getByRole('link', { name: 'Docs', exact: true }).click()
    await alice.waitForURL(`**/w/${slug}/docs`, { timeout: 15_000 })
    await expect(alice.getByRole('heading', { name: 'Docs' })).toBeVisible()
  })

  test('the board fits without the page scrolling sideways', async ({ alice }) => {
    const slug = await createWorkspace(alice, `Phone board ${Date.now()}`)
    await openEmptyBoard(alice, slug)
    await addCard(alice, 'Readable on a phone')

    await expect(alice.getByText('Readable on a phone', { exact: true })).toBeVisible()

    // The column row scrolls horizontally by design. The document must not.
    const overflows = await alice.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    )
    expect(overflows, 'the page itself should not scroll sideways').toBe(false)
  })

  test('the card panel is usable and scrolls within the viewport', async ({ alice }) => {
    const slug = await createWorkspace(alice, `Phone card ${Date.now()}`)
    await openEmptyBoard(alice, slug)
    await addCard(alice, 'Open me')

    await alice.getByText('Open me', { exact: true }).click()

    const dialog = alice.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 15_000 })
    await expect(dialog.getByLabel('Title')).toBeVisible()

    const box = await dialog.boundingBox()
    expect(box, 'the dialog should have a box').not.toBeNull()
    expect(box!.width).toBeLessThanOrEqual(PHONE.width)
  })
})
