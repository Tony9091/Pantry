import type { Database } from '../types'
import { addDays, isoDate, uid } from '../lib/util'

/** Master data every database starts with. Without units and locations the
 *  product form would be unusable on first run. */
export function createEmptyDatabase(): Database {
  const units = [
    { id: 'unit_piece', name: 'Piece', plural: 'Pieces' },
    { id: 'unit_gram', name: 'Gram', plural: 'Grams' },
    { id: 'unit_kg', name: 'Kilogram', plural: 'Kilograms' },
    { id: 'unit_ml', name: 'Millilitre', plural: 'Millilitres' },
    { id: 'unit_litre', name: 'Litre', plural: 'Litres' },
    { id: 'unit_pack', name: 'Pack', plural: 'Packs' },
    { id: 'unit_jar', name: 'Jar', plural: 'Jars' },
    { id: 'unit_can', name: 'Can', plural: 'Cans' },
    { id: 'unit_bottle', name: 'Bottle', plural: 'Bottles' },
    { id: 'unit_dozen', name: 'Dozen', plural: 'Dozen' },
    { id: 'unit_tbsp', name: 'Tablespoon', plural: 'Tablespoons' },
    { id: 'unit_tsp', name: 'Teaspoon', plural: 'Teaspoons' },
  ]

  const locations = [
    { id: 'loc_pantry', name: 'Pantry', isFreezer: false },
    { id: 'loc_fridge', name: 'Fridge', isFreezer: false },
    { id: 'loc_freezer', name: 'Freezer', isFreezer: true },
  ]

  const groups = [
    { id: 'grp_produce', name: 'Produce' },
    { id: 'grp_dairy', name: 'Dairy & Eggs' },
    { id: 'grp_bakery', name: 'Bakery' },
    { id: 'grp_meat', name: 'Meat & Fish' },
    { id: 'grp_pantry', name: 'Pantry Staples' },
    { id: 'grp_frozen', name: 'Frozen' },
    { id: 'grp_drinks', name: 'Drinks' },
    { id: 'grp_household', name: 'Household' },
  ]

  return {
    version: 1,
    settings: {
      householdName: 'My Household',
      expiryWarnDays: 5,
      currency: 'USD',
      theme: 'system',
      weekStartsOn: 1,
    },
    units,
    locations,
    groups,
    stores: [{ id: 'store_super', name: 'Supermarket' }],
    products: [],
    stock: [],
    stockLog: [],
    shoppingLists: [{ id: 'list_default', name: 'Groceries', createdAt: new Date().toISOString() }],
    shoppingItems: [],
    recipes: [],
    mealPlan: [],
    chores: [],
    choreLog: [],
  }
}

/** A furnished household so the app is explorable before you've typed anything.
 *  Reachable from Settings → "Load demo data". */
