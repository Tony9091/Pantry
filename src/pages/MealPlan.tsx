import { useMemo, useState } from 'react'
import { navigate } from '../lib/router'
import type { MealPlanEntry, MealType } from '../types'
import { useDb, useStore } from '../store/useStore'
import { recipeAvailability } from '../store/selectors'
import { addDays, clsx, isoDate, parseDate, startOfWeek, weekdayName } from '../lib/util'
import { TopBar } from '../components/Layout'
import {
  Badge,
  Field,
  Modal,
  Select,
  Stepper,
  TextInput,
  useToast,
} from '../components/ui'
import { IconChevronLeft, IconChevronRight } from '../components/icons'

const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
]

export function MealPlanPage() {
  const db = useDb()
  const toast = useToast()
  const addShortfall = useStore((s) => s.addRecipeShortfallToList)

  const today = isoDate()
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today, db.settings.weekStartsOn))
  const [editing, setEditing] = useState<{ date: string; entry?: MealPlanEntry } | null>(null)

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  )

  const weekEntries = useMemo(
    () => db.mealPlan.filter((e) => days.includes(e.date)),
    [db.mealPlan, days],
  )

  /** Every ingredient this week's planned recipes need but stock can't cover. */
  const shortRecipes = useMemo(() => {
    const seen = new Set<string>()
    const out: { recipeId: string; name: string; servings: number }[] = []
    for (const entry of weekEntries) {
      if (!entry.recipeId || entry.cookedAt || seen.has(entry.recipeId)) continue
      const recipe = db.recipes.find((r) => r.id === entry.recipeId)
      if (!recipe) continue
      if (!recipeAvailability(db, recipe, entry.servings).canCook) {
        seen.add(entry.recipeId)
        out.push({ recipeId: recipe.id, name: recipe.name, servings: entry.servings })
      }
    }
    return out
  }, [db, weekEntries])

  const weekLabel = `${parseDate(weekStart).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${parseDate(
    addDays(weekStart, 6),
  ).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`

  return (
    <>
      <TopBar
        title="Meal plan"
        subtitle={weekLabel}
        actions={
          <>
            <button
              className="icon-btn"
              onClick={() => setWeekStart(addDays(weekStart, -7))}
              aria-label="Previous week"
            >
              <IconChevronLeft />
            </button>
            <button
              className="icon-btn"
              onClick={() => setWeekStart(addDays(weekStart, 7))}
              aria-label="Next week"
            >
              <IconChevronRight />
            </button>
          </>
        }
      />

      <main className="main">
        {weekStart !== startOfWeek(today, db.settings.weekStartsOn) && (
          <button
            className="btn block"
            style={{ marginBottom: 14 }}
            onClick={() => setWeekStart(startOfWeek(today, db.settings.weekStartsOn))}
          >
            Back to this week
          </button>
        )}

        {shortRecipes.length > 0 && (
          <div className="install-banner">
            <div className="row-main">
              {shortRecipes.length} planned{' '}
              {shortRecipes.length === 1 ? 'meal is' : 'meals are'} missing ingredients.
            </div>
            <button
              className="btn sm"
              onClick={() => {
                const listId = db.shoppingLists[0]?.id
                if (!listId) return
                let added = 0
                for (const r of shortRecipes) added += addShortfall(r.recipeId, listId, r.servings)
                toast(added > 0 ? `Added ${added} item${added === 1 ? '' : 's'} to your list` : 'Already on the list')
              }}
            >
              Add to list
            </button>
          </div>
        )}

        <div className="week">
          {days.map((date) => {
            const entries = db.mealPlan
              .filter((e) => e.date === date)
              .sort(
                (a, b) =>
                  MEAL_TYPES.findIndex((m) => m.value === a.mealType) -
                  MEAL_TYPES.findIndex((m) => m.value === b.mealType),
              )
            return (
              <div key={date} className={clsx('day', date === today && 'today')}>
                <div className="day-head">
                  <span className="dow">{weekdayName(date)}</span>
                  <span className="dom">{parseDate(date).getDate()}</span>
                </div>
                <div className="day-body">
                  {entries.map((entry) => {
                    const recipe = db.recipes.find((r) => r.id === entry.recipeId)
                    return (
                      <button
                        key={entry.id}
                        className={clsx('meal', entry.cookedAt && 'cooked')}
                        onClick={() => setEditing({ date, entry })}
                      >
                        <div className="type">{entry.mealType}</div>
                        <div className="name">{recipe?.name ?? entry.note ?? 'Planned'}</div>
                      </button>
                    )
                  })}
                  <button className="add-meal" onClick={() => setEditing({ date })}>
                    + Add
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </main>

      {editing && (
        <MealDialog
          date={editing.date}
          entry={editing.entry}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

function MealDialog({
  date,
  entry,
  onClose,
}: {
  date: string
  entry?: MealPlanEntry
  onClose: () => void
}) {
  const db = useDb()
  const toast = useToast()
  const setEntry = useStore((s) => s.setMealPlanEntry)
  const removeEntry = useStore((s) => s.removeMealPlanEntry)
  const cookEntry = useStore((s) => s.cookMealPlanEntry)

  const [mealType, setMealType] = useState<MealType>(entry?.mealType ?? 'dinner')
  const [recipeId, setRecipeId] = useState(entry?.recipeId ?? '')
  const [note, setNote] = useState(entry?.note ?? '')
  const [servings, setServings] = useState(entry?.servings ?? 2)

  const recipe = db.recipes.find((r) => r.id === recipeId)
  const availability = recipe ? recipeAvailability(db, recipe, servings) : null
  const canSave = Boolean(recipeId || note.trim())

  const save = () => {
    if (!canSave) return
    setEntry({
      id: entry?.id,
      date,
      mealType,
      recipeId: recipeId || undefined,
      note: recipeId ? undefined : note.trim(),
      servings,
      cookedAt: entry?.cookedAt,
    })
    onClose()
  }

  return (
    <Modal
      title={parseDate(date).toLocaleDateString(undefined, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })}
      onClose={onClose}
      footer={
        <>
          {entry && (
            <button
              className="btn danger"
              onClick={() => {
                removeEntry(entry.id)
                onClose()
              }}
            >
              Remove
            </button>
          )}
          <button className="btn primary" onClick={save} disabled={!canSave}>
            Save
          </button>
        </>
      }
    >
      <Field label="Meal">
        <Select value={mealType} onChange={(e) => setMealType(e.target.value as MealType)}>
          {MEAL_TYPES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Recipe">
        <Select value={recipeId} onChange={(e) => setRecipeId(e.target.value)}>
          <option value="">Something else…</option>
          {[...db.recipes]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
        </Select>
      </Field>

      {!recipeId && (
        <Field label="What's the plan?">
          <TextInput
            value={note}
            placeholder="e.g. Takeout night"
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      )}

      <Field label="Servings">
        <Stepper value={servings} onChange={setServings} min={1} />
      </Field>

      {availability && (
        <div style={{ marginBottom: 14 }}>
          {availability.canCook ? (
            <Badge tone="ok">Everything is in stock</Badge>
          ) : (
            <Badge tone="warn">{availability.missingCount} ingredients short</Badge>
          )}
        </div>
      )}

      {entry && recipe && (
        <div className="btn-row">
          <button className="btn" onClick={() => navigate(`/recipes/${recipe.id}`)}>
            Open recipe
          </button>
          {entry.cookedAt ? (
            <Badge tone="ok">Already cooked</Badge>
          ) : (
            <button
              className="btn"
              onClick={() => {
                cookEntry(entry.id)
                toast(`Deducted ingredients for ${recipe.name}`)
                onClose()
              }}
            >
              Mark cooked &amp; deduct
            </button>
          )}
        </div>
      )}
    </Modal>
  )
}
