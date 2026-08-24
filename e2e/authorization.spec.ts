import { test, expect, createWorkspace } from './support/fixtures'

test.describe('workspace isolation', () => {
  test("someone else's workspace is not reachable", async ({ alice, bob }) => {
    const slug = await createWorkspace(alice, `Private ${Date.now()}`)

    // Bob has a valid session. He is simply not a member.
    await bob.goto(`/w/${slug}`)

    // Not-a-member and does-not-exist look identical on purpose, so a slug
    // cannot be probed for existence from outside.
    await expect(bob.getByText(/could not be found|404|not found/i).first()).toBeVisible({
      timeout: 15_000,
    })
    await expect(bob.getByRole('heading', { name: 'Boards' })).not.toBeVisible()
  })

  test('a signed-out visitor is sent to sign in', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.goto('/workspaces')
    await page.waitForURL('**/sign-in', { timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()

    await context.close()
  })
})
