import { useMemo } from 'react'
import { Link, navigate } from '../lib/router'
import { useDb, useStore } from '../store/useStore'
import {
  choresDue,
  cookableRecipes,
  expiringEntries,
  inventoryValue,
  makeLookups,
  mealPlanFor,
  missingProducts,
} from '../store/selectors'
import { formatAmount, formatMoney, isoDate, relativeDays } from '../lib/util'
import { TopBar } from '../components/Layout'
import { Badge, Card, EmptyState } from '../components/ui'
import { IconChef, IconChevronRight } from '../components/icons'

export function Dashboard() {
  const db = useDb()
  const trackChore = useStore((s) => s.trackChore)
  const lookups = useMemo(() => makeLookups(db), [db])

  const expiring = useMemo(() => expiringEntries(db), [db])
  const expired = expiring.filter((e) => e.status === 'expired')
  const soon = expiring.filter((e) => e.status === 'soon')
  const missing = useMemo(() => missingProducts(db), [db])
  const chores = useMemo(() => choresDue(db), [db])
  const cookable = useMemo(() => cookableRecipes(db), [db])
  const today = isoDate()
  const todaysMeals = useMemo(() => mealPlanFor(db, today), [db, today])
  const value = useMemo(() => inventoryValue(db), [db])

  const isEmpty = db.products.length === 0

  return (
    <>
      <TopBar title={`Hi — ${db.settings.householdName}`} subtitle={new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} />
      <main className="main">
        {isEmpty ? (
          <Card>
            <EmptyState
              title="Your pantry is empty"
              message="Add the things you keep at home and Pantry will track what's running low, what's about to expire, and what you can cook."
              action={
                <div className="btn-row" style={{ justifyContent: 'center' }}>
                  <Link to="/stock" className="btn primary">
                    Add your first product
                  </Link>
                  <Link to="/settings" className="btn">
                    Load demo data
                  </Link>
                </div>
              }
            />
          </Card>
        ) : (
          <>
            <div className="stats">
              <button className="stat danger" onClick={() => navigate('/stock?filter=expired')}>
                <div className="value">{expired.length}</div>
                <div className="label">Expired</div>
              </button>
              <button className="stat warn" onClick={() => navigate('/stock?filter=soon')}>
                <div className="value">{soon.length}</div>
                <div className="label">Expiring soon</div>
              </button>
              <button className="stat info" onClick={() => navigate('/stock?filter=missing')}>
                <div className="value">{missing.length}</div>
                <div className="label">Below minimum</div>
              </button>
              <button className="stat ok" onClick={() => navigate('/stock')}>
                <div className="value">{db.products.length}</div>
                <div className="label">
                  Products{value > 0 ? ` · ${formatMoney(value, db.settings.currency)}` : ''}
                </div>
              </button>
            </div>

            {todaysMeals.length > 0 && (
              <Card title="On the menu today" flush>
                {todaysMeals.map((entry) => {
                  const recipe = db.recipes.find((r) => r.id === entry.recipeId)
                  return (
                    <div
                      key={entry.id}
                      className="row tappable"
                      onClick={() => (recipe ? navigate(`/recipes/${recipe.id}`) : navigate('/plan'))}
                    >
                      <div className="row-main">
                        <div className="row-title">{recipe?.name ?? entry.note ?? 'Planned meal'}</div>
                        <div className="row-sub">
                          <span style={{ textTransform: 'capitalize' }}>{entry.mealType}</span> ·{' '}
                          {entry.servings} servings
                        </div>
                      </div>
                      {entry.cookedAt ? <Badge tone="ok">Cooked</Badge> : <IconChevronRight className="muted" style={{ width: 18 }} />}
                    </div>
                  )
                })}
              </Card>
            )}

            {expiring.length > 0 && (
              <Card
                title="Use these first"
                count={`${expiring.length}`}
                flush
              >
                {expiring.slice(0, 6).map(({ entry, product, status }) => (
                  <div
                    key={entry.id}
                    className="row tappable"
                    onClick={() => navigate(`/stock/${product.id}`)}
                  >
                    <div className="row-main">
                      <div className="row-title">{product.name}</div>
                      <div className="row-sub">
                        {formatAmount(entry.amount)} {lookups.unitName(product.unitId, entry.amount)}
                        {entry.locationId ? ` · ${lookups.locationName(entry.locationId)}` : ''}
                      </div>
                    </div>
                    <Badge tone={status === 'expired' ? 'danger' : 'warn'}>
                      {entry.bestBefore ? relativeDays(entry.bestBefore) : ''}
                    </Badge>
                  </div>
                ))}
                {expiring.length > 6 && (
                  <Link to="/stock?filter=soon" className="row tappable">
                    <div className="row-main">
                      <div className="row-title" style={{ color: 'var(--accent)' }}>
                        See all {expiring.length}
                      </div>
                    </div>
                  </Link>
                )}
              </Card>
            )}

            {missing.length > 0 && (
              <Card title="Running low" count={`${missing.length}`} flush>
                {missing.slice(0, 6).map((row) => (
                  <div
                    key={row.product.id}
                    className="row tappable"
                    onClick={() => navigate(`/stock/${row.product.id}`)}
                  >
                    <div className="row-main">
                      <div className="row-title">{row.product.name}</div>
                      <div className="row-sub">
                        {formatAmount(row.total)} of {formatAmount(row.product.minStock)}{' '}
                        {lookups.unitName(row.product.unitId, row.product.minStock)}
                      </div>
                    </div>
                    <Badge tone="info">need {formatAmount(row.shortfall)}</Badge>
                  </div>
                ))}
                <Link to="/shopping" className="row tappable">
                  <div className="row-main">
                    <div className="row-title" style={{ color: 'var(--accent)' }}>
                      Add them to the shopping list
                    </div>
                  </div>
                  <IconChevronRight className="muted" style={{ width: 18 }} />
                </Link>
              </Card>
            )}

            {chores.length > 0 && (
              <Card title="Chores due" count={`${chores.length}`} flush>
                {chores.slice(0, 5).map(({ chore, overdue }) => (
                  <div key={chore.id} className="row">
                    <div className="row-main">
                      <div className="row-title">{chore.name}</div>
                      <div className="row-sub">{chore.assignedTo ?? 'Anyone'}</div>
                    </div>
                    {overdue && <Badge tone="danger">Overdue</Badge>}
                    <button className="btn sm" onClick={() => trackChore(chore.id)}>
                      Done
                    </button>
                  </div>
                ))}
              </Card>
            )}

            {cookable.length > 0 && (
              <Card title="You can cook this now" count={`${cookable.length}`} flush>
                {cookable.slice(0, 5).map((recipe) => (
                  <div
                    key={recipe.id}
                    className="row tappable"
                    onClick={() => navigate(`/recipes/${recipe.id}`)}
                  >
                    <IconChef className="muted" style={{ width: 20, flexShrink: 0 }} />
                    <div className="row-main">
                      <div className="row-title">{recipe.name}</div>
                      <div className="row-sub">
                        {recipe.servings} servings
                        {recipe.prepTime ? ` · ${recipe.prepTime} min` : ''}
                      </div>
                    </div>
                    <IconChevronRight className="muted" style={{ width: 18 }} />
                  </div>
                ))}
              </Card>
            )}

            {expiring.length === 0 && missing.length === 0 && chores.length === 0 && (
              <Card>
                <EmptyState
                  title="Nothing needs your attention"
                  message="No expiring food, nothing below its minimum, and no chores due. Nice."
                />
              </Card>
            )}
          </>
        )}
      </main>
    </>
  )
}
