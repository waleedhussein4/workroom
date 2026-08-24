import {
  test,
  expect,
  eventually,
  createWorkspace,
  openEmptyBoard,
  addCard,
  dragCard,
  columnItems,
  waitForLive,
} from './support/fixtures'

test.describe('realtime board sync', () => {
  test('a move in one window appears in the other', async ({ alice, aliceSecondWindow }) => {
    const slug = await createWorkspace(alice, `Sync ${Date.now()}`)
    const boardUrl = await openEmptyBoard(alice, slug)

    for (const title of ['Alpha', 'Beta', 'Gamma']) {
      await addCard(alice, title)
    }

    await aliceSecondWindow.goto(boardUrl)

    // Synchronise before acting: both windows rendered, and both actually
    // joined the room. Acting before the second has subscribed broadcasts the
    // event into a room nobody is listening in.
    await waitForLive(alice)
    await waitForLive(aliceSecondWindow)
    await expect(columnItems(alice)).toHaveText(['Alpha', 'Beta', 'Gamma'])
    await expect(columnItems(aliceSecondWindow)).toHaveText(['Alpha', 'Beta', 'Gamma'])

    await dragCard(alice, columnItems(alice).nth(0), columnItems(alice).nth(2))

    // toHaveText with an array asserts contents and order together, and
    // retries until it passes.
    await eventually(columnItems(alice)).toHaveText(['Beta', 'Gamma', 'Alpha'])
    await eventually(columnItems(aliceSecondWindow)).toHaveText(['Beta', 'Gamma', 'Alpha'])
  })

  test('a new card appears in the other window', async ({ alice, aliceSecondWindow }) => {
    const slug = await createWorkspace(alice, `Card sync ${Date.now()}`)
    const boardUrl = await openEmptyBoard(alice, slug)
    await aliceSecondWindow.goto(boardUrl)

    await waitForLive(alice)
    await waitForLive(aliceSecondWindow)

    await addCard(alice, 'Appears elsewhere')

    await eventually(
      aliceSecondWindow.getByText('Appears elsewhere', { exact: true }),
    ).toBeVisible()
  })
})

test.describe('concurrent moves', () => {
  /**
   * The test the ordering design exists for.
   *
   * Two clients drop different cards into the same gap at the same moment.
   * Key generation is deterministic, so without a tiebreak they can end up
   * rendering the same data in different orders.
   *
   * The assertion is convergence, not a particular winner. Either order is a
   * correct outcome; disagreeing about it is not.
   */
  test('two windows converge on the same order', async ({ alice, aliceSecondWindow }) => {
    const slug = await createWorkspace(alice, `Conflict ${Date.now()}`)
    const boardUrl = await openEmptyBoard(alice, slug)

    for (const title of ['One', 'Two', 'Three', 'Four']) {
      await addCard(alice, title)
    }

    await aliceSecondWindow.goto(boardUrl)
    await waitForLive(alice)
    await waitForLive(aliceSecondWindow)
    await expect(columnItems(alice)).toHaveText(['One', 'Two', 'Three', 'Four'])
    await expect(columnItems(aliceSecondWindow)).toHaveText(['One', 'Two', 'Three', 'Four'])

    // Both drags start at the same moment, into the same gap.
    await Promise.all([
      dragCard(alice, columnItems(alice).nth(0), columnItems(alice).nth(2)),
      dragCard(
        aliceSecondWindow,
        columnItems(aliceSecondWindow).nth(3),
        columnItems(aliceSecondWindow).nth(2),
      ),
    ])

    await alice.reload()
    await aliceSecondWindow.reload()

    // Wait until both boards have settled before comparing them, otherwise
    // this races the render rather than the writes.
    await eventually(columnItems(alice)).toHaveCount(4)
    await eventually(columnItems(aliceSecondWindow)).toHaveCount(4)

    const aliceOrder = await columnItems(alice).allInnerTexts()

    // The order itself is not asserted: either outcome is correct. What must
    // hold is that both windows agree.
    await eventually(columnItems(aliceSecondWindow)).toHaveText(aliceOrder)
  })
})
