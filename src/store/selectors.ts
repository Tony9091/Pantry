/** Pure derivations over the database. Kept out of the store so they can be
 *  unit-reasoned about and reused by any view. */

import type {
  Chore,
  Database,
  ID,
  MealPlanEntry,
  Product,
  Recipe,
  StockEntry,
} from '../types'
import { addDays, daysUntil, isoDate, sum } from '../lib/util'
import { hasIntrinsicMeasure, unitCost, type UnitCost } from '../lib/units'

export interface ProductStock {
  product: Product
  total: number
  entries: StockEntry[]
  /** Earliest best-before across all batches, if any batch has one. */
  nextExpiry?: string
  /** total < minStock, and minStock is enabled. */
  belowMin: boolean
  shortfall: number
  /** Total value of everything currently in stock for this product. */
  value: number
}

export type ExpiryStatus = 'expired' | 'soon' | 'ok' | 'none'

export function expiryStatus(
  bestBefore: string | undefined,
  warnDays: number,
  isFreezer = false,
): ExpiryStatus {
  if (!bestBefore) return 'none'
  // Frozen food keeps far past its fridge date; don't nag about it.
  if (isFreezer) return 'ok'
  const days = daysUntil(bestBefore)
  if (days < 0) return 'expired'
  if (days <= warnDays) return 'soon'
  return 'ok'
}

export function productStock(db: Database): Map<ID, ProductStock> {
  const byProduct = new Map<ID, ProductStock>()
  for (const product of db.products) {
    byProduct.set(product.id, {
      product,
      total: 0,
      entries: [],
      belowMin: product.minStock > 0,
      shortfall: product.minStock,
      value: 0,
    })
  }
  for (const entry of db.stock) {
    const row = byProduct.get(entry.productId)
    if (!row) continue
    row.entries.push(entry)
    row.total += entry.amount
    row.value += entry.price ?? 0
    if (entry.bestBefore && (!row.nextExpiry || entry.bestBefore < row.nextExpiry)) {
      row.nextExpiry = entry.bestBefore
    }
  }
  for (const row of byProduct.values()) {
    row.shortfall = Math.max(0, row.product.minStock - row.total)
    row.belowMin = row.product.minStock > 0 && row.total < row.product.minStock
    row.entries.sort((a, b) => (a.bestBefore ?? '9999').localeCompare(b.bestBefore ?? '9999'))
  }
  return byProduct
}

export function totalAmountOf(db: Database, productId: ID): number {
  return sum(db.stock.filter((e) => e.productId === productId).map((e) => e.amount))
}

export interface ExpiringEntry {
  entry: StockEntry
  product: Product
  status: ExpiryStatus
  days: number
}

/** Batches that are expired or inside the warning window, soonest first. */
export function expiringEntries(db: Database): ExpiringEntry[] {
  const freezerIds = new Set(db.locations.filter((l) => l.isFreezer).map((l) => l.id))
  const products = new Map(db.products.map((p) => [p.id, p]))
  const rows: ExpiringEntry[] = []
  for (const entry of db.stock) {
    if (!entry.bestBefore) continue
    const product = products.get(entry.productId)
    if (!product) continue
    const inFreezer = entry.locationId ? freezerIds.has(entry.locationId) : false
    const status = expiryStatus(entry.bestBefore, db.settings.expiryWarnDays, inFreezer)
    if (status === 'expired' || status === 'soon') {
      rows.push({ entry, product, status, days: daysUntil(entry.bestBefore) })
    }
  }
  return rows.sort((a, b) => a.days - b.days)
}

/** Products at or below their minimum stock level. */
export function missingProducts(db: Database): ProductStock[] {
  return [...productStock(db).values()]
    .filter((row) => row.belowMin)
    .sort((a, b) => a.product.name.localeCompare(b.product.name))
}

export interface IngredientAvailability {
  ingredientId: ID
  name: string
  needed: number
  have: number
  /** Untracked (free-text) ingredients are always assumed available. */
  tracked: boolean
  optional: boolean
  enough: boolean
  unitId?: ID
}

export interface RecipeAvailability {
  ingredients: IngredientAvailability[]
  /** True when every required, tracked ingredient is fully in stock. */
  canCook: boolean
  missingCount: number
}

