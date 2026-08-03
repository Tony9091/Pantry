/**
 * Tests for the universal input parser.
 *
 * The parser is the part of the app most likely to quietly get something
 * wrong — a misread amount or price is worse than a rejected input, because
 * nobody notices. These run against the real demo database.
 *
 *   npm run test:parse
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// The parser and seed are TypeScript; compile just those to a temp dir.
const out = mkdtempSync(join(tmpdir(), 'pantry-parse-'))
try {
  execFileSync(
    'npx',
    [
      'tsc',
      'src/lib/parse.ts',
      'src/lib/util.ts',
      'src/lib/ocr.ts',
      'src/lib/units.ts',
      'src/store/seed.ts',
      '--outDir', out,
      '--module', 'esnext',
      '--target', 'es2020',
      '--moduleResolution', 'bundler',
      '--skipLibCheck',
      '--ignoreConfig',
    ],
    { stdio: 'inherit' },
  )
} catch {
  // tsc exits non-zero on type errors it still emitted output for.
}

// tsc emits extensionless relative imports, which Node's ESM loader rejects.
const fs = await import('node:fs')
for (const rel of ['lib/parse.js', 'lib/util.js', 'lib/ocr.js', 'lib/units.js', 'store/seed.js']) {
  const p = join(out, rel)
  let s = fs.readFileSync(p, 'utf8')
  s = s.replace(/from '(\.\.?\/[^']+)'/g, (_, spec) =>
    spec.endsWith('.js') ? `from '${spec}'` : `from '${spec}.js'`,
  )
  fs.writeFileSync(p, s)
}

const { parseInput, parseLine } = await import(pathToFileURL(join(out, 'lib/parse.js')).href)
const { createDemoDatabase } = await import(pathToFileURL(join(out, 'store/seed.js')).href)

const db = createDemoDatabase()
const unit = (id) => db.units.find((u) => u.id === id)?.name
const store = (id) => db.stores.find((s) => s.id === id)?.name

let pass = 0
const failures = []

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) pass++
  else failures.push({ name, actual, expected })
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}`)
  if (!ok) console.log(`        got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`)
}

/* ------------------------------------------------------------ single lines */

let r = parseLine('2 gallons milk', db)
check('amount + unit + known product', [r.amount, unit(r.unitId), r.name], [2, 'Gallon', 'Milk'])

r = parseLine('3 bananas', db)
check('bare amount + plural name', [r.amount, r.name], [3, 'Bananas'])

r = parseLine('12 oz cheddar cheese $6.75 from Supermarket', db)
check(
  'amount, unit, price and store',
  [r.amount, unit(r.unitId), r.price, store(r.storeId)],
  [12, 'Ounce', 6.75, 'Supermarket'],
)

r = parseLine('chicken breast 2 lb', db)
check('trailing amount + unit', [r.amount, unit(r.unitId), r.name], [2, 'Pound', 'Chicken Breast'])

r = parseLine('milk exp 2026-08-10', db)
check('ISO expiry date', [r.name, r.bestBefore], ['Milk', '2026-08-10'])

r = parseLine('eggs best before Aug 12 2026', db)
check('written month date', [r.name, r.bestBefore], ['Eggs', '2026-08-12'])

r = parseLine('bread 12/24/2026', db)
check('slash date', r.bestBefore, '2026-12-24')

r = parseLine('2 jars peanut butter for 4.50', db)
check(
  'price after "for"',
  [r.amount, unit(r.unitId), r.price, r.name],
  [2, 'Jar', 4.5, 'Peanut Butter'],
)

r = parseLine('apples x4', db)
check('x-prefixed quantity', [r.amount, r.name], [4, 'Apples'])

r = parseLine('TOTAL 24.50', db)
check('receipt total is skipped', r, null)

r = parseLine('  ', db)
check('blank line is skipped', r, null)

r = parseLine('tomatoes in fridge', db)
check('location word is picked out', [r.name, Boolean(r.locationId)], ['Tomatoes', true])

r = parseLine('SOURDOUGH BREAD', db)
check('shouty receipt text is title-cased', r.name, 'Sourdough Bread')

r = parseLine('something nobody has heard of', db)
check('unknown item still parses', [r.name, r.productId], ['Something Nobody Has Heard Of', undefined])

r = parseLine('paper towels x2', db)
check('new lower-case name is tidied up', [r.name, r.amount], ['Paper Towels', 2])

r = parseLine('iPhone charger', db)
check('deliberate mixed case is left alone', r.name, 'iPhone charger')

/* ------------------------------------------------------------ multi-line */

let items = parseInput('3 bananas\n1 loaf bread\n2 dozen eggs', db)
check('one item per line', items.map((i) => [i.amount, i.name]), [
  [3, 'Bananas'],
  [1, 'Sourdough Bread'],
  [2, 'Eggs'],
])

items = parseInput('milk, bread, eggs', db)
check('comma list on one line', items.length, 3)

/* -------------------------------------------------------------- tabular */

items = parseInput(
  'Name\tQty\tUnit\tPrice\nApples\t6\tPiece\t4.20\nMilk\t1\tGallon\t4.29',
  db,
)
check('excel paste with headers', items.map((i) => [i.name, i.amount, unit(i.unitId), i.price]), [
  ['Apples', 6, 'Piece', 4.2],
  ['Milk', 1, 'Gallon', 4.29],
])

