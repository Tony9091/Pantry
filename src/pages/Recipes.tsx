import { useMemo, useState } from 'react'
import { navigate } from '../lib/router'
import type { Recipe, RecipeIngredient } from '../types'
import { useDb, useStore } from '../store/useStore'
import { makeLookups, recipeAvailability } from '../store/selectors'
import { clsx, formatAmount, matches, uid } from '../lib/util'
import { TopBar } from '../components/Layout'
import {
  Badge,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Modal,
  SearchInput,
  Select,
  Stepper,
  TextArea,
  TextInput,
  useToast,
} from '../components/ui'
import {
  IconChevronRight,
  IconClock,
  IconEdit,
  IconPlus,
  IconTrash,
} from '../components/icons'

export function RecipesPage() {
  const db = useDb()
  const [search, setSearch] = useState('')
  const [onlyCookable, setOnlyCookable] = useState(false)
  const [creating, setCreating] = useState(false)

  const rows = useMemo(() => {
    return db.recipes
      .map((recipe) => ({ recipe, availability: recipeAvailability(db, recipe) }))
      .filter(({ recipe, availability }) => {
        if (!matches(recipe.name, search)) return false
        if (onlyCookable && !availability.canCook) return false
        return true
      })
      .sort((a, b) => a.recipe.name.localeCompare(b.recipe.name))
  }, [db, search, onlyCookable])

  return (
    <>
      <TopBar
        title="Recipes"
        subtitle={`${db.recipes.length} saved`}
        actions={
          <button className="btn primary desktop-only" onClick={() => setCreating(true)}>
            <IconPlus />
            New recipe
          </button>
        }
      />

      <main className="main">
        <div className="toolbar">
          <SearchInput value={search} onChange={setSearch} placeholder="Search recipes…" />
        </div>

        <div className="chips">
          <button
            className={clsx('chip', !onlyCookable && 'active')}
            onClick={() => setOnlyCookable(false)}
          >
            All
          </button>
          <button
            className={clsx('chip', onlyCookable && 'active')}
            onClick={() => setOnlyCookable(true)}
          >
            Can cook now
          </button>
        </div>

        {rows.length === 0 ? (
          <Card>
            <EmptyState
              title={db.recipes.length === 0 ? 'No recipes yet' : 'Nothing matches'}
              message={
                db.recipes.length === 0
                  ? 'Save a recipe and Pantry will tell you whether you have the ingredients — and deduct them when you cook it.'
                  : onlyCookable
                    ? "You're short an ingredient for every recipe. Check the shopping list."
                    : 'Try a different search.'
              }
              action={
                db.recipes.length === 0 ? (
                  <button className="btn primary" onClick={() => setCreating(true)}>
                    <IconPlus />
                    New recipe
                  </button>
                ) : undefined
              }
            />
          </Card>
        ) : (
          <Card flush>
            {rows.map(({ recipe, availability }) => (
              <div
                key={recipe.id}
                className="row tappable"
                onClick={() => navigate(`/recipes/${recipe.id}`)}
              >
                <div className="row-main">
                  <div className="row-title">{recipe.name}</div>
                  <div className="row-sub">
                    {recipe.servings} servings
                    {recipe.prepTime ? ` · ${recipe.prepTime} min` : ''} ·{' '}
                    {recipe.ingredients.length} ingredients
                  </div>
                </div>
                {availability.canCook ? (
                  <Badge tone="ok">Ready</Badge>
                ) : (
                  <Badge tone="warn">{availability.missingCount} short</Badge>
                )}
                <IconChevronRight className="muted" style={{ width: 18 }} />
              </div>
            ))}
          </Card>
        )}
      </main>

      <button className="fab" onClick={() => setCreating(true)} aria-label="New recipe">
        <IconPlus />
      </button>

      {creating && (
        <RecipeDialog onClose={() => setCreating(false)} onSaved={(r) => navigate(`/recipes/${r.id}`)} />
      )}
    </>
  )
}

/* ------------------------------------------------------------ detail page */

