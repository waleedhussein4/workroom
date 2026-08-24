import {
  test,
  expect,
  createWorkspace,
  openEmptyBoard,
  addCard,
  columnItems,
} from './support/fixtures'

/**
 * Keyboard drag.
 *
 * This was flagged as a risk when @dnd-kit/react was chosen over Pragmatic
 * drag-and-drop: the argument for dnd-kit was that keyboard dragging comes
 * built in, and that claim was never actually checked. Pragmatic is built on
 * the native HTML5 drag API, which is not keyboard accessible at all, so if
 * this does not work then the reason for the choice does not hold.
 *
 * dnd-kit's keyboard sensor lifts with Space or Enter, moves with the arrow
 * keys, drops with the same key that lifted, and cancels with Escape.
 */
test.describe('keyboard drag', () => {
  test('a card can be moved without a pointer', async ({ alice }) => {
    const slug = await createWorkspace(alice, `Keys ${Date.now()}`)
    await openEmptyBoard(alice, slug)

    for (const title of ['Alpha', 'Beta', 'Gamma']) {
      await addCard(alice, title)
    }
    await expect(columnItems(alice)).toHaveText(['Alpha', 'Beta', 'Gamma'])

    const first = columnItems(alice).first()
    await first.focus()

    // dnd-kit puts role="button" and its keyboard handlers on the element
    // holding the sortable ref, so the card itself is focusable.
    await expect(first).toBeFocused()

    // Each step is animated, and firing the next key before the previous one
    // has settled loses it.
    await alice.keyboard.press('Space')
    await expect(first).toHaveAttribute('aria-pressed', 'true')

    await alice.keyboard.press('ArrowDown')
    await alice.waitForTimeout(250)
    await alice.keyboard.press('Space')

    await expect(columnItems(alice)).toHaveText(['Beta', 'Alpha', 'Gamma'], { timeout: 15_000 })

    // Persisted, so the keyboard path goes through the same server action.
    await alice.reload()
    await expect(columnItems(alice)).toHaveText(['Beta', 'Alpha', 'Gamma'])
  })

  test('escape cancels a keyboard drag and leaves the order alone', async ({ alice }) => {
    const slug = await createWorkspace(alice, `Cancel ${Date.now()}`)
    await openEmptyBoard(alice, slug)

    for (const title of ['One', 'Two', 'Three']) {
      await addCard(alice, title)
    }
    await expect(columnItems(alice)).toHaveText(['One', 'Two', 'Three'])

    const first = columnItems(alice).first()
    await first.focus()
    await alice.keyboard.press('Space')
    await expect(first).toHaveAttribute('aria-pressed', 'true')

    await alice.keyboard.press('ArrowDown')
    await alice.waitForTimeout(250)
    await alice.keyboard.press('Escape')
    await alice.waitForTimeout(250)

    await expect(columnItems(alice)).toHaveText(['One', 'Two', 'Three'])
    await alice.reload()
    await expect(columnItems(alice)).toHaveText(['One', 'Two', 'Three'])
  })
})
