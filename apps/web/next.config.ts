import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Next writes AGENTS.md and CLAUDE.md into the project on `next dev`
  // otherwise. They are editor tooling, not part of the application.
  agentRules: false,

  // Reached from the sync server and the browser, so it has to be a real
  // origin rather than a rewrite.
  transpilePackages: ['@workroom/core', '@workroom/db'],

  typedRoutes: true,
}

export default nextConfig