export function recipeAvailability(
  db: Database,
  recipe: Recipe,
  servings?: number,
): RecipeAvailability {
  const factor = (servings ?? recipe.servings) / (recipe.servings || 1)
  const stock = productStock(db)
  const ingredients = recipe.ingredients.map((ing) => {
    const needed = ing.amount * factor
    const tracked = Boolean(ing.productId)
    const have = ing.productId ? (stock.get(ing.productId)?.total ?? 0) : 0
    return {
      ingredientId: ing.id,
      name: ing.name,
      needed,
      have,
      tracked,
      optional: ing.optional,
      // Small epsilon so 0.30000000000000004 >= 0.3 still counts.
      enough: !tracked || have + 1e-6 >= needed,
      unitId: ing.unitId,
    }
  })
  const blocking = ingredients.filter((i) => i.tracked && !i.optional && !i.enough)
  return { ingredients, canCook: blocking.length === 0, missingCount: blocking.length }
}

/** Recipes you could cook right now, best-stocked first. */
export function cookableRecipes(db: Database): Recipe[] {
  return db.recipes.filter((r) => r.ingredients.length > 0 && recipeAvailability(db, r).canCook)
}

const PERIOD_DAYS: Record<Chore['periodType'], number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
  yearly: 365,
  manually: 0,
}

export interface ChoreStatus {
  chore: Chore
  /** Undefined for manual chores and chores never done. */
  nextDue?: string
  overdue: boolean
  dueToday: boolean
}

export function choreStatus(chore: Chore): ChoreStatus {
  if (chore.periodType === 'manually' || !chore.lastDone) {
    // Never-tracked scheduled chores are due immediately.
    const due = chore.periodType === 'manually' ? undefined : isoDate()
    return {
      chore,
      nextDue: due,
      overdue: false,
      dueToday: Boolean(due),
    }
  }
  const span = PERIOD_DAYS[chore.periodType] * Math.max(1, chore.periodInterval)
  const nextDue = addDays(chore.lastDone, span)
  const days = daysUntil(nextDue)
  return { chore, nextDue, overdue: days < 0, dueToday: days === 0 }
}

export function choresDue(db: Database): ChoreStatus[] {
  return db.chores
    .map(choreStatus)
    .filter((s) => s.overdue || s.dueToday)
    .sort((a, b) => (a.nextDue ?? '').localeCompare(b.nextDue ?? ''))
}

export function mealPlanFor(db: Database, date: string): MealPlanEntry[] {
  const order = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 }
  return db.mealPlan
    .filter((e) => e.date === date)
    .sort((a, b) => order[a.mealType] - order[b.mealType])
}

/** Total value of everything currently in stock. */
export function inventoryValue(db: Database): number {
  return sum(db.stock.map((e) => e.price ?? 0))
}

/* ------------------------------------------------------- product statistics */

export interface PricePoint {
  date: string
  storeId?: ID
  /** Price per single unit, not per purchase. */
  unitPrice: number
}

export interface ProductStats {
  total: number
  /** How much of what's in stock sits in opened packages. */
  openedAmount: number
  /** Value of everything currently in stock. */
  stockValue: number
  lastPurchased?: string
  lastUsed?: string
  /** Per-unit price of the most recent purchase that recorded one. */
  lastUnitPrice?: number
  /** Mean per-unit price across all purchases that recorded one. */
  averageUnitPrice?: number
  /** Mean days between purchase and best-before. */
  averageShelfLifeDays?: number
  /** Share of everything that left stock which was thrown away, 0–1. */
  spoilRate?: number
  totalPurchased: number
  totalConsumed: number
  totalSpoiled: number
  priceHistory: PricePoint[]
  /** Most recent purchase expressed per pound, fluid ounce, or each. */
  lastUnitCost?: UnitCost
  /** Mean of every priced purchase, on the same basis. */
  averageUnitCost?: UnitCost
  /** True when the product is sold by the package and hasn't said how much
   *  is in one — the app can't do the maths until it knows. */
  needsPackageSize: boolean
}

/** The figures behind the product statistics panel.
 *
 *  Money is stored per purchase, so anything shown "per unit" is divided by the
 *  amount bought — otherwise buying a 2 kg bag would look twice as expensive as
 *  a 1 kg one. */
