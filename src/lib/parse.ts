/** The universal input parser.
 *
 *  One field, anything pasted into it. This turns free text — a typed line, a
 *  shopping list, a block of receipt text, a chunk of spreadsheet — into
 *  structured items, so the app never asks for eight fields when a person can
 *  just write "2 jars peanut butter $4.50 from Mr Grocery".
 *
 *  Everything here is pure and offline: no network, no model, no API key.
 */

import type { Database, ID } from '../types'

export interface ParsedItem {
  /** Stable key for React lists and edits. */
  key: string
  /** The original line, kept so a person can see what was interpreted. */
  raw: string
  name: string
  amount: number
  unitId?: ID
  /** Matched existing product, when the name resolves to one. */
  productId?: ID
  /** Total price for the line, not per unit. */
  price?: number
  storeId?: ID
  locationId?: ID
  /** ISO date. */
  bestBefore?: string
  /** Fields the parser actually found, for highlighting in the review list. */
  found: string[]
}

/* --------------------------------------------------------------- helpers */

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Common shorthand people actually type, mapped to canonical unit names. */
const UNIT_ALIASES: Record<string, string[]> = {
  gram: ['g', 'gr', 'gram', 'grams', 'gramme', 'grammes'],
  kilogram: ['kg', 'kilo', 'kilos', 'kilogram', 'kilograms'],
  millilitre: ['ml', 'millilitre', 'millilitres', 'milliliter', 'milliliters'],
  litre: ['l', 'lt', 'ltr', 'litre', 'litres', 'liter', 'liters'],
  piece: ['pc', 'pcs', 'piece', 'pieces', 'ea', 'each', 'x'],
  pack: ['pk', 'pack', 'packs', 'packet', 'packets', 'pkg'],
  jar: ['jar', 'jars'],
  can: ['can', 'cans', 'tin', 'tins'],
  bottle: ['bottle', 'bottles', 'btl'],
  dozen: ['dozen', 'doz', 'dz'],
  tablespoon: ['tbsp', 'tablespoon', 'tablespoons'],
  teaspoon: ['tsp', 'teaspoon', 'teaspoons'],
  pound: ['lb', 'lbs', 'pound', 'pounds'],
  ounce: ['oz', 'ounce', 'ounces'],
  box: ['box', 'boxes'],
  bag: ['bag', 'bags'],
}

/** Resolves a written unit to one of the database's units. */
function matchUnit(token: string, db: Database): ID | undefined {
  const t = norm(token)
  if (!t) return undefined

  // Exact name or plural first — the user's own units win.
  for (const unit of db.units) {
    if (norm(unit.name) === t || norm(unit.plural) === t) return unit.id
  }
  // Then shorthand, mapped through the canonical name.
  for (const [canonical, aliases] of Object.entries(UNIT_ALIASES)) {
    if (!aliases.includes(t)) continue
    const unit = db.units.find((u) => norm(u.name) === canonical)
    if (unit) return unit.id
  }
  return undefined
}

/** Every token that could be a unit, longest first so "kg" beats "g". */
function unitTokens(db: Database): string[] {
  const tokens = new Set<string>()
  for (const unit of db.units) {
    tokens.add(norm(unit.name))
    tokens.add(norm(unit.plural))
  }
  for (const aliases of Object.values(UNIT_ALIASES)) {
    for (const a of aliases) tokens.add(a)
  }
  return [...tokens].filter(Boolean).sort((a, b) => b.length - a.length)
}

/** Fuzzy-matches free text against existing named records. */
function matchNamed<T extends { id: ID; name: string }>(
  text: string,
  items: T[],
): T | undefined {
  const t = norm(text)
  if (!t) return undefined

  let best: T | undefined
  let bestScore = 0
  let bestGap = Infinity

  for (const item of items) {
    const n = norm(item.name)
    if (!n) continue

    // An exact name beats a partial one, and among partials the closest in
    // length wins — otherwise "tomatoes" would resolve to "Chopped Tomatoes"
    // purely because that name is longer.
    let score = 0
    if (t === n) score = 3
    else if (n.startsWith(t) || t.startsWith(n)) score = 2
    else if (t.includes(n) || n.includes(t)) score = 1
    if (score === 0) continue

    const gap = Math.abs(n.length - t.length)
    if (score > bestScore || (score === bestScore && gap < bestGap)) {
      best = item
      bestScore = score
      bestGap = gap
    }
  }
  return best
}

let keySeq = 0

/* ------------------------------------------------------------ date parsing */

const MONTHS = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
]

