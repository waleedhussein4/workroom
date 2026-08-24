import { test, expect, createWorkspace } from './support/fixtures'
import { ACCOUNTS } from './support/accounts'

test.describe('invitations', () => {
  test('alice invites bob, bob accepts and sees the workspace', async ({ alice, bob }) => {
    const name = `Team ${Date.now()}`
    const slug = await createWorkspace(alice, name)

    await alice.goto(`/w/${slug}/members`)
    await alice.getByLabel('Invite by email').fill(ACCOUNTS.bob.email)
    await alice.getByLabel('Role').selectOption('member')
    await alice.getByRole('button', { name: 'Invite', exact: true }).click()

    // The pending list is the only place the invitation link is visible when
    // no mail provider is configured, which is exactly why it exists.
    const pending = alice.getByRole('listitem').filter({ hasText: ACCOUNTS.bob.email })
    await expect(pending).toBeVisible({ timeout: 15_000 })

    // Read the link from the page rather than the clipboard: clipboard
    // permissions differ between browsers and headless modes, and the link is
    // what is actually under test.
    const invitationId = await alice.evaluate(() => {
      const button = document.querySelector('[aria-label^="Revoke invitation"]')
      const item = button?.closest('li')
      return item?.getAttribute('data-invitation-id') ?? null
    })
    expect(invitationId, 'the pending row should expose its invitation id').toBeTruthy()

    await bob.goto(`/invitations/${invitationId}`)
    await expect(bob.getByRole('heading', { name: new RegExp(`Join ${name}`) })).toBeVisible()

    await bob.getByRole('button', { name: 'Accept invitation' }).click()
    await bob.waitForURL(`**/w/${slug}`, { timeout: 20_000 })

    // Bob is now a member, so the board list loads rather than 404ing.
    await expect(bob.getByRole('heading', { name: 'Boards' })).toBeVisible()

    // And alice sees him in the member list.
    await alice.goto(`/w/${slug}/members`)
    await expect(alice.getByText(ACCOUNTS.bob.email)).toBeVisible({ timeout: 15_000 })
  })

  test('an invitation for someone else explains itself rather than failing', async ({
    alice,
    bob,
  }) => {
    const slug = await createWorkspace(alice, `Mismatch ${Date.now()}`)

    await alice.goto(`/w/${slug}/members`)
    await alice.getByLabel('Invite by email').fill('someone-else@workroom.test')
    await alice.getByRole('button', { name: 'Invite', exact: true }).click()

    await expect(
      alice.getByRole('listitem').filter({ hasText: 'someone-else@workroom.test' }),
    ).toBeVisible({ timeout: 15_000 })
    const invitationId = await alice.evaluate(() => {
      const button = document.querySelector('[aria-label^="Revoke invitation"]')
      return button?.closest('li')?.getAttribute('data-invitation-id') ?? null
    })
    expect(invitationId).toBeTruthy()

    // Bob is signed in, but as the wrong person. He should be told which
    // address the invitation is for, not shown an error.
    await bob.goto(`/invitations/${invitationId}`)
    await expect(bob.getByText('someone-else@workroom.test')).toBeVisible()
    await expect(bob.getByRole('button', { name: 'Accept invitation' })).toHaveCount(0)
  })

  test('an unknown invitation id is a not-found page', async ({ bob }) => {
    await bob.goto('/invitations/does-not-exist')
    await expect(bob.getByText(/could not be found|404|not found/i).first()).toBeVisible({
      timeout: 15_000,
    })
  })
})
