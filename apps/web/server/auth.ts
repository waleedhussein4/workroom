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

/**
 * Email confirmation is required by default and only turned off deliberately.
 *
 * The end-to-end suite sets this, because the alternative is scraping a link
 * out of server logs in every sign-up test. It is opt-out rather than opt-in
 * so that forgetting to set it in production fails safe.
 */
const requireEmailVerification = optional('AUTH_REQUIRE_EMAIL_VERIFICATION') !== 'false'

export const auth = betterAuth({
  appName: 'Workroom',
  baseURL: appUrl,
  secret: optional('BETTER_AUTH_SECRET') ?? 'development-only-insecure-secret',

  database: drizzleAdapter(getDb(), {
    provider: 'pg',
    schema,
  }),

  emailAndPassword: {
    enabled: true,
    // The email provider falls back to logging the link to the server
    // console, so this works locally with nothing configured.
    requireEmailVerification,
    async sendResetPassword({ user, url }) {
      await sendEmail({
        to: user.email,
        subject: 'Reset your Workroom password',
        text: `Someone asked to reset the password for this account.\n\n${url}\n\nIf that was not you, you can ignore this.`,
      })
    },
  },

  emailVerification: {
    sendOnSignUp: requireEmailVerification,
    autoSignInAfterVerification: true,
    async sendVerificationEmail({ user, url }) {
      await sendEmail({
        to: user.email,
        subject: 'Confirm your email for Workroom',
        text: `Confirm your email address to finish setting up your account.\n\n${url}`,
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