export function RecipeDetailPage({ recipeId }: { recipeId: string }) {
  const db = useDb()
  const toast = useToast()
  const lookups = useMemo(() => makeLookups(db), [db])
  const cookRecipe = useStore((s) => s.cookRecipe)
  const removeRecipe = useStore((s) => s.removeRecipe)
  const addShortfall = useStore((s) => s.addRecipeShortfallToList)

  const recipe = db.recipes.find((r) => r.id === recipeId)
  const [servings, setServings] = useState(recipe?.servings ?? 1)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [cooking, setCooking] = useState(false)

  const availability = useMemo(
    () => (recipe ? recipeAvailability(db, recipe, servings) : null),
    [db, recipe, servings],
  )

  if (!recipe || !availability) {
    return (
      <>
        <TopBar title="Not found" />
        <main className="main">
          <Card>
            <EmptyState
              title="This recipe no longer exists"
              action={
                <button className="btn" onClick={() => navigate('/recipes')}>
                  Back to recipes
                </button>
              }
            />
          </Card>
        </main>
      </>
    )
  }

  const shortIngredients = availability.ingredients.filter((i) => i.tracked && !i.enough)

  return (
    <>
      <TopBar
        title={recipe.name}
        subtitle={recipe.prepTime ? `${recipe.prepTime} min · ${recipe.servings} servings` : `${recipe.servings} servings`}
        back={
          <button className="icon-btn bare" onClick={() => navigate('/recipes')} aria-label="Back">
            <IconChevronRight style={{ transform: 'rotate(180deg)' }} />
          </button>
        }
        actions={
          <button className="icon-btn" onClick={() => setEditing(true)} aria-label="Edit recipe">
            <IconEdit />
          </button>
        }
      />

      <main className="main">
        {recipe.description && (
          <p style={{ color: 'var(--text-dim)', fontSize: 14.5, marginBottom: 16 }}>
            {recipe.description}
          </p>
        )}

        <Card title="Servings" flush>
          <div className="row">
            <div className="row-main">
              <div className="row-sub">Amounts below scale with this</div>
            </div>
            <div style={{ width: 150 }}>
              <Stepper value={servings} onChange={setServings} min={1} />
            </div>
          </div>
        </Card>

        <Card
          title="Ingredients"
          count={
            availability.canCook ? (
              <Badge tone="ok">All in stock</Badge>
            ) : (
              <Badge tone="warn">{availability.missingCount} short</Badge>
            )
          }
        >
          {availability.ingredients.length === 0 ? (
            <p className="muted" style={{ fontSize: 14 }}>
              No ingredients listed yet.
            </p>
          ) : (
            availability.ingredients.map((ing) => (
              <div
                key={ing.ingredientId}
                className={clsx('ing', !ing.enough && 'short', !ing.tracked && 'untracked')}
              >
                <span className="dot" />
                <span>
                  {ing.name}
                  {ing.optional && <span className="muted"> · optional</span>}
                </span>
                <span className="amt">
                  {formatAmount(ing.needed)} {lookups.unitName(ing.unitId, ing.needed)}
                  {ing.tracked && !ing.enough && (
                    <span style={{ color: 'var(--danger)' }}>
                      {' '}
                      (have {formatAmount(ing.have)})
                    </span>
                  )}
                </span>
              </div>
            ))
          )}
        </Card>

        <div className="btn-row" style={{ marginTop: 14 }}>
          <button
            className="btn primary"
            style={{ flex: 1 }}
            disabled={recipe.ingredients.length === 0}
            onClick={() => setCooking(true)}
          >
            Cook this
          </button>
          {shortIngredients.length > 0 && (
            <button
              className="btn"
              style={{ flex: 1 }}
              onClick={() => {
                const listId = db.shoppingLists[0]?.id
                if (!listId) return
                const added = addShortfall(recipe.id, listId, servings)
                toast(added > 0 ? `Added ${added} item${added === 1 ? '' : 's'} to your list` : 'Already on the list')
              }}
            >
              Add missing to list
            </button>
          )}
        </div>

        {recipe.steps.length > 0 && (
          <Card title="Method">
            <ol className="steps">
              {recipe.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </Card>
        )}

        <div style={{ marginTop: 20 }}>
          <button className="btn danger block" onClick={() => setDeleting(true)}>
            <IconTrash />
            Delete recipe
          </button>
        </div>
      </main>

      {editing && <RecipeDialog recipe={recipe} onClose={() => setEditing(false)} />}

      {cooking && (
        <ConfirmDialog
          title={`Cook ${recipe.name}?`}
          message={
            availability.canCook
              ? `${servings} servings' worth of ingredients will be deducted from your stock, oldest batches first.`
              : `You're short on ${shortIngredients.length} ingredient${
                  shortIngredients.length === 1 ? '' : 's'
                }. Cooking anyway will use up whatever you do have.`
          }
          confirmLabel="Cook"
          onConfirm={() => {
            cookRecipe(recipe.id, servings)
            toast(`Deducted ingredients for ${recipe.name}`)
          }}
          onClose={() => setCooking(false)}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete ${recipe.name}?`}
          message="It will also be removed from your meal plan. Your stock isn't affected."
          onConfirm={() => {
            removeRecipe(recipe.id)
            navigate('/recipes')
          }}
          onClose={() => setDeleting(false)}
        />
      )}
    </>
  )
}

/* ---------------------------------------------------------- recipe editor */

function RecipeDialog({
  recipe,
  onClose,
  onSaved,
}: {
  recipe?: Recipe
  onClose: () => void
  onSaved?: (recipe: Recipe) => void
}) {
  const db = useDb()
  const addRecipe = useStore((s) => s.addRecipe)
  const updateRecipe = useStore((s) => s.updateRecipe)

  const [name, setName] = useState(recipe?.name ?? '')
  const [servings, setServings] = useState(recipe?.servings ?? 2)
  const [prepTime, setPrepTime] = useState(recipe?.prepTime ?? 0)
  const [description, setDescription] = useState(recipe?.description ?? '')
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>(recipe?.ingredients ?? [])
  // Steps are edited as one textarea, one step per line — far less fiddly on
  // a phone than a list of individual inputs.
  const [stepsText, setStepsText] = useState((recipe?.steps ?? []).join('\n'))

  const addIngredient = () =>
    setIngredients((list) => [
      ...list,
      { id: uid('ing'), name: '', amount: 1, optional: false },
    ])

  const patchIngredient = (id: string, patch: Partial<RecipeIngredient>) =>
    setIngredients((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)))

  const save = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const payload = {
      name: trimmed,
      servings: Math.max(1, servings),
      prepTime: prepTime > 0 ? prepTime : undefined,
      description: description.trim() || undefined,
      ingredients: ingredients
        .filter((i) => i.name.trim() || i.productId)
        .map((i) => ({ ...i, name: i.name.trim() })),
      steps: stepsText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
    }
    if (recipe) {
      updateRecipe(recipe.id, payload)
      onSaved?.({ ...recipe, ...payload })
    } else {
      onSaved?.(addRecipe(payload))
    }
    onClose()
  }

  return (
    <Modal
      title={recipe ? 'Edit recipe' : 'New recipe'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={!name.trim()}>
            Save
          </button>
        </>
      }
    >
      <Field label="Name">
        <TextInput
          autoFocus={!recipe}
          value={name}
          placeholder="e.g. Mushroom Risotto"
          onChange={(e) => setName(e.target.value)}
        />
      </Field>

      <div className="field-row">
        <Field label="Servings">
          <Stepper value={servings} onChange={setServings} min={1} />
        </Field>
        <Field label="Prep time (min)">
          <Stepper value={prepTime} onChange={setPrepTime} min={0} step={5} />
        </Field>
      </div>

      <Field label="Description">
        <TextInput
          value={description}
          placeholder="Optional"
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>

      <div className="field-label" style={{ marginTop: 4 }}>
        Ingredients
      </div>
      <p className="hint" style={{ marginTop: -2, marginBottom: 10 }}>
        Link an ingredient to a product and Pantry can check your stock and deduct it when you cook.
      </p>

      <div className="stack" style={{ marginBottom: 12 }}>
        {ingredients.map((ing) => (
          <div
            key={ing.id}
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: 10,
            }}
          >
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <Select
                value={ing.productId ?? ''}
                onChange={(e) => {
                  const product = db.products.find((p) => p.id === e.target.value)
                  patchIngredient(ing.id, {
                    productId: e.target.value || undefined,
                    name: product?.name ?? ing.name,
                    unitId: product?.unitId ?? ing.unitId,
                  })
                }}
              >
                <option value="">Not tracked</option>
                {[...db.products]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </Select>
              <button
                className="icon-btn"
                onClick={() => setIngredients((l) => l.filter((x) => x.id !== ing.id))}
                aria-label="Remove ingredient"
              >
                <IconTrash />
              </button>
            </div>

            <TextInput
              value={ing.name}
              placeholder="Ingredient name"
              onChange={(e) => patchIngredient(ing.id, { name: e.target.value })}
              style={{ marginBottom: 8 }}
            />

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <TextInput
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={ing.amount}
                style={{ width: 90 }}
                onChange={(e) => patchIngredient(ing.id, { amount: Number(e.target.value) || 0 })}
              />
              <Select
                value={ing.unitId ?? ''}
                onChange={(e) => patchIngredient(ing.id, { unitId: e.target.value || undefined })}
              >
                <option value="">No unit</option>
                {db.units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </div>

            <label className="checkbox" style={{ marginTop: 9, fontSize: 13.5 }}>
              <input
                type="checkbox"
                checked={ing.optional}
                onChange={(e) => patchIngredient(ing.id, { optional: e.target.checked })}
              />
              <span>Optional</span>
            </label>
          </div>
        ))}
      </div>

      <button className="btn block" onClick={addIngredient} style={{ marginBottom: 18 }}>
        <IconPlus />
        Add ingredient
      </button>

      <Field label="Method" hint="One step per line.">
        <TextArea
          value={stepsText}
          placeholder={'Chop the onions\nFry until golden\n…'}
          onChange={(e) => setStepsText(e.target.value)}
          style={{ minHeight: 130 }}
        />
      </Field>
    </Modal>
  )
}

/** Small helper so the meal planner can show a prep-time chip. */
export function PrepTime({ minutes }: { minutes?: number }) {
  if (!minutes) return null
  return (
    <span className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <IconClock style={{ width: 13 }} />
      {minutes} min
    </span>
  )
}
