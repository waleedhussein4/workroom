import * as Sentry from '@sentry/nextjs'
import { sentryOptions } from './lib/sentry-init'

Sentry.init(sentryOptions())