export function productStats(db: Database, productId: ID): ProductStats {
  const entries = db.stock.filter((e) => e.productId === productId)
  const logs = db.stockLog.filter((l) => l.productId === productId)

  const purchases = logs.filter((l) => l.action === 'purchase')
  const consumed = sum(logs.filter((l) => l.action === 'consume').map((l) => Math.abs(l.amount)))
  const spoiled = sum(logs.filter((l) => l.action === 'spoil').map((l) => Math.abs(l.amount)))
  const purchasedTotal = sum(purchases.map((l) => Math.abs(l.amount)))

  const priced = purchases.filter((l) => l.price !== undefined && l.amount > 0)
  const unitPrices = priced.map((l) => (l.price as number) / l.amount)

  const shelfLives = purchases
    .map((l) => l.shelfLifeDays)
    .filter((d): d is number => typeof d === 'number')

  const lastUsedLog = logs.find((l) => l.action === 'consume' || l.action === 'spoil')
  const leftStock = consumed + spoiled

  const product = db.products.find((p) => p.id === productId)
  const basis = { mass: db.settings.costPerWeight, volume: db.settings.costPerVolume }

  // Cost per base unit, averaged across purchases rather than averaging the
  // per-unit prices — a 16 oz buy should weigh twice as much as an 8 oz one.
  let lastUnitCost: UnitCost | undefined
  let averageUnitCost: UnitCost | undefined
  if (product) {
    const costs = priced
      .map((l) => unitCost(db, product, l.price as number, l.amount, basis))
      .filter((c): c is UnitCost => Boolean(c))
    lastUnitCost = costs[0]
    if (costs.length > 0) {
      averageUnitCost = {
        value: sum(costs.map((c) => c.value)) / costs.length,
        label: costs[0].label,
      }
    }
  }

  return {
    lastUnitCost,
    averageUnitCost,
    needsPackageSize: product
      ? !hasIntrinsicMeasure(db, product) && !product.packageSize
      : false,
    total: sum(entries.map((e) => e.amount)),
    openedAmount: sum(entries.filter((e) => e.openedAt).map((e) => e.amount)),
    stockValue: sum(entries.map((e) => e.price ?? 0)),
    lastPurchased: purchases[0]?.ts,
    lastUsed: lastUsedLog?.ts,
    // stockLog is newest-first, so the first priced purchase is the latest.
    lastUnitPrice: unitPrices[0],
    averageUnitPrice: unitPrices.length ? sum(unitPrices) / unitPrices.length : undefined,
    averageShelfLifeDays: shelfLives.length
      ? Math.round(sum(shelfLives) / shelfLives.length)
      : undefined,
    spoilRate: leftStock > 0 ? spoiled / leftStock : undefined,
    totalPurchased: purchasedTotal,
    totalConsumed: consumed,
    totalSpoiled: spoiled,
    priceHistory: priced
      .map((l) => ({
        date: l.ts,
        storeId: l.storeId,
        unitPrice: (l.price as number) / l.amount,
      }))
      // Oldest first, so the chart reads left to right.
      .reverse(),
  }
}

export interface Lookups {
  unitName: (id: ID | undefined, amount: number) => string
  locationName: (id: ID | undefined) => string
  groupName: (id: ID | undefined) => string
  storeName: (id: ID | undefined) => string
  productName: (id: ID | undefined) => string
  isFreezer: (id: ID | undefined) => boolean
}

/** Name resolvers used all over the UI; built once per render from the db. */
export function makeLookups(db: Database): Lookups {
  const units = new Map(db.units.map((u) => [u.id, u]))
  const locations = new Map(db.locations.map((l) => [l.id, l]))
  const groups = new Map(db.groups.map((g) => [g.id, g]))
  const stores = new Map(db.stores.map((s) => [s.id, s]))
  const products = new Map(db.products.map((p) => [p.id, p]))
  return {
    unitName: (id, amount) => {
      const unit = id ? units.get(id) : undefined
      if (!unit) return ''
      return Math.abs(amount) === 1 ? unit.name : unit.plural
    },
    locationName: (id) => (id ? (locations.get(id)?.name ?? '') : ''),
    groupName: (id) => (id ? (groups.get(id)?.name ?? '') : 'Ungrouped'),
    storeName: (id) => (id ? (stores.get(id)?.name ?? '') : ''),
    productName: (id) => (id ? (products.get(id)?.name ?? '') : ''),
    isFreezer: (id) => (id ? (locations.get(id)?.isFreezer ?? false) : false),
  }
}
