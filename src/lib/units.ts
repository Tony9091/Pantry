/** Unit dimensions and conversion, so the app can answer "what does this
 *  actually cost per pound?"
 *
 *  A price of "$6.75 per Pack" is not comparable to anything. Normalising to a
 *  base measure is the only way to tell whether the big bag is really cheaper.
 *
 *  Everything converts through grams and millilitres internally — exact ratios,
 *  and no accumulated error from chaining customary units together. */

import type { Database, ID, Product } from '../types'

export type Dimension = 'mass' | 'volume' | 'count'

interface UnitDef {
  dimension: Dimension
  /** How many base units (g, ml, or pieces) one of these is. */
  factor: number
}

/** Keyed by lower-case canonical unit name, matching the seeded unit list. */
const DEFS: Record<string, UnitDef> = {
  // Mass, base gram.
  gram: { dimension: 'mass', factor: 1 },
  kilogram: { dimension: 'mass', factor: 1000 },
  ounce: { dimension: 'mass', factor: 28.349523125 },
  pound: { dimension: 'mass', factor: 453.59237 },

  // Volume, base millilitre.
  milliliter: { dimension: 'volume', factor: 1 },
  millilitre: { dimension: 'volume', factor: 1 },
  liter: { dimension: 'volume', factor: 1000 },
  litre: { dimension: 'volume', factor: 1000 },
  'fluid ounce': { dimension: 'volume', factor: 29.5735295625 },
  cup: { dimension: 'volume', factor: 236.5882365 },
  pint: { dimension: 'volume', factor: 473.176473 },
  quart: { dimension: 'volume', factor: 946.352946 },
  gallon: { dimension: 'volume', factor: 3785.411784 },
  tablespoon: { dimension: 'volume', factor: 14.78676478125 },
  teaspoon: { dimension: 'volume', factor: 4.92892159375 },

  // Countable things, base a single item.
  piece: { dimension: 'count', factor: 1 },
  dozen: { dimension: 'count', factor: 12 },
}

/** Bases a price can be shown against, with their display names. */
export const COST_BASES = {
  // Mass
  oz: { dimension: 'mass' as const, label: 'oz', factor: 28.349523125 },
  lb: { dimension: 'mass' as const, label: 'lb', factor: 453.59237 },
  g: { dimension: 'mass' as const, label: 'g', factor: 1 },
  kg: { dimension: 'mass' as const, label: 'kg', factor: 1000 },
  // Volume
  floz: { dimension: 'volume' as const, label: 'fl oz', factor: 29.5735295625 },
  cup: { dimension: 'volume' as const, label: 'cup', factor: 236.5882365 },
  quart: { dimension: 'volume' as const, label: 'qt', factor: 946.352946 },
  gallon: { dimension: 'volume' as const, label: 'gal', factor: 3785.411784 },
  l: { dimension: 'volume' as const, label: 'L', factor: 1000 },
}

export type MassBasis = 'oz' | 'lb' | 'g' | 'kg'
export type VolumeBasis = 'floz' | 'cup' | 'quart' | 'gallon' | 'l'

export function unitDefinition(db: Database, unitId: ID | undefined): UnitDef | undefined {
  if (!unitId) return undefined
  const unit = db.units.find((u) => u.id === unitId)
  if (!unit) return undefined
  return DEFS[unit.name.toLowerCase()]
}

export function dimensionOf(db: Database, unitId: ID | undefined): Dimension | undefined {
  return unitDefinition(db, unitId)?.dimension
}

export interface BaseAmount {
  dimension: Dimension
  /** Grams, millilitres, or a count of items. */
  base: number
}

/**
 * Converts an amount of a product into base measure.
 *
 * Countable packaging — a jar, a pack, a loaf — carries no inherent weight, so
 * it only converts when the product records what one package holds.
 */
export function toBase(
  db: Database,
  product: Product,
  amount: number,
): BaseAmount | undefined {
  const def = unitDefinition(db, product.unitId)

  if (def && def.dimension !== 'count') {
    return { dimension: def.dimension, base: amount * def.factor }
  }

  // Countable, or an unrecognised custom unit: fall back to package contents.
  if (product.packageSize && product.packageUnitId) {
    const packDef = unitDefinition(db, product.packageUnitId)
    if (packDef && packDef.dimension !== 'count') {
      // Pieces per unit, if the unit itself is countable (e.g. a dozen).
      const multiples = def?.dimension === 'count' ? def.factor : 1
      return {
        dimension: packDef.dimension,
        base: amount * multiples * product.packageSize * packDef.factor,
      }
    }
  }

  if (def?.dimension === 'count') {
    return { dimension: 'count', base: amount * def.factor }
  }
  return undefined
}

export interface UnitCost {
  /** Money per one unit of `label`. */
  value: number
  /** "lb", "fl oz", "each" … */
  label: string
}

/**
 * Cost per base unit for a purchase.
 *
 * @param price  total paid
 * @param amount how many of the product's own unit that bought
 */
export function unitCost(
  db: Database,
  product: Product,
  price: number,
  amount: number,
  basis: { mass: MassBasis; volume: VolumeBasis },
): UnitCost | undefined {
  if (!(price > 0) || !(amount > 0)) return undefined
  const converted = toBase(db, product, amount)
  if (!converted) return undefined

  if (converted.dimension === 'count') {
    // "Each" is already the most meaningful basis for countable things.
    return { value: price / converted.base, label: 'each' }
  }

  const target =
    converted.dimension === 'mass' ? COST_BASES[basis.mass] : COST_BASES[basis.volume]
  const inTarget = converted.base / target.factor
  if (!(inTarget > 0)) return undefined
  return { value: price / inTarget, label: target.label }
}

/** Units that can sensibly be chosen as a package's contents. */
export function measurableUnits(db: Database) {
  return db.units.filter((u) => {
    const def = DEFS[u.name.toLowerCase()]
    return def && def.dimension !== 'count'
  })
}

/** True when a product's own unit already carries a measure. */
export function hasIntrinsicMeasure(db: Database, product: Product): boolean {
  const def = unitDefinition(db, product.unitId)
  return Boolean(def && def.dimension !== 'count')
}
