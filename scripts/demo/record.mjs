/**
 * Records the two-window demo.
 *
 * The interesting thing about this app is that two people see the same board
 * change at the same time, and that is impossible to show in a screenshot and
 * awkward to show in two separate recordings. So the recording is of a single
 * page holding two iframes side by side, each loading the same board.
 *
 * They share a session, which is exactly right: the claim being demonstrated
 * is that two connected clients converge, not that two accounts can both sign
 * in. Each iframe is a separate document with its own WebSocket, so the sync
 * is genuine rather than a shared React tree.
 *
 *   npm run dev:web        # and dev:sync, both running
 *   node scripts/demo/record.mjs [--url http://localhost:3000] [--out docs]
 *
 * Produces a .webm. Converting it to the committed GIF needs ffmpeg. The
 * exact command, because the details matter more than they look:
 *
 *   ffmpeg -ss 0.95 -i docs/demo.webm -filter_complex  *     "fps=11,scale=940:-1:flags=lanczos,split[s0][s1]; *      [s0]palettegen=max_colors=200:stats_mode=diff[p]; *      [s1][p]paletteuse=dither=none" -loop 0 docs/demo.gif
 *
 * The seek drops the first second, which is both panes loading. Without it the
 * README opens on a blank white rectangle, since a still GIF shows frame one.
 * Dithering is off because the UI is flat colour, where it only adds visible
 * noise and bytes.
 */

import { chromium } from '@playwright/test'
import { mkdir, readdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'

const args = new Map()
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1])
}

const BASE = args.get('url') ?? 'http://localhost:3000'
const OUT = args.get('out') ?? 'docs'
const EMAIL = args.get('email') ?? `demo-${Date.now()}@workroom.test`
const PASSWORD = 'correct-horse-battery-staple'

const VIEWPORT = { width: 1440, height: 720 }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const browser = await chromium.launch()

// Setup runs in its own context with no recording, so the finished video
// contains only the demo rather than a minute of form filling. The session is
// carried over as storage state.
const setupContext = await browser.newContext({ viewport: VIEWPORT })
const setup = await setupContext.newPage()
await setup.goto(`${BASE}/sign-up`)
await setup.getByLabel('Name').fill('Demo')
await setup.getByLabel('Email').fill(EMAIL)
await setup.getByLabel('Password').fill(PASSWORD)
await setup.getByRole('button', { name: 'Create account' }).click()

const signedUp = await setup
  .waitForURL('**/workspaces', { timeout: 20_000 })
  .then(() => true)
  .catch(() => false)

if (!signedUp) {
  console.error('Sign-up did not complete. Is the web app running and migrated?')
  await browser.close()
  await rm('.demo-tmp', { recursive: true, force: true })
  process.exit(1)
}

await setup.getByRole('button', { name: 'New workspace' }).first().click()
await setup.getByLabel('Name').fill('Acme Labs')
await setup.getByRole('button', { name: 'Create', exact: true }).click()
await setup.waitForURL(/\/w\/[^/]+$/, { timeout: 20_000 })

await setup.getByTestId('board-link').first().click()
await setup.waitForURL(/\/w\/[^/]+\/b\/[^/]+$/, { timeout: 20_000 })
const boardPath = new URL(setup.url()).pathname

// The document url is captured now rather than navigated to later. Clicking
// the workspace nav inside a half-width iframe is fragile, and the demo is
// about sync rather than about navigation.
await setup.goto(`${BASE}${boardPath.replace(/\/b\/.*/, '/docs')}`)
await setup
  .getByRole('link', { name: /Welcome/ })
  .first()
  .click()
await setup.waitForURL(/\/docs\/[^/]+$/, { timeout: 20_000 })
const docPath = new URL(setup.url()).pathname

const storageState = await setupContext.storageState()
await setupContext.close()

const context = await browser.newContext({
  viewport: VIEWPORT,
  recordVideo: { dir: '.demo-tmp', size: VIEWPORT },
  deviceScaleFactor: 2,
  storageState,
})