function pad(n: number) {
  return String(n).padStart(2, '0')
}

/** Understands ISO, slash/dot dates, and "12 Aug" / "Aug 12 2026". */
function parseDateish(text: string): { iso: string; matched: string } | undefined {
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (iso) return { iso: iso[0], matched: iso[0] }

  const slash = text.match(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\b/)
  if (slash) {
    const a = Number(slash[1])
    const b = Number(slash[2])
    let year = Number(slash[3])
    if (year < 100) year += 2000
    // Month/day by default, which is what a US household writes. If the first
    // number is too big to be a month, it must be day-first instead.
    const month = a > 12 ? b : a
    const day = a > 12 ? a : b
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { iso: `${year}-${pad(month)}-${pad(day)}`, matched: slash[0] }
    }
  }

  const named = text.match(
    /\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(\d{4})?\b/i,
  )
  if (named) {
    const day = Number(named[1])
    const month = MONTHS.indexOf(named[2].toLowerCase()) + 1
    const year = named[3] ? Number(named[3]) : new Date().getFullYear()
    return { iso: `${year}-${pad(month)}-${pad(day)}`, matched: named[0] }
  }

  const namedFirst = text.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:,?\s*(\d{4}))?\b/i,
  )
  if (namedFirst) {
    const month = MONTHS.indexOf(namedFirst[1].toLowerCase()) + 1
    const day = Number(namedFirst[2])
    const year = namedFirst[3] ? Number(namedFirst[3]) : new Date().getFullYear()
    return { iso: `${year}-${pad(month)}-${pad(day)}`, matched: namedFirst[0] }
  }

  return undefined
}

/* ----------------------------------------------------------- line parsing */

/** Leftover keywords that aren't part of an item's name.
 *
 *  Deliberately narrow: stripping ordinary words like "of" and "the" would
 *  mangle real names — "Cream of Mushroom Soup" must survive intact. */
const STRIP_WORDS = /\b(exp(?:iry|ires|ired)?|best before|bb|use by|due|qty|quantity)\b/gi

