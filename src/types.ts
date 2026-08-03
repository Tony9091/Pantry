/** Core domain model. Everything is plain JSON so the whole database can be
 *  exported, backed up and re-imported as a single file. */

export type ID = string

/** A storage place: pantry shelf, fridge, freezer, garage… */
export interface Location {
  id: ID
  name: string
  /** Freezer contents are treated as long-life: expiry warnings are suppressed. */
  isFreezer: boolean
}

/** Unit of measure. `plural` is used when an amount != 1. */
export interface Unit {
  id: ID
  name: string
  plural: string
}

/** Product category used for grouping in stock and shopping views. */
export interface ProductGroup {
  id: ID
  name: string
}

/** A shop. Shopping list items can be grouped by where you buy them. */
export interface Store {
  id: ID
  name: string
}

export interface Product {
  id: ID
  name: string
  groupId?: ID
  /** Where this product normally lives. */
  locationId?: ID
  unitId: ID
  /** Where you usually buy it — drives shopping-list grouping. */
  storeId?: ID
  /** Below this total amount the product shows up as "missing". 0 disables. */
  minStock: number
  /** Days from purchase to best-before, used to pre-fill the purchase form. */
  defaultBestBeforeDays?: number
  barcode?: string
  note?: string
  createdAt: string
}

/** One physical batch of a product in stock. Multiple entries per product are
 *  normal — each purchase with its own best-before date is its own entry. */
export interface StockEntry {
  id: ID
  productId: ID
  amount: number
  /** ISO date (YYYY-MM-DD). Undefined means "never expires". */
  bestBefore?: string
  locationId?: ID
  purchasedAt: string
  /** Set when the package has been opened. */
  openedAt?: string
  /** Price paid for the whole batch, in the configured currency. */
  price?: number
}

export type StockAction = 'purchase' | 'consume' | 'open' | 'spoil' | 'correction'

/** Append-only audit trail of everything that happened to stock. */
export interface StockLogEntry {
  id: ID
  ts: string
  action: StockAction
  productId: ID
  amount: number
  note?: string
}

export interface ShoppingItem {
  id: ID
  listId: ID
  /** Set when the item refers to a known product; free-text items leave it undefined. */
  productId?: ID
  /** Display name. For product-backed items this mirrors the product name. */
  name: string
  amount: number
  unitId?: ID
  storeId?: ID
  note?: string
  done: boolean
  /** True when the row was generated from a below-minimum-stock rule rather
   *  than added by hand. Auto rows are refreshed as stock changes. */
  auto: boolean
  createdAt: string
}

export interface ShoppingList {
  id: ID
  name: string
  createdAt: string
}

export interface RecipeIngredient {
  id: ID
  productId?: ID
  /** Free-text fallback for ingredients you don't track in stock (salt, water…). */
  name: string
  amount: number
  unitId?: ID
  /** Ingredients flagged optional never block "you can cook this". */
  optional: boolean
}

export interface Recipe {
  id: ID
  name: string
  servings: number
  description?: string
  ingredients: RecipeIngredient[]
  steps: string[]
  /** Minutes. */
  prepTime?: number
  createdAt: string
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export interface MealPlanEntry {
  id: ID
  /** ISO date (YYYY-MM-DD). */
  date: string
  mealType: MealType
  recipeId?: ID
  /** Free-text entry, e.g. "Takeout". Used when recipeId is unset. */
  note?: string
  servings: number
  /** Set once the meal has been cooked so ingredients aren't deducted twice. */
  cookedAt?: string
}

export type ChorePeriod = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'manually'

export interface Chore {
  id: ID
  name: string
  periodType: ChorePeriod
  /** Multiplier on periodType, e.g. every 2 weeks. */
  periodInterval: number
  lastDone?: string
  assignedTo?: string
  note?: string
  createdAt: string
}

export interface ChoreLogEntry {
  id: ID
  choreId: ID
  ts: string
  by?: string
}

export type ThemePreference = 'system' | 'light' | 'dark'

export interface Settings {
  householdName: string
  /** Products expiring within this many days show up as "expiring soon". */
  expiryWarnDays: number
  currency: string
  theme: ThemePreference
  /** First day of week in the meal planner: 0 = Sunday, 1 = Monday. */
  weekStartsOn: 0 | 1
}

/** The complete persisted database. */
export interface Database {
  version: number
  settings: Settings
  locations: Location[]
  units: Unit[]
  groups: ProductGroup[]
  stores: Store[]
  products: Product[]
  stock: StockEntry[]
  stockLog: StockLogEntry[]
  shoppingLists: ShoppingList[]
  shoppingItems: ShoppingItem[]
  recipes: Recipe[]
  mealPlan: MealPlanEntry[]
  chores: Chore[]
  choreLog: ChoreLogEntry[]
}
