import { betterAuth } from 'better-auth'
import { nextCookies } from 'better-auth/next-js'
import { organization } from 'better-auth/plugins'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { getDb, schema } from '@workroom/db'
import { ac, organizationRoles } from './access'
import { sendEmail } from './email'
import { githubCredentials, optional } from './env'

const appUrl = optional('BETTER_AUTH_URL') ?? 'http://localhost:3000'
const github = githubCredentials()

export const auth = betterAuth({
  appName: 'Workroom',
  baseURL: appUrl,
  secret: optional('BETTER_AUTH_SECRET') ?? 'development-only-insecure-secret',

  database: drizzleAdapter(getDb(), {
    provider: 'pg',
    schema,
  }),

  /**
   * There is no email confirmation step, deliberately.
   *
   * Confirming an address proves the person signing up can read that inbox.
   * Nothing here acts on that: an account reaches only the workspaces it
   * creates or is invited to, and an invitation is addressed to a mailbox
   * somebody already controls. The check would buy no access control, and
   * would cost every visitor a round trip through their inbox before they can
   * see anything.
   *
   * It also cannot be made to work on a shared sender. A provider's shared
   * from-address only delivers to the account that owns it, so requiring
   * confirmation means every other address gets an account it can never sign
   * in to, which fails worse than not asking.
   *
   * Password resets and invitations still send mail. Both are addressed to
   * somebody who is already reachable.
   */
  emailAndPassword: {
    enabled: true,
    async sendResetPassword({ user, url }) {
      await sendEmail({
        to: user.email,
        subject: 'Reset your Workroom password',
        text: `Someone asked to reset the password for this account.\n\n${url}\n\nIf that was not you, you can ignore this.`,
      })
    },
  },

  // Only offered when credentials are present, so a fresh clone runs without
  // a GitHub app.
  ...(github ? { socialProviders: { github } } : {}),

  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },

  user: {
    additionalFields: {},
  },

  plugins: [
    organization({
      ac,
      roles: organizationRoles,
      creatorRole: 'owner',
      // A workspace is a small team, and this keeps a runaway loop from
      // filling the table.
      membershipLimit: 50,
      async sendInvitationEmail(data) {
        const url = `${appUrl}/invitations/${data.id}`
        await sendEmail({
          to: data.email,
          subject: `${data.inviter.user.name} invited you to ${data.organization.name}`,
          text: `${data.inviter.user.name} has invited you to join ${data.organization.name} on Workroom.\n\n${url}`,
        })
      },
    }),
    // Must stay last. It wraps the response so that cookies set during a
    // server action actually reach the browser.
    nextCookies(),
  ],
})

export type Auth = typeof auth