/** Parses one line of free text into an item. */
export function parseLine(line: string, db: Database): ParsedItem | null {
  const raw = line.trim()
  if (!raw) return null
  // Skip receipt furniture like "TOTAL 24.50" or "SUBTOTAL".
  if (/^(total|subtotal|sub total|vat|tax|change|cash|card|balance|thank you)\b/i.test(raw)) {
    return null
  }

  let rest = raw
  const found: string[] = []

  // --- date -----------------------------------------------------------
  let bestBefore: string | undefined
  const date = parseDateish(rest)
  if (date) {
    bestBefore = date.iso
    found.push('date')
    rest = rest.replace(date.matched, ' ')
    // Drop the keyword that introduced it.
    rest = rest.replace(/\b(exp(?:iry|ires)?|best before|bb|use by|due)\b:?/gi, ' ')
  }

  // --- price ----------------------------------------------------------
  let price: number | undefined
  // A currency symbol is unambiguous, so try it before bare numbers.
  const symbol = rest.match(/([$£€¥])\s*(\d+(?:[.,]\d{1,2})?)/)
  const trailing = rest.match(/(\d+(?:[.,]\d{1,2})?)\s*([$£€¥]|usd|eur|gbp)\b/i)
  const marked = rest.match(/(?:@|for|costs?|price)\s*(\d+(?:[.,]\d{1,2})?)\b/i)
  // Last resort, and the shape a receipt line takes: "BANANAS 1.29". Requires
  // exactly two decimals and something before it, so a plain count like "3" or
  // a weight like "2.5 lb" is never mistaken for money.
  const bareTrailing = /[a-z]/i.test(rest) ? rest.match(/\s(\d+\.\d{2})\s*$/) : null
  const hit = symbol ?? trailing ?? marked ?? bareTrailing
  if (hit) {
    const numText = symbol ? hit[2] : hit[1]
    const value = Number(numText.replace(',', '.'))
    if (Number.isFinite(value)) {
      price = value
      found.push('price')
      rest = rest.replace(hit[0], ' ')
    }
  }

  // --- store ----------------------------------------------------------
  let storeId: ID | undefined
  const storePhrase = rest.match(/(?:from|@|at)\s+([A-Za-z][\w'&.\- ]{1,30})/i)
  if (storePhrase) {
    const store = matchNamed(storePhrase[1], db.stores)
    if (store) {
      storeId = store.id
      found.push('store')
      rest = rest.replace(storePhrase[0], ' ')
    }
  }
  if (!storeId) {
    const store = db.stores.find((s) => norm(rest).includes(norm(s.name)))
    if (store) {
      storeId = store.id
      found.push('store')
      rest = rest.replace(new RegExp(store.name, 'i'), ' ')
    }
  }

  // --- location -------------------------------------------------------
  let locationId: ID | undefined
  const location = db.locations.find((l) => {
    const n = norm(l.name)
    return n && new RegExp(`\\b${n}\\b`).test(norm(rest))
  })
  if (location) {
    locationId = location.id
    found.push('location')
    rest = rest.replace(new RegExp(`\\b${location.name}\\b`, 'i'), ' ')
  }

  // --- amount and unit -------------------------------------------------
  let amount = 1
  let unitId: ID | undefined
  const units = unitTokens(db)
  const unitAlternation = units.map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')

  // "2kg flour", "2 kg flour", "500 g pasta"
  const leading = new RegExp(`^\\s*(\\d+(?:[.,]\\d+)?)\\s*(${unitAlternation})?\\b`, 'i')
  // "flour 2kg", "pasta x3"
  const trailingQty = new RegExp(
    `\\b(?:x\\s*)?(\\d+(?:[.,]\\d+)?)\\s*(${unitAlternation})?\\s*$`,
    'i',
  )

  const lead = rest.match(leading)
  if (lead && lead[1]) {
    amount = Number(lead[1].replace(',', '.'))
    found.push('amount')
    if (lead[2]) {
      unitId = matchUnit(lead[2], db)
      if (unitId) found.push('unit')
    }
    rest = rest.slice(lead[0].length)
  } else {
    const tail = rest.match(trailingQty)
    if (tail && tail[1]) {
      amount = Number(tail[1].replace(',', '.'))
      found.push('amount')
      if (tail[2]) {
        unitId = matchUnit(tail[2], db)
        if (unitId) found.push('unit')
      }
      rest = rest.slice(0, tail.index)
    }
  }

  // A bare unit word left in the text, e.g. "peanut butter jars".
  if (!unitId) {
    for (const token of units) {
      const re = new RegExp(`\\b${token}\\b`, 'i')
      if (re.test(rest)) {
        const id = matchUnit(token, db)
        if (id) {
          unitId = id
          found.push('unit')
          rest = rest.replace(re, ' ')
          break
        }
      }
    }
  }

  // --- name -------------------------------------------------------------
  let name = rest
    .replace(STRIP_WORDS, ' ')
    .replace(/[|,;:]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-–—*•.]+|[\s\-–—*•.]+$/g, '')
    .trim()

  if (!name) return null

  // Receipts shout and people type in lower case; either way the product ends
  // up in a list, so give it a name that looks deliberate. Mixed-case input is
  // left alone — it was probably written that way on purpose.
  const shouting = name === name.toUpperCase()
  const whispering = name === name.toLowerCase()
  if ((shouting || whispering) && name.length > 2) {
    name = name.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase())
  }

  const product = matchNamed(name, db.products)
  if (product) {
    found.push('product')
    // Trust the product's own unit when the line didn't name one.
    if (!unitId) unitId = product.unitId
  }

  if (!Number.isFinite(amount) || amount <= 0) amount = 1

  return {
    key: `p${keySeq++}`,
    raw,
    name: product?.name ?? name,
    amount,
    unitId,
    productId: product?.id,
    price,
    storeId: storeId ?? product?.storeId,
    locationId: locationId ?? product?.locationId,
    bestBefore,
    found,
  }
}

/* ------------------------------------------------------- tabular parsing */

interface Column {
  index: number
  role: 'name' | 'amount' | 'unit' | 'price' | 'store' | 'date' | 'location' | 'ignore'
}

const HEADER_PATTERNS: [Column['role'], RegExp][] = [
  ['name', /^(name|product|item|description|artikel|title)$/i],
  ['amount', /^(amount|qty|quantity|count|number|menge)$/i],
  ['unit', /^(unit|units|uom|measure)$/i],
  ['price', /^(price|cost|total|amount paid|preis|value)$/i],
  ['store', /^(store|shop|vendor|supplier|market)$/i],
  ['date', /^(date|expiry|expires|best before|due|due date|bb)$/i],
  ['location', /^(location|place|where|storage)$/i],
]

/** Splits a row on tabs, or on commas/semicolons when there are no tabs. */
function splitRow(row: string): string[] {
  if (row.includes('\t')) return row.split('\t')
  if (/;/.test(row)) return row.split(';')
  if (/,/.test(row)) return row.split(',')
  return [row]
}

/** True when the text looks like a spreadsheet paste rather than prose. */
export function looksTabular(text: string): boolean {
  const lines = text.trim().split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return false
  if (lines.every((l) => l.includes('\t'))) return true
  // Consistent delimiter count across rows is the giveaway for CSV.
  const counts = lines.map((l) => (l.match(/[;,]/g) ?? []).length)
  return counts[0] > 0 && counts.every((c) => c === counts[0])
}

function parseTable(text: string, db: Database): ParsedItem[] {
  const rows = text.trim().split(/\r?\n/).filter((r) => r.trim())
  if (rows.length === 0) return []

  const firstCells = splitRow(rows[0]).map((c) => c.trim())
  let columns: Column[] = []
  let bodyStart = 0

  // Header row present?
  const headerHits = firstCells.map((cell) => {
    for (const [role, re] of HEADER_PATTERNS) if (re.test(cell)) return role
    return undefined
  })
  if (headerHits.filter(Boolean).length >= 2) {
    columns = headerHits.map((role, index) => ({ index, role: role ?? 'ignore' }))
    bodyStart = 1
  } else {
    // No header — infer from the shape of the first data row.
    columns = firstCells.map((cell, index) => {
      const t = cell.trim()
      if (/^\d+(?:[.,]\d+)?$/.test(t)) return { index, role: 'amount' as const }
      if (/^[$£€]/.test(t)) return { index, role: 'price' as const }
      return { index, role: 'ignore' as const }
    })
    // The longest text column is the name.
    let nameIdx = 0
    let longest = -1
    firstCells.forEach((cell, i) => {
      if (columns[i].role === 'ignore' && cell.trim().length > longest) {
        longest = cell.trim().length
        nameIdx = i
      }
    })
    if (columns[nameIdx]) columns[nameIdx].role = 'name'
  }

  // Without a name column there's nothing to build an item from.
  if (!columns.some((c) => c.role === 'name')) {
    columns.forEach((c) => {
      if (c.index === 0) c.role = 'name'
    })
  }

  const out: ParsedItem[] = []
  for (const row of rows.slice(bodyStart)) {
    const cells = splitRow(row).map((c) => c.trim())
    if (cells.every((c) => !c)) continue

    const get = (role: Column['role']) => {
      const col = columns.find((c) => c.role === role)
      return col ? (cells[col.index] ?? '') : ''
    }

    const name = get('name')
    if (!name) continue
    // A repeated header inside the body isn't a product.
    if (HEADER_PATTERNS.some(([, re]) => re.test(name))) continue

    const found: string[] = []
    const amountText = get('amount')
    let amount = Number(amountText.replace(',', '.'))
    if (!Number.isFinite(amount) || amount <= 0) amount = 1
    else found.push('amount')

    const priceText = get('price').replace(/[^\d.,]/g, '').replace(',', '.')
    const price = priceText ? Number(priceText) : undefined
    if (price !== undefined && Number.isFinite(price)) found.push('price')

    const unitId = matchUnit(get('unit'), db)
    if (unitId) found.push('unit')

    const store = matchNamed(get('store'), db.stores)
    if (store) found.push('store')

    const location = matchNamed(get('location'), db.locations)
    if (location) found.push('location')

    const date = parseDateish(get('date'))
    if (date) found.push('date')

    const product = matchNamed(name, db.products)
    if (product) found.push('product')

    out.push({
      key: `p${keySeq++}`,
      raw: row,
      name: product?.name ?? name,
      amount,
      unitId: unitId ?? product?.unitId,
      productId: product?.id,
      price: price !== undefined && Number.isFinite(price) ? price : undefined,
      storeId: store?.id ?? product?.storeId,
      locationId: location?.id ?? product?.locationId,
      bestBefore: date?.iso,
      found,
    })
  }
  return out
}

/* -------------------------------------------------------------- entry point */

/** Parses anything pasted or typed into the universal field. */
export function parseInput(text: string, db: Database): ParsedItem[] {
  if (!text.trim()) return []

  if (looksTabular(text)) {
    const table = parseTable(text, db)
    if (table.length > 0) return table
  }

  // Prose separated by commas on a single line is a list, not one item.
  const lines =
    text.includes('\n') || !text.includes(',')
      ? text.split(/\r?\n/)
      : text.split(',')

  const out: ParsedItem[] = []
  for (const line of lines) {
    const item = parseLine(line, db)
    if (item) out.push(item)
  }
  return out
}
