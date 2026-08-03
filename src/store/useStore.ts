import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  Chore,
  Database,
  ID,
  Location,
  MealPlanEntry,
  Product,
  ProductGroup,
  Recipe,
  Settings,
  ShoppingItem,
  ShoppingList,
  StockEntry,
  Store as ShopStore,
  Unit,
} from '../types'
import { addDays, daysUntil, isoDate, uid } from '../lib/util'
import { createDemoDatabase, createEmptyDatabase } from './seed'

const STORAGE_KEY = 'pantry.db.v1'

export interface PurchaseInput {
  productId: ID
  amount: number
  bestBefore?: string
  locationId?: ID
  price?: number
  storeId?: ID
  note?: string
}

/** A stocktake: the amount you actually counted on the shelf. */
export interface InventoryInput {
  bestBefore?: string
  locationId?: ID
  price?: number
  storeId?: ID
}

interface StoreState {
  db: Database

  // ---- master data -------------------------------------------------------
  addLocation: (name: string, isFreezer: boolean) => Location
  updateLocation: (id: ID, patch: Partial<Location>) => void
  removeLocation: (id: ID) => void

  addUnit: (name: string, plural: string) => Unit
  updateUnit: (id: ID, patch: Partial<Unit>) => void
  removeUnit: (id: ID) => void

  addGroup: (name: string) => ProductGroup
  updateGroup: (id: ID, patch: Partial<ProductGroup>) => void
  removeGroup: (id: ID) => void

  addStore: (name: string) => ShopStore
  updateStore: (id: ID, patch: Partial<ShopStore>) => void
  removeStore: (id: ID) => void

  // ---- products ----------------------------------------------------------
  addProduct: (input: Omit<Product, 'id' | 'createdAt'>) => Product
  updateProduct: (id: ID, patch: Partial<Product>) => void
  /** Also removes the product's stock entries; the log is kept for history. */
  removeProduct: (id: ID) => void

  // ---- stock -------------------------------------------------------------
  purchase: (input: PurchaseInput) => void
  /** Sets stock to the amount you counted, logging the difference. */
  inventory: (productId: ID, countedAmount: number, opts?: InventoryInput) => void
  /** Consumes `amount` across batches, oldest best-before first. */
  consume: (productId: ID, amount: number, opts?: { spoiled?: boolean }) => void
  consumeEntry: (entryId: ID, amount: number, opts?: { spoiled?: boolean }) => void
  openEntry: (entryId: ID) => void
  updateStockEntry: (id: ID, patch: Partial<StockEntry>) => void
  removeStockEntry: (id: ID) => void

  // ---- shopping ----------------------------------------------------------
  addShoppingList: (name: string) => ShoppingList
  renameShoppingList: (id: ID, name: string) => void
  removeShoppingList: (id: ID) => void
  addShoppingItem: (input: Omit<ShoppingItem, 'id' | 'createdAt' | 'done' | 'auto'>) => void
  updateShoppingItem: (id: ID, patch: Partial<ShoppingItem>) => void
  toggleShoppingItem: (id: ID) => void
  removeShoppingItem: (id: ID) => void
  clearDoneItems: (listId: ID) => void
  /** Adds every below-minimum product that isn't already on the list. */
  fillFromMinStock: (listId: ID) => number
  /** Moves all ticked, product-backed rows into stock and clears them. */
  completePurchases: (listId: ID) => number

  // ---- recipes -----------------------------------------------------------
  addRecipe: (input: Omit<Recipe, 'id' | 'createdAt'>) => Recipe
  updateRecipe: (id: ID, patch: Partial<Recipe>) => void
  removeRecipe: (id: ID) => void
  /** Deducts every stock-backed ingredient, scaled to `servings`. */
  cookRecipe: (recipeId: ID, servings?: number) => void
  addRecipeShortfallToList: (recipeId: ID, listId: ID, servings?: number) => number

  // ---- meal plan ---------------------------------------------------------
  setMealPlanEntry: (input: Omit<MealPlanEntry, 'id'> & { id?: ID }) => void
  removeMealPlanEntry: (id: ID) => void
  cookMealPlanEntry: (id: ID) => void

  // ---- chores ------------------------------------------------------------
  addChore: (input: Omit<Chore, 'id' | 'createdAt'>) => Chore
  updateChore: (id: ID, patch: Partial<Chore>) => void
  removeChore: (id: ID) => void
  trackChore: (id: ID, by?: string) => void

