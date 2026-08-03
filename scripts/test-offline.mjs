/**
 * Verifies the app actually works with no network.
 *
 * This exists because "it's a PWA, it works offline" was true of the manifest
 * and false of the app: a service worker does not control the page that
 * registers it, so on a first visit the hashed JS and CSS never entered the
 * cache and an offline reload rendered a blank page. Nothing in a normal test
 * run catches that — the failure only appears with the network switched off.
 *
 *   npm run test:offline
 */

import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright'

const PORT = 4189
const BASE = `http://127.0.0.1:${PORT}/`

const server = spawn(
  'npx',
  ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1'],
  { stdio: 'ignore' },
)
process.on('exit', () => server.kill('SIGTERM'))

let up = false
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(BASE)).ok) {
      up = true
      break
    }
  } catch {
    // Not listening yet.
  }
  await sleep(250)
}
if (!up) {
  console.error('Preview server never came up — run `npm run build` first.')
  process.exit(1)
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
})
const context = await browser.newContext()
const page = await context.newPage()

const checks = []
const check = (name, pass, detail = '') => {
  checks.push(pass)
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
}

// One ordinary visit, exactly what a first-time user does.
await page.goto(BASE, { waitUntil: 'networkidle' })
const swState = await page.evaluate(async () => {
  if (!('serviceWorker' in navigator)) return 'unsupported'
  const reg = await navigator.serviceWorker.ready.catch(() => null)
  return reg ? 'ready' : 'none'
})
check('service worker registers', swState === 'ready', swState)

await page.waitForTimeout(1500)

// Everything the page needs must be cached after that single visit.
const cached = await page.evaluate(async () => {
  const names = await caches.keys()
  const urls = []
  for (const n of names) {
    const c = await caches.open(n)
    urls.push(...(await c.keys()).map((r) => new URL(r.url).pathname))
  }
  return urls
})
check(
  'javascript is precached on the first visit',
  cached.some((u) => u.endsWith('.js')),
  cached.join(' '),
)
check('stylesheet is precached on the first visit', cached.some((u) => u.endsWith('.css')))

// Cut the network completely.
await context.setOffline(true)

await page.reload({ waitUntil: 'load' })
await page.waitForTimeout(1200)
const rendered = await page.evaluate(() => (document.querySelector('#root')?.children.length ?? 0) > 0)
check('app renders after an offline reload', rendered)

const heading = await page.locator('.topbar h1').first().innerText().catch(() => '')
check('a real screen is shown', heading.length > 0, JSON.stringify(heading))

// Data written offline must survive.
// Same-document navigation; a full goto would race the offline reload.
await page.evaluate(() => {
  location.hash = '/settings'
})
await page.waitForTimeout(800)
await page.getByRole('button', { name: 'Load demo data' }).click()
await page.getByRole('button', { name: 'Load demo', exact: true }).click()
await page.waitForTimeout(600)
await page.reload({ waitUntil: 'load' })
await page.waitForTimeout(900)
const products = await page.evaluate(
  () => JSON.parse(localStorage.getItem('pantry.db.v1') ?? '{}').state?.db?.products?.length ?? 0,
)
check('data written offline survives a reload', products === 19, `${products} products`)

await browser.close()
server.kill('SIGTERM')

const failed = checks.filter((c) => !c).length
console.log(`\n${checks.length - failed}/${checks.length} checks passed`)
process.exit(failed ? 1 : 0)
