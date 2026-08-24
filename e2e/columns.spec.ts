import { test, expect, createWorkspace, openEmptyBoard, addCard } from './support/fixtures'

/** Column names in board order. */
function columnNames(page: Parameters<typeof addCard>[0]) {
  return page.getByRole('region').locator('h2')
}

test.describe('columns', () => {
  test('rename a column', async ({ alice }) => {
    const slug = await createWorkspace(alice, `Columns ${Date.now()}`)
    await openEmptyBoard(alice, slug)

    await alice.getByRole('button', { name: 'Options for Backlog' }).click()
    await alice.getByRole('menuitem', { name: 'Rename' }).click()

    const input = alice.getByLabel('Column name')
    await input.fill('Icebox')
    await input.press('Enter')

    await expect(columnNames(alice).first()).toContainText('Icebox', { timeout: 15_000 })

    // Persisted, not just local state.
    await alice.reload()
    await expect(columnNames(alice).first()).toContainText('Icebox')
  })

  test('move a column right and it stays there', async ({ alice }) => {
    const slug = await createWorkspace(alice, `Reorder ${Date.now()}`)
    await openEmptyBoard(alice, slug)

    await expect(columnNames(alice)).toHaveText([/Backlog/, /In progress/, /Done/])

    await alice.getByRole('button', { name: 'Options for Backlog' }).click()
    await alice.getByRole('menuitem', { name: 'Move right' }).click()

    await expect(columnNames(alice)).toHaveText([/In progress/, /Backlog/, /Done/], {
      timeout: 15_000,
    })

    await alice.reload()
    await expect(columnNames(alice)).toHaveText([/In progress/, /Backlog/, /Done/])
  })

  test('the leftmost column cannot move further left', async ({ alice }) => {
    const slug = await createWorkspace(alice, `Bounds ${Date.now()}`)
    await openEmptyBoard(alice, slug)

    await alice.getByRole('button', { name: 'Options for Backlog' }).click()
    await expect(alice.getByRole('menuitem', { name: 'Move left' })).toBeDisabled()
  })

  test('deleting an empty column does not ask, and takes it away', async ({ alice }) => {
    const slug = await createWorkspace(alice, `Delete ${Date.now()}`)
    await openEmptyBoard(alice, slug)

    await expect(columnNames(alice)).toHaveCount(3)

    await alice.getByRole('button', { name: 'Options for Done' }).click()
    await alice.getByRole('menuitem', { name: 'Delete column' }).click()

    await expect(columnNames(alice)).toHaveCount(2, { timeout: 15_000 })
    await expect(columnNames(alice)).toHaveText([/Backlog/, /In progress/])
  })

  test('deleting a column with cards asks first', async ({ alice }) => {
    const slug = await createWorkspace(alice, `Confirm ${Date.now()}`)
    await openEmptyBoard(alice, slug)
    await addCard(alice, 'Something worth keeping')

    // Decline the confirmation. The column, and the card, should survive.
    alice.once('dialog', (dialog) => {
      void dialog.dismiss()
    })

    await alice.getByRole('button', { name: 'Options for Backlog' }).click()
    await alice.getByRole('menuitem', { name: 'Delete column' }).click()

    await expect(columnNames(alice)).toHaveCount(3)
    await expect(alice.getByText('Something worth keeping', { exact: true })).toBeVisible()
  })
})