  // ---- app ---------------------------------------------------------------
  updateSettings: (patch: Partial<Settings>) => void
  replaceDatabase: (db: Database) => void
  loadDemoData: () => void
  resetDatabase: () => void
}

/** Sorted so that whatever should be eaten first comes first: earliest
 *  best-before, then earliest purchase. Entries with no date go last. */
function fifoOrder(a: StockEntry, b: StockEntry): number {
  if (a.bestBefore && b.bestBefore && a.bestBefore !== b.bestBefore) {
    return a.bestBefore < b.bestBefore ? -1 : 1
  }
  if (a.bestBefore && !b.bestBefore) return -1
  if (!a.bestBefore && b.bestBefore) return 1
  return a.purchasedAt < b.purchasedAt ? -1 : a.purchasedAt > b.purchasedAt ? 1 : 0
}

export const useStore = create<StoreState>()(
  persist(
    (set) => {
      /** Applies a mutation to the database slice. */
      const edit = (fn: (db: Database) => void) =>
        set((state) => {
          const db = structuredClone(state.db)
          fn(db)
          return { db }
        })

      const log = (
        db: Database,
        action: Database['stockLog'][number]['action'],
        productId: ID,
        amount: number,
        note?: string,
        extra?: { price?: number; storeId?: ID; shelfLifeDays?: number },
      ) => {
        db.stockLog.unshift({
          id: uid('log'),
          ts: new Date().toISOString(),
          action,
          productId,
          amount,
          note,
          ...extra,
        })
        // Keep the audit trail from growing without bound in localStorage.
        if (db.stockLog.length > 1000) db.stockLog.length = 1000
      }

      /** Shared FIFO deduction used by consume, cooking and meal plans. */
      const deduct = (db: Database, productId: ID, amount: number): number => {
        let remaining = amount
        const entries = db.stock.filter((e) => e.productId === productId).sort(fifoOrder)
        for (const entry of entries) {
          if (remaining <= 0) break
          const take = Math.min(entry.amount, remaining)
          entry.amount -= take
          remaining -= take
        }
        db.stock = db.stock.filter((e) => e.amount > 0.0001)
        return amount - remaining
      }

      return {
        db: createEmptyDatabase(),

        // ---- master data ---------------------------------------------------
        addLocation: (name, isFreezer) => {
          const loc: Location = { id: uid('loc'), name, isFreezer }
          edit((db) => {
            db.locations.push(loc)
          })
          return loc
        },
        updateLocation: (id, patch) =>
          edit((db) => {
            const l = db.locations.find((x) => x.id === id)
            if (l) Object.assign(l, patch)
          }),
        removeLocation: (id) =>
          edit((db) => {
            db.locations = db.locations.filter((x) => x.id !== id)
            // Detach rather than delete: stock and products outlive a location.
            for (const p of db.products) if (p.locationId === id) p.locationId = undefined
            for (const s of db.stock) if (s.locationId === id) s.locationId = undefined
          }),

        addUnit: (name, plural) => {
          const unit: Unit = { id: uid('unit'), name, plural: plural || name }
          edit((db) => {
            db.units.push(unit)
          })
          return unit
        },
        updateUnit: (id, patch) =>
          edit((db) => {
            const u = db.units.find((x) => x.id === id)
            if (u) Object.assign(u, patch)
          }),
        removeUnit: (id) =>
          edit((db) => {
            // Units are required on products, so refuse while still referenced.
            if (db.products.some((p) => p.unitId === id)) return
            db.units = db.units.filter((x) => x.id !== id)
          }),

        addGroup: (name) => {
          const group: ProductGroup = { id: uid('grp'), name }
          edit((db) => {
            db.groups.push(group)
          })
          return group
        },
        updateGroup: (id, patch) =>
          edit((db) => {
            const g = db.groups.find((x) => x.id === id)
            if (g) Object.assign(g, patch)
          }),
        removeGroup: (id) =>
          edit((db) => {
            db.groups = db.groups.filter((x) => x.id !== id)
            for (const p of db.products) if (p.groupId === id) p.groupId = undefined
          }),

        addStore: (name) => {
          const store: ShopStore = { id: uid('store'), name }
          edit((db) => {
            db.stores.push(store)
          })
          return store
        },
        updateStore: (id, patch) =>
          edit((db) => {
            const s = db.stores.find((x) => x.id === id)
            if (s) Object.assign(s, patch)
          }),
        removeStore: (id) =>
          edit((db) => {
            db.stores = db.stores.filter((x) => x.id !== id)
            for (const p of db.products) if (p.storeId === id) p.storeId = undefined
            for (const i of db.shoppingItems) if (i.storeId === id) i.storeId = undefined
          }),

        // ---- products ------------------------------------------------------
        addProduct: (input) => {
          const product: Product = { ...input, id: uid('prod'), createdAt: new Date().toISOString() }
          edit((db) => {
            db.products.push(product)
          })
          return product
        },
        updateProduct: (id, patch) =>
          edit((db) => {
            const p = db.products.find((x) => x.id === id)
            if (p) Object.assign(p, patch)
          }),
        removeProduct: (id) =>
          edit((db) => {
            db.products = db.products.filter((x) => x.id !== id)
            db.stock = db.stock.filter((x) => x.productId !== id)
            db.shoppingItems = db.shoppingItems.filter((x) => x.productId !== id)
            for (const r of db.recipes) {
              for (const ing of r.ingredients) if (ing.productId === id) ing.productId = undefined
            }
          }),

        // ---- stock ---------------------------------------------------------
        purchase: ({ productId, amount, bestBefore, locationId, price, storeId, note }) =>
          edit((db) => {
            const product = db.products.find((p) => p.id === productId)
            if (!product || amount <= 0) return
            db.stock.push({
              id: uid('stk'),
              productId,
              amount,
              bestBefore,
              locationId: locationId ?? product.locationId,
              purchasedAt: new Date().toISOString(),
              price,
            })
            log(db, 'purchase', productId, amount, note, {
              price,
              storeId: storeId ?? product.storeId,
              shelfLifeDays: bestBefore ? Math.max(0, daysUntil(bestBefore)) : undefined,
            })
          }),

        inventory: (productId, countedAmount, opts) =>
          edit((db) => {
            const product = db.products.find((p) => p.id === productId)
            if (!product || countedAmount < 0) return
            const current = db.stock
              .filter((e) => e.productId === productId)
              .reduce((a, b) => a + b.amount, 0)
            const delta = countedAmount - current
            // A stocktake that matches the books is a no-op, not an empty log line.
            if (Math.abs(delta) < 0.0001) return

            if (delta > 0) {
              db.stock.push({
                id: uid('stk'),
                productId,
                amount: delta,
                bestBefore: opts?.bestBefore,
                locationId: opts?.locationId ?? product.locationId,
                purchasedAt: new Date().toISOString(),
                price: opts?.price,
              })
            } else {
              deduct(db, productId, -delta)
            }
            log(db, 'correction', productId, delta, 'Stocktake', {
              price: delta > 0 ? opts?.price : undefined,
              storeId: delta > 0 ? opts?.storeId : undefined,
            })
          }),

        consume: (productId, amount, opts) =>
          edit((db) => {
            if (amount <= 0) return
            const taken = deduct(db, productId, amount)
            if (taken > 0) log(db, opts?.spoiled ? 'spoil' : 'consume', productId, taken)
          }),

        consumeEntry: (entryId, amount, opts) =>
          edit((db) => {
            const entry = db.stock.find((e) => e.id === entryId)
            if (!entry || amount <= 0) return
            const take = Math.min(entry.amount, amount)
            entry.amount -= take
            db.stock = db.stock.filter((e) => e.amount > 0.0001)
            log(db, opts?.spoiled ? 'spoil' : 'consume', entry.productId, take)
          }),

        openEntry: (entryId) =>
          edit((db) => {
            const entry = db.stock.find((e) => e.id === entryId)
            if (!entry || entry.openedAt) return
            entry.openedAt = new Date().toISOString()
            log(db, 'open', entry.productId, entry.amount)
          }),

        updateStockEntry: (id, patch) =>
          edit((db) => {
            const entry = db.stock.find((e) => e.id === id)
            if (!entry) return
            const before = entry.amount
            Object.assign(entry, patch)
            if (patch.amount !== undefined && patch.amount !== before) {
              log(db, 'correction', entry.productId, patch.amount - before, 'Manual correction')
            }
            db.stock = db.stock.filter((e) => e.amount > 0.0001)
          }),

        removeStockEntry: (id) =>
          edit((db) => {
            const entry = db.stock.find((e) => e.id === id)
            if (!entry) return
            db.stock = db.stock.filter((e) => e.id !== id)
            log(db, 'correction', entry.productId, -entry.amount, 'Entry removed')
          }),

        // ---- shopping ------------------------------------------------------
        addShoppingList: (name) => {
          const list: ShoppingList = {
            id: uid('list'),
            name,
            createdAt: new Date().toISOString(),
          }
          edit((db) => {
            db.shoppingLists.push(list)
          })
          return list
        },
        renameShoppingList: (id, name) =>
          edit((db) => {
            const l = db.shoppingLists.find((x) => x.id === id)
            if (l) l.name = name
          }),
        removeShoppingList: (id) =>
          edit((db) => {
            // Always leave at least one list so the shopping page has a home.
            if (db.shoppingLists.length <= 1) return
            db.shoppingLists = db.shoppingLists.filter((x) => x.id !== id)
            db.shoppingItems = db.shoppingItems.filter((x) => x.listId !== id)
          }),

        addShoppingItem: (input) =>
          edit((db) => {
            db.shoppingItems.push({
              ...input,
              id: uid('shp'),
              done: false,
              auto: false,
              createdAt: new Date().toISOString(),
            })
          }),
        updateShoppingItem: (id, patch) =>
          edit((db) => {
            const item = db.shoppingItems.find((x) => x.id === id)
            if (item) Object.assign(item, patch)
          }),
        toggleShoppingItem: (id) =>
          edit((db) => {
            const item = db.shoppingItems.find((x) => x.id === id)
            if (item) item.done = !item.done
          }),
        removeShoppingItem: (id) =>
          edit((db) => {
            db.shoppingItems = db.shoppingItems.filter((x) => x.id !== id)
          }),
        clearDoneItems: (listId) =>
          edit((db) => {
            db.shoppingItems = db.shoppingItems.filter((x) => !(x.listId === listId && x.done))
          }),

        fillFromMinStock: (listId) => {
          let added = 0
          edit((db) => {
            const totals = new Map<ID, number>()
            for (const entry of db.stock) {
              totals.set(entry.productId, (totals.get(entry.productId) ?? 0) + entry.amount)
            }
            for (const product of db.products) {
              if (product.minStock <= 0) continue
              const shortfall = product.minStock - (totals.get(product.id) ?? 0)
              if (shortfall <= 0) continue
              const already = db.shoppingItems.some(
                (i) => i.listId === listId && i.productId === product.id && !i.done,
              )
              if (already) continue
              db.shoppingItems.push({
                id: uid('shp'),
                listId,
                productId: product.id,
                name: product.name,
                amount: Math.ceil(shortfall),
                unitId: product.unitId,
                storeId: product.storeId,
                done: false,
                auto: true,
                createdAt: new Date().toISOString(),
              })
              added++
            }
          })
          return added
        },

        completePurchases: (listId) => {
          let moved = 0
          edit((db) => {
            const done = db.shoppingItems.filter((i) => i.listId === listId && i.done)
            for (const item of done) {
              if (!item.productId) continue
              const product = db.products.find((p) => p.id === item.productId)
              if (!product) continue
              db.stock.push({
                id: uid('stk'),
                productId: product.id,
                amount: item.amount,
                bestBefore: product.defaultBestBeforeDays
                  ? addDays(isoDate(), product.defaultBestBeforeDays)
                  : undefined,
                locationId: product.locationId,
                purchasedAt: new Date().toISOString(),
              })
              log(db, 'purchase', product.id, item.amount, 'From shopping list')
              moved++
            }
            db.shoppingItems = db.shoppingItems.filter((i) => !(i.listId === listId && i.done))
          })
          return moved
        },

        // ---- recipes -------------------------------------------------------
        addRecipe: (input) => {
          const recipe: Recipe = { ...input, id: uid('rec'), createdAt: new Date().toISOString() }
          edit((db) => {
            db.recipes.push(recipe)
          })
          return recipe
        },
        updateRecipe: (id, patch) =>
          edit((db) => {
            const r = db.recipes.find((x) => x.id === id)
            if (r) Object.assign(r, patch)
          }),
        removeRecipe: (id) =>
          edit((db) => {
            db.recipes = db.recipes.filter((x) => x.id !== id)
            db.mealPlan = db.mealPlan.filter((x) => x.recipeId !== id)
          }),

        cookRecipe: (recipeId, servings) =>
          edit((db) => {
            const recipe = db.recipes.find((r) => r.id === recipeId)
            if (!recipe) return
            const factor = (servings ?? recipe.servings) / (recipe.servings || 1)
            for (const ing of recipe.ingredients) {
              if (!ing.productId) continue
              const need = ing.amount * factor
              const taken = deduct(db, ing.productId, need)
              if (taken > 0) log(db, 'consume', ing.productId, taken, `Cooked ${recipe.name}`)
            }
          }),

        addRecipeShortfallToList: (recipeId, listId, servings) => {
          let added = 0
          edit((db) => {
            const recipe = db.recipes.find((r) => r.id === recipeId)
            if (!recipe) return
            const factor = (servings ?? recipe.servings) / (recipe.servings || 1)
            const totals = new Map<ID, number>()
            for (const entry of db.stock) {
              totals.set(entry.productId, (totals.get(entry.productId) ?? 0) + entry.amount)
            }
            for (const ing of recipe.ingredients) {
              if (!ing.productId) continue
              const product = db.products.find((p) => p.id === ing.productId)
              if (!product) continue
              const shortfall = ing.amount * factor - (totals.get(ing.productId) ?? 0)
              if (shortfall <= 0) continue
              const already = db.shoppingItems.some(
                (i) => i.listId === listId && i.productId === ing.productId && !i.done,
              )
              if (already) continue
              db.shoppingItems.push({
                id: uid('shp'),
                listId,
                productId: product.id,
                name: product.name,
                amount: Math.ceil(shortfall * 100) / 100,
                unitId: product.unitId,
                storeId: product.storeId,
                note: `For ${recipe.name}`,
                done: false,
                auto: true,
                createdAt: new Date().toISOString(),
              })
              added++
            }
          })
          return added
        },

        // ---- meal plan -----------------------------------------------------
        setMealPlanEntry: (input) =>
          edit((db) => {
            if (input.id) {
              const existing = db.mealPlan.find((e) => e.id === input.id)
              if (existing) {
                Object.assign(existing, input)
                return
              }
            }
            db.mealPlan.push({ ...input, id: input.id ?? uid('mp') })
          }),
        removeMealPlanEntry: (id) =>
          edit((db) => {
            db.mealPlan = db.mealPlan.filter((e) => e.id !== id)
          }),
        cookMealPlanEntry: (id) =>
          edit((db) => {
            const entry = db.mealPlan.find((e) => e.id === id)
            if (!entry || entry.cookedAt || !entry.recipeId) return
            const recipe = db.recipes.find((r) => r.id === entry.recipeId)
            if (!recipe) return
            const factor = entry.servings / (recipe.servings || 1)
            for (const ing of recipe.ingredients) {
              if (!ing.productId) continue
              const taken = deduct(db, ing.productId, ing.amount * factor)
              if (taken > 0) log(db, 'consume', ing.productId, taken, `Cooked ${recipe.name}`)
            }
            entry.cookedAt = new Date().toISOString()
          }),

        // ---- chores --------------------------------------------------------
        addChore: (input) => {
          const chore: Chore = { ...input, id: uid('chr'), createdAt: new Date().toISOString() }
          edit((db) => {
            db.chores.push(chore)
          })
          return chore
        },
        updateChore: (id, patch) =>
          edit((db) => {
            const c = db.chores.find((x) => x.id === id)
            if (c) Object.assign(c, patch)
          }),
        removeChore: (id) =>
          edit((db) => {
            db.chores = db.chores.filter((x) => x.id !== id)
            db.choreLog = db.choreLog.filter((x) => x.choreId !== id)
          }),
        trackChore: (id, by) =>
          edit((db) => {
            const chore = db.chores.find((x) => x.id === id)
            if (!chore) return
            chore.lastDone = isoDate()
            db.choreLog.unshift({
              id: uid('clg'),
              choreId: id,
              ts: new Date().toISOString(),
              by: by ?? chore.assignedTo,
            })
            if (db.choreLog.length > 500) db.choreLog.length = 500
          }),

        // ---- app -----------------------------------------------------------
        updateSettings: (patch) =>
          edit((db) => {
            Object.assign(db.settings, patch)
          }),
        replaceDatabase: (db) => set({ db }),
        loadDemoData: () => set({ db: createDemoDatabase() }),
        resetDatabase: () => set({ db: createEmptyDatabase() }),
      }
    },
    {
      name: STORAGE_KEY,
      version: 1,
      partialize: (state) => ({ db: state.db }),
      // Fills in keys added by later app versions so an older saved database
      // never crashes the UI with `undefined.map`.
      merge: (persisted, current) => {
        const saved = (persisted as { db?: Partial<Database> } | undefined)?.db
        if (!saved) return current
        const base = createEmptyDatabase()
        return {
          ...current,
          db: {
            ...base,
            ...saved,
            settings: { ...base.settings, ...(saved.settings ?? {}) },
          },
        }
      },
    },
  ),
)

/** Convenience hook: the raw database. */
export const useDb = () => useStore((s) => s.db)
export const useSettings = () => useStore((s) => s.db.settings)
