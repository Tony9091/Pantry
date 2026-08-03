/**
 * End-to-end check of the flows that change data.
 *
 * Builds the app, serves `dist` on a scratch port, drives it in a real browser
 * and asserts against what actually landed in localStorage — so a passing run
 * means the stock maths, not just the rendering, is correct.
 *
 *   npm run e2e
 */

import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium, devices } from 'playwright'

const PORT = 4178
const BASE = `http://127.0.0.1:${PORT}/`

/* ------------------------------------------------------------ preview server */

const server = spawn(
  'npx',
  ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1'],
  { stdio: 'ignore' },
)

const shutdown = () => server.kill('SIGTERM')
process.on('exit', shutdown)
process.on('SIGINT', () => {
  shutdown()
  process.exit(130)
})

// Wait for the port to answer rather than guessing at a fixed delay.
let ready = false
for (let i = 0; i < 60; i++) {
  try {
    const res = await fetch(BASE)
    if (res.ok) {
      ready = true
      break
    }
  } catch {
    // Not listening yet.
  }
  await sleep(250)
}
if (!ready) {
  console.error(`Preview server never came up on ${BASE} — run \`npm run build\` first.`)
  process.exit(1)
}

/* -------------------------------------------------------------------- setup */

const browser = await chromium.launch({
  // Set by the container image; falls back to Playwright's own lookup.
  executablePath: process.env.CHROMIUM_PATH || undefined,
})
const context = await browser.newContext({ ...devices['iPhone 13'] })
const page = await context.newPage()

const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`))

const readDb = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('pantry.db.v1') ?? '{}').state.db)

const amountOf = (db, productId) =>
  db.stock.filter((s) => s.productId === productId).reduce((a, b) => a + b.amount, 0)

const checks = []
function check(name, pass, detail = '') {
  checks.push({ name, pass })
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
}

const loadDemo = async () => {
  await page.goto(`${BASE}#/settings`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Load demo data' }).click()
  await page.getByRole('button', { name: 'Load demo', exact: true }).click()
  await page.waitForTimeout(400)
}

/* -------------------------------------------------------------------- tests */

await page.goto(BASE, { waitUntil: 'networkidle' })

// Creating a product, then stocking it.
await page.goto(`${BASE}#/stock`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'New product' }).first().click()
await page.getByPlaceholder('e.g. Olive Oil').fill('Test Lentils')
await page.getByRole('button', { name: 'Save' }).click()
await page.waitForTimeout(400)

let db = await readDb()
const product = db.products.find((p) => p.name === 'Test Lentils')
check('product is created', Boolean(product))
check('opens the new product', page.url().includes('#/stock/'))

await page.getByRole('button', { name: 'Add stock' }).click()
await page.getByRole('button', { name: 'Increase' }).click()
await page.getByRole('button', { name: 'Increase' }).click()
await page.getByRole('button', { name: 'Add to stock' }).click()
await page.waitForTimeout(400)
db = await readDb()
check('stock is added', amountOf(db, product.id) === 3, `${amountOf(db, product.id)} of 3`)
check(
  'purchase is logged',
  db.stockLog.some((l) => l.productId === product.id && l.action === 'purchase'),
)

// Consuming deducts from stock.
await page.getByRole('button', { name: 'Use', exact: true }).click()
await page.getByRole('button', { name: 'Increase' }).click()
await page.getByRole('button', { name: 'Use', exact: true }).last().click()
await page.waitForTimeout(400)
db = await readDb()
check('consuming deducts', amountOf(db, product.id) === 1, `${amountOf(db, product.id)} of 1`)

// Shopping: add, tick, and move into stock.
await page.goto(`${BASE}#/shopping`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Add item' }).first().click()
await page.getByRole('combobox').first().selectOption({ label: 'Test Lentils' })
await page.getByRole('button', { name: 'Add', exact: true }).click()
await page.waitForTimeout(300)
await page.getByRole('button', { name: /Mark Test Lentils as picked up/ }).click()
await page.waitForTimeout(200)
await page.getByRole('button', { name: /Complete purchase/ }).click()
await page.waitForTimeout(400)
db = await readDb()
check('completing a purchase stocks it', amountOf(db, product.id) === 2)
check('completed rows leave the list', !db.shoppingItems.some((i) => i.name === 'Test Lentils'))

// Cooking a recipe deducts its ingredients.
await loadDemo()
db = await readDb()
const cansBefore = amountOf(db, 'prod_tomatocan')
await page.goto(`${BASE}#/recipes/rec_pasta`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Cook this' }).click()
await page.getByRole('button', { name: 'Cook', exact: true }).click()
await page.waitForTimeout(500)
db = await readDb()
check(
  'cooking deducts ingredients',
  amountOf(db, 'prod_tomatocan') === cansBefore - 2,
  `${cansBefore} -> ${amountOf(db, 'prod_tomatocan')}`,
)

// Below-minimum products land on the shopping list.
await page.goto(`${BASE}#/shopping`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Add missing' }).first().click()
await page.waitForTimeout(400)
db = await readDb()
check(
  'below-minimum products are added',
  db.shoppingItems.some((i) => i.auto && i.productId === 'prod_banana'),
)

// Chore tracking sets today's date.
await page.goto(`${BASE}#/chores`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /Mark Take out the recycling done/ }).click()
await page.waitForTimeout(400)
db = await readDb()
const today = new Date().toLocaleDateString('sv') // sv gives YYYY-MM-DD in local time
check(
  'tracking a chore sets the date',
  db.chores.find((c) => c.name === 'Take out the recycling').lastDone === today,
)

// Meal planning.
await page.goto(`${BASE}#/plan`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: '+ Add' }).first().click()
await page.getByRole('combobox').nth(1).selectOption({ label: 'Cheese Omelette' })
await page.getByRole('button', { name: 'Save' }).click()
await page.waitForTimeout(400)
db = await readDb()
check('meal plan entries save', db.mealPlan.some((e) => e.recipeId === 'rec_omelette'))

// Data survives a reload.
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(400)
db = await readDb()
check('data survives a reload', db.products.length === 19, `${db.products.length} products`)

/* ------------------------------------------------------------------ results */

await browser.close()
server.kill('SIGTERM')

const failed = checks.filter((c) => !c.pass)
if (errors.length) {
  console.log('\nRuntime errors:')
  for (const e of [...new Set(errors)]) console.log(` - ${e}`)
}
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
process.exit(failed.length || errors.length ? 1 : 0)