// The stage: one page, two frames, each its own document and socket.
const stage = await context.newPage()
await stage.goto(`${BASE}/`)
await stage.setContent(`
  <style>
    html,body{margin:0;height:100%;background:#0f0f13;font-family:ui-sans-serif,system-ui,sans-serif}
    .row{display:flex;height:100%;gap:2px}
    .pane{flex:1;display:flex;flex-direction:column;min-width:0}
    .cap{color:#9a9aa8;font-size:12px;padding:6px 10px;letter-spacing:.02em}
    iframe{flex:1;border:0;width:100%;background:#fff}
  </style>
  <div class="row">
    <div class="pane"><div class="cap">Window one</div><iframe id="a" src="${boardPath}"></iframe></div>
    <div class="pane"><div class="cap">Window two</div><iframe id="b" src="${boardPath}"></iframe></div>
  </div>
`)

const left = stage.frameLocator('#a')
const right = stage.frameLocator('#b')

// Wait until both frames have actually joined the room, or the first drag
// happens before anyone is listening and the demo shows nothing syncing.
for (const frame of [left, right]) {
  await frame
    .locator('[data-testid="board-presence"][data-connected="true"]')
    .waitFor({ timeout: 30_000 })
}
await sleep(1200)

/** Drags with real pointer events, in the coordinate space of the whole page. */
async function drag(frameSelector, fromText, toText) {
  const box = await stage.locator(frameSelector).boundingBox()
  const inFrame = stage.frameLocator(frameSelector)
  const from = await inFrame.getByText(fromText, { exact: true }).boundingBox()
  const to = await inFrame.getByText(toText, { exact: true }).boundingBox()
  if (!box || !from || !to) throw new Error(`cannot locate "${fromText}" or "${toText}"`)

  const sx = box.x + from.x + from.width / 2
  const sy = box.y + from.y + from.height / 2
  const ex = box.x + to.x + to.width / 2
  const ey = box.y + to.y + to.height / 2

  await stage.mouse.move(sx, sy)
  await stage.mouse.down()
  await stage.mouse.move(sx + 8, sy + 8)
  await sleep(160)
  for (let step = 1; step <= 26; step++) {
    await stage.mouse.move(sx + ((ex - sx) * step) / 26, sy + ((ey - sy) * step) / 26)
    await sleep(22)
  }
  await sleep(200)
  await stage.mouse.up()
  await sleep(1400)
}

// 1. A card moves in one window and arrives in the other.
await drag('#a', 'Drag this card to another column', 'Try the Docs tab')
await sleep(1200)

// 2. And back, from the other side, to show it is not one-directional.
await drag('#b', 'Invite someone from the Members tab', 'Rename a column by clicking its title')
await sleep(1600)

// 3. Two people typing in the same paragraph.
await stage.evaluate((path) => {
  for (const id of ['a', 'b']) {
    const frame = document.getElementById(id)
    if (frame instanceof HTMLIFrameElement) frame.src = path
  }
}, docPath)

for (const frame of [left, right]) {
  await frame.locator('.prose-editor').waitFor({ timeout: 30_000 })
}
await sleep(2000)

const leftEditor = left.locator('.prose-editor')
const rightEditor = right.locator('.prose-editor')
await leftEditor.click()
await leftEditor.pressSequentially('Two people, one paragraph. ', { delay: 55 })
await sleep(700)
await rightEditor.click()
await rightEditor.pressSequentially('Both sets of keystrokes survive.', { delay: 55 })
await sleep(2500)

await context.close()
await browser.close()

// Playwright names videos by an internal id, so the file is found and renamed.
await mkdir(OUT, { recursive: true })
const files = await readdir('.demo-tmp')
const video = files.find((file) => file.endsWith('.webm'))

if (video) {
  const target = join(OUT, 'demo.webm')
  await rm(target, { force: true })
  await rename(join('.demo-tmp', video), target)
  console.log(`wrote ${target}`)
  console.log(
    'to convert: ffmpeg -i docs/demo.webm -vf "fps=12,scale=960:-1:flags=lanczos" docs/demo.gif',
  )
} else {
  console.error('no video was produced')
}

// Windows can still hold the handle briefly after the context closes, and a
// leftover temp directory is not worth failing the run over.
await rm('.demo-tmp', { recursive: true, force: true }).catch(() => {})