export function createDemoDatabase(): Database {
  const db = createEmptyDatabase()
  const now = new Date().toISOString()
  const today = isoDate()

  db.settings.householdName = 'Demo Household'
  db.stores = [
    { id: 'store_super', name: 'Supermarket' },
    { id: 'store_grocery', name: 'Mr. Grocery' },
    { id: 'store_farm', name: 'Farmers Market' },
  ]

  const p = (
    id: string,
    name: string,
    unitId: string,
    groupId: string,
    locationId: string,
    minStock: number,
    bbDays?: number,
    storeId?: string,
  ) => ({
    id,
    name,
    unitId,
    groupId,
    locationId,
    minStock,
    defaultBestBeforeDays: bbDays,
    storeId,
    createdAt: now,
  })

  db.products = [
    p('prod_banana', 'Bananas', 'unit_piece', 'grp_produce', 'loc_pantry', 5, 7, 'store_super'),
    p('prod_apple', 'Apples', 'unit_piece', 'grp_produce', 'loc_fridge', 4, 14, 'store_farm'),
    p('prod_tomato', 'Tomatoes', 'unit_piece', 'grp_produce', 'loc_fridge', 3, 8, 'store_farm'),
    p('prod_onion', 'Onions', 'unit_piece', 'grp_produce', 'loc_pantry', 3, 30),
    p('prod_garlic', 'Garlic', 'unit_piece', 'grp_produce', 'loc_pantry', 2, 60),
    p('prod_milk', 'Milk', 'unit_litre', 'grp_dairy', 'loc_fridge', 2, 9, 'store_super'),
    p('prod_eggs', 'Eggs', 'unit_dozen', 'grp_dairy', 'loc_fridge', 1, 21, 'store_farm'),
    p('prod_butter', 'Butter', 'unit_pack', 'grp_dairy', 'loc_fridge', 1, 45),
    p('prod_cheese', 'Cheddar Cheese', 'unit_gram', 'grp_dairy', 'loc_fridge', 200, 25),
    p('prod_bread', 'Sourdough Bread', 'unit_piece', 'grp_bakery', 'loc_pantry', 1, 5),
    p('prod_chicken', 'Chicken Breast', 'unit_gram', 'grp_meat', 'loc_freezer', 500),
    p('prod_pasta', 'Spaghetti', 'unit_pack', 'grp_pantry', 'loc_pantry', 2, 400),
    p('prod_rice', 'Basmati Rice', 'unit_kg', 'grp_pantry', 'loc_pantry', 1, 500),
    p('prod_oliveoil', 'Olive Oil', 'unit_bottle', 'grp_pantry', 'loc_pantry', 1, 400),
    p('prod_tomatocan', 'Chopped Tomatoes', 'unit_can', 'grp_pantry', 'loc_pantry', 3, 500),
    p('prod_pb', 'Peanut Butter', 'unit_jar', 'grp_pantry', 'loc_pantry', 2, 200, 'store_grocery'),
    p('prod_coffee', 'Coffee Beans', 'unit_pack', 'grp_drinks', 'loc_pantry', 1, 90),
    p('prod_peas', 'Frozen Peas', 'unit_gram', 'grp_frozen', 'loc_freezer', 300),
    p('prod_soap', 'Dish Soap', 'unit_bottle', 'grp_household', 'loc_pantry', 1),
  ]

  const stock = (
    productId: string,
    amount: number,
    bbOffsetDays: number | null,
    locationId: string,
    price?: number,
  ) => ({
    id: uid('stk'),
    productId,
    amount,
    bestBefore: bbOffsetDays === null ? undefined : addDays(today, bbOffsetDays),
    locationId,
    purchasedAt: now,
    price,
  })

  db.stock = [
    // Deliberately spans expired / expiring-soon / fine so the dashboard has
    // something to show on first run.
    stock('prod_milk', 1, 1, 'loc_fridge', 3.29),
    stock('prod_bread', 1, -1, 'loc_pantry', 5.5),
    stock('prod_tomato', 4, 2, 'loc_fridge', 3.0),
    stock('prod_apple', 6, 9, 'loc_fridge', 4.2),
    stock('prod_eggs', 1, 16, 'loc_fridge', 5.99),
    stock('prod_butter', 2, 40, 'loc_fridge', 7.0),
    stock('prod_cheese', 340, 20, 'loc_fridge', 6.75),
    stock('prod_onion', 5, 25, 'loc_pantry'),
    stock('prod_garlic', 3, 50, 'loc_pantry'),
    stock('prod_pasta', 3, 380, 'loc_pantry', 4.5),
    stock('prod_rice', 2, 480, 'loc_pantry', 8.0),
    stock('prod_oliveoil', 1, 300, 'loc_pantry', 12.0),
    stock('prod_tomatocan', 4, 460, 'loc_pantry', 5.2),
    stock('prod_chicken', 800, 120, 'loc_freezer', 11.4),
    stock('prod_peas', 500, 200, 'loc_freezer', 2.8),
    stock('prod_coffee', 1, 70, 'loc_pantry', 14.0),
    stock('prod_soap', 1, null, 'loc_pantry', 3.5),
    // Bananas and peanut butter are intentionally out of stock so they appear
    // as missing items on the shopping list.
  ]

  db.stockLog = db.stock.map((entry) => ({
    id: uid('log'),
    ts: entry.purchasedAt,
    action: 'purchase' as const,
    productId: entry.productId,
    amount: entry.amount,
    note: 'Demo data',
  }))

  db.shoppingLists = [
    { id: 'list_default', name: 'Groceries', createdAt: now },
    { id: 'list_business', name: 'Business', createdAt: now },
  ]

  db.shoppingItems = [
    {
      id: uid('shp'),
      listId: 'list_default',
      name: 'Paper towels',
      amount: 2,
      unitId: 'unit_pack',
      storeId: 'store_super',
      done: false,
      auto: false,
      createdAt: now,
    },
    {
      id: uid('shp'),
      listId: 'list_default',
      productId: 'prod_coffee',
      name: 'Coffee Beans',
      amount: 1,
      unitId: 'unit_pack',
      done: true,
      auto: false,
      createdAt: now,
    },
  ]

  const ing = (
    name: string,
    amount: number,
    unitId?: string,
    productId?: string,
    optional = false,
  ) => ({ id: uid('ing'), name, amount, unitId, productId, optional })

  db.recipes = [
    {
      id: 'rec_pasta',
      name: 'Spaghetti al Pomodoro',
      servings: 4,
      prepTime: 25,
      description: 'The weeknight default. Fast, cheap, and made from pantry staples.',
      ingredients: [
        ing('Spaghetti', 1, 'unit_pack', 'prod_pasta'),
        ing('Chopped Tomatoes', 2, 'unit_can', 'prod_tomatocan'),
        ing('Garlic', 2, 'unit_piece', 'prod_garlic'),
        ing('Olive Oil', 0.1, 'unit_bottle', 'prod_oliveoil'),
        ing('Basil', 1, undefined, undefined, true),
        ing('Salt', 1, 'unit_tsp'),
      ],
      steps: [
        'Bring a large pot of salted water to the boil.',
        'Slice the garlic thinly and warm it gently in olive oil until fragrant.',
        'Add the chopped tomatoes, simmer 15 minutes, season to taste.',
        'Cook the spaghetti until al dente, then toss it through the sauce with a splash of pasta water.',
        'Finish with basil and a drizzle of olive oil.',
      ],
      createdAt: now,
    },
    {
      id: 'rec_omelette',
      name: 'Cheese Omelette',
      servings: 1,
      prepTime: 10,
      description: 'Breakfast in the time it takes the kettle to boil.',
      ingredients: [
        ing('Eggs', 0.25, 'unit_dozen', 'prod_eggs'),
        ing('Cheddar Cheese', 40, 'unit_gram', 'prod_cheese'),
        ing('Butter', 0.05, 'unit_pack', 'prod_butter'),
      ],
      steps: [
        'Beat the eggs with a pinch of salt.',
        'Melt butter in a non-stick pan over medium-low heat.',
        'Pour in the eggs, stir gently, and scatter the cheese over one half.',
        'Fold and slide onto a plate while still slightly soft in the middle.',
      ],
      createdAt: now,
    },
    {
      id: 'rec_chicken',
      name: 'Chicken & Rice Traybake',
      servings: 4,
      prepTime: 50,
      description: 'One tray, almost no washing up.',
      ingredients: [
        ing('Chicken Breast', 600, 'unit_gram', 'prod_chicken'),
        ing('Basmati Rice', 0.4, 'unit_kg', 'prod_rice'),
        ing('Onions', 2, 'unit_piece', 'prod_onion'),
        ing('Frozen Peas', 200, 'unit_gram', 'prod_peas'),
        ing('Olive Oil', 0.05, 'unit_bottle', 'prod_oliveoil'),
      ],
      steps: [
        'Heat the oven to 200°C / 400°F.',
        'Toss the sliced onions and rice with oil and seasoning in a deep tray.',
        'Pour over hot stock, lay the chicken on top, cover with foil.',
        'Bake 35 minutes, stir the peas through, then uncover for a final 10 minutes.',
      ],
      createdAt: now,
    },
  ]

  db.mealPlan = [
    {
      id: uid('mp'),
      date: today,
      mealType: 'dinner',
      recipeId: 'rec_pasta',
      servings: 4,
    },
    {
      id: uid('mp'),
      date: addDays(today, 1),
      mealType: 'breakfast',
      recipeId: 'rec_omelette',
      servings: 2,
    },
    {
      id: uid('mp'),
      date: addDays(today, 2),
      mealType: 'dinner',
      recipeId: 'rec_chicken',
      servings: 4,
    },
    {
      id: uid('mp'),
      date: addDays(today, 3),
      mealType: 'dinner',
      note: 'Takeout night',
      servings: 2,
    },
  ]

  db.chores = [
    {
      id: uid('chr'),
      name: 'Take out the recycling',
      periodType: 'weekly',
      periodInterval: 1,
      lastDone: addDays(today, -8),
      assignedTo: 'Alex',
      createdAt: now,
    },
    {
      id: uid('chr'),
      name: 'Clean the fridge',
      periodType: 'monthly',
      periodInterval: 1,
      lastDone: addDays(today, -20),
      createdAt: now,
    },
    {
      id: uid('chr'),
      name: 'Water the plants',
      periodType: 'daily',
      periodInterval: 3,
      lastDone: addDays(today, -3),
      assignedTo: 'Sam',
      createdAt: now,
    },
    {
      id: uid('chr'),
      name: 'Descale the kettle',
      periodType: 'manually',
      periodInterval: 1,
      createdAt: now,
    },
  ]

  return db
}
