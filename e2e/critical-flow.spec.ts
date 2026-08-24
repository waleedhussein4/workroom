import {
  test,
  expect,
  createWorkspace,
  openEmptyBoard,
  addCard,
  columnItems,
} from './support/fixtures'

test.describe('the path a new user takes', () => {
  test('create a workspace, open its board, add a card', async ({ alice }) => {
    const slug = await createWorkspace(alice, `Flow ${Date.now()}`)

    // A new workspace is seeded with a board so the first thing a person sees
    // is not an empty state.
    await expect(alice.getByRole('heading', { name: 'Boards' })).toBeVisible()

    await openEmptyBoard(alice, slug)
    await addCard(alice, 'Write the README')

    // Survives a reload, so it really was persisted rather than left in
    // client state.
    await alice.reload()
    await expect(alice.getByText('Write the README', { exact: true })).toBeVisible()
  })

  test('a card keeps its column and order across a reload', async ({ alice }) => {
    const slug = await createWorkspace(alice, `Order ${Date.now()}`)
    await openEmptyBoard(alice, slug)

    for (const title of ['First', 'Second', 'Third']) {
      await addCard(alice, title)
    }

    await expect(columnItems(alice)).toHaveText(['First', 'Second', 'Third'])

    await alice.reload()
    await expect(columnItems(alice)).toHaveText(['First', 'Second', 'Third'])
  })
})