items = parseInput('Apples,6,4.20\nBananas,3,1.50', db)
check('csv without headers', items.map((i) => [i.name, i.amount]), [
  ['Apples', 6],
  ['Bananas', 3],
])

items = parseInput('Product;Amount;Store\nCoffee Beans;2;Mr. Grocery', db)
check(
  'semicolon csv with store column',
  items.map((i) => [i.name, i.amount, store(i.storeId)]),
  [['Coffee Beans', 2, 'Mr. Grocery']],
)

/* ------------------------------------------------------------- receipts */

items = parseInput(
  ['SUPERMARKET', 'BANANAS 1.29', 'MILK 4.29', 'SOURDOUGH BREAD 5.50', 'SUBTOTAL 11.08', 'TOTAL 11.08'].join('\n'),
  db,
)
check(
  'receipt block skips totals and reads prices',
  items.map((i) => [i.name, i.price]),
  [
    ['Bananas', 1.29],
    ['Milk', 4.29],
    ['Sourdough Bread', 5.5],
  ],
)

/* ------------------------------------------------------------ ocr output */

// Real recognition output, captured from a photographed receipt: blank lines,
// column gaps, and a line of till noise with no letters in it.
const { cleanOcrText } = await import(pathToFileURL(join(out, 'lib/ocr.js')).href)

const rawOcr = [
  'SUPERMARKET',
  '',
  'BANANAS      1.29',
  'MILK    4.29',
  '||||||||||||',
  '0294 1123 8891',
  'SOURDOUGH BREAD   5.50',
  'X',
  'TOTAL   11.08',
].join('\n')

check(
  'ocr noise is stripped',
  cleanOcrText(rawOcr).split('\n'),
  ['SUPERMARKET', 'BANANAS 1.29', 'MILK 4.29', 'SOURDOUGH BREAD 5.50', 'TOTAL 11.08'],
)

items = parseInput(cleanOcrText(rawOcr), db)
check(
  'cleaned ocr parses into items',
  items.map((i) => [i.name, i.price]),
  [
    ['Bananas', 1.29],
    ['Milk', 4.29],
    ['Sourdough Bread', 5.5],
  ],
)

/* ------------------------------------------------------------ unit costs */

const { unitCost, toBase } = await import(pathToFileURL(join(out, 'lib/units.js')).href)
const basis = { mass: 'lb', volume: 'floz' }
const prod = (id) => db.products.find((p) => p.id === id)
const round = (n, d = 4) => (n === undefined ? undefined : Math.round(n * 10 ** d) / 10 ** d)

// Sold by weight already: 12 oz for $6.75 is $9.00 a pound.
let c = unitCost(db, prod('prod_cheese'), 6.75, 12, basis)
check('weight converts to price per pound', [round(c.value, 2), c.label], [9, 'lb'])

// Sold by the package: a 12 oz bag of coffee at $14.
c = unitCost(db, prod('prod_coffee'), 14, 1, basis)
check('package size converts to price per pound', [round(c.value, 2), c.label], [18.67, 'lb'])

// Buying two bags shouldn't change the per-pound price.
const two = unitCost(db, prod('prod_coffee'), 28, 2, basis)
check('per-unit cost is independent of how many were bought', round(two.value, 2), round(c.value, 2))

// Volume: a gallon of milk at $4.29.
c = unitCost(db, prod('prod_milk'), 4.29, 1, basis)
check('volume converts to price per fluid ounce', [round(c.value, 4), c.label], [0.0335, 'fl oz'])

// The basis is configurable.
c = unitCost(db, prod('prod_milk'), 4.29, 1, { mass: 'lb', volume: 'gallon' })
check('volume basis is respected', [round(c.value, 2), c.label], [4.29, 'gal'])

c = unitCost(db, prod('prod_cheese'), 6.75, 12, { mass: 'oz', volume: 'floz' })
check('weight basis is respected', [round(c.value, 4), c.label], [0.5625, 'oz'])

// Countable things report per item, and a dozen is twelve of them.
c = unitCost(db, prod('prod_banana'), 3, 6, basis)
check('countable goods price per item', [round(c.value, 2), c.label], [0.5, 'each'])

// A package measured in pieces still resolves to "each".
c = unitCost(db, prod('prod_eggs'), 5.99, 1, basis)
check('a dozen eggs prices per egg', [round(c.value, 4), c.label], [0.4992, 'each'])

// Nothing to go on: a bottle of unknown size can't be normalised.
const mystery = { ...prod('prod_soap'), packageSize: undefined, packageUnitId: undefined }
check('unknown package size yields no unit cost', unitCost(db, mystery, 3.5, 1, basis), undefined)

// Guard against nonsense input rather than emitting Infinity.
check('zero amount yields no unit cost', unitCost(db, prod('prod_cheese'), 5, 0, basis), undefined)
check('zero price yields no unit cost', unitCost(db, prod('prod_cheese'), 0, 5, basis), undefined)

// Conversion itself, independent of money.
check('a pound is 453.59 grams', round(toBase(db, prod('prod_chicken'), 1).base, 2), 453.59)

/* --------------------------------------------------------------- results */

rmSync(out, { recursive: true, force: true })
console.log(`\n${pass}/${pass + failures.length} checks passed`)
process.exit(failures.length ? 1 : 0)
