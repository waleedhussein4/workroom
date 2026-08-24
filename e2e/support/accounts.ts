import type { Page } from '@playwright/test'

/**
 * Two accounts, created once by the setup project and reused as stored
 * sessions. Emails are unique per run so a repeated local run does not collide
 * with rows left behind by the previous one.
 */
const RUN_ID = process.env.E2E_RUN_ID ?? 'local'

export const ACCOUNTS = {
  alice: {
    name: 'Alice Ashwood',
    email: `alice-${RUN_ID}@workroom.test`,
    password: 'correct-horse-battery-staple',
    storageState: 'e2e/.auth/alice.json',
  },
  bob: {
    name: 'Bob Byrne',
    email: `bob-${RUN_ID}@workroom.test`,
    password: 'another-long-enough-password',
    storageState: 'e2e/.auth/bob.json',
  },
} as const

export type Account = (typeof ACCOUNTS)[keyof typeof ACCOUNTS]

/** Signs up, falling back to signing in if the account already exists. */
export async function signUpOrIn(page: Page, account: Account): Promise<void> {
  await page.goto('/sign-up')
  await page.getByLabel('Name').fill(account.name)
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: 'Create account' }).click()

  const created = await page
    .waitForURL('**/workspaces', { timeout: 15_000 })
    .then(() => true)
    .catch(() => false)

  if (created) return

  await page.goto('/sign-in')
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/workspaces', { timeout: 15_000 })
}
