import { test as setup } from '@playwright/test'
import { ACCOUNTS, signUpOrIn } from './support/accounts'

/**
 * Creates both accounts once and saves their sessions.
 *
 * Every other test starts already signed in, so no test spends time on a
 * login form it is not actually testing.
 */

setup('create alice', async ({ page }) => {
  await signUpOrIn(page, ACCOUNTS.alice)
  await page.context().storageState({ path: ACCOUNTS.alice.storageState })
})

setup('create bob', async ({ page }) => {
  await signUpOrIn(page, ACCOUNTS.bob)
  await page.context().storageState({ path: ACCOUNTS.bob.storageState })
})
