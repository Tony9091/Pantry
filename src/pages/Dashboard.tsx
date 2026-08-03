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

/** Donut showing how the pantry splits across the ripeness spectrum. The
 *  proportions are the point — a single number can't show "mostly fine but
 *  three things are about to go". */
function FreshnessRing({
  fresh,
  soon,
  expired,
}: {
  fresh: number
  soon: number
  expired: number
}) {
  const total = fresh + soon + expired
  const R = 42
  const C = 2 * Math.PI * R

  // Nothing tracked yet — show an empty track rather than a divide-by-zero.
  const segments =
    total === 0
      ? []
      : (
          [
            { value: expired, color: 'var(--paprika)' },
            { value: soon, color: 'var(--zest)' },
            { value: fresh, color: 'var(--leaf-bright)' },
          ] as const
        ).filter((s) => s.value > 0)

  let offset = 0

  return (
    <div className="hero-ring">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={R} stroke="rgba(255,255,255,0.14)" strokeWidth="11" />
        {segments.map((seg, i) => {
          const len = (seg.value / total) * C
          // 2px visual gap between arcs, but never on a single full ring.
          const gap = segments.length > 1 ? 2 : 0
          const dash = Math.max(0, len - gap)
          const el = (
            <circle
              key={i}
              cx="50"
              cy="50"
              r={R}
              stroke={seg.color}
              strokeWidth="11"
              strokeDasharray={`${dash} ${C - dash}`}
              strokeDashoffset={-offset}
              style={
                {
                  '--dash-len': `${dash}`,
                  animationDelay: `${0.1 + i * 0.12}s`,
                } as React.CSSProperties
              }
            />
          )
          offset += len
          return el
        })}
      </svg>
      <div className="hero-ring-label">
        <span className="n">{total === 0 ? '—' : fresh}</span>
        <span className="t">fresh</span>
      </div>
    </div>
  )
}

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

  // Batches with a date that aren't expired or inside the warning window.
  const freshCount = db.stock.filter((e) => e.bestBefore).length - expiring.length
  const attention = expired.length + soon.length

  const isEmpty = db.products.length === 0

  /** One honest sentence about the state of the kitchen. */
  const headline = isEmpty
    ? 'Let’s fill the shelves'
    : expired.length > 0
      ? `${expired.length} thing${expired.length === 1 ? '' : 's'} went past`
      : soon.length > 0
        ? `Eat ${soon.length} thing${soon.length === 1 ? '' : 's'} soon`
        : missing.length > 0
          ? `${missing.length} to restock`
          : 'Everything looks good'

  const subline = isEmpty
    ? 'Add what you keep at home and this fills itself in.'
    : expired.length > 0
      ? 'Check them before you bin them — some may still be fine.'
      : soon.length > 0
        ? 'Plan a meal around these and nothing goes to waste.'
        : missing.length > 0
          ? 'Nothing is spoiling. A few staples are running low.'
          : 'Nothing spoiling, nothing low, nothing overdue.'

  return (
    <>
      <TopBar
        title={db.settings.householdName}
        subtitle={new Date().toLocaleDateString(undefined, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })}
      />
      <main className="main">
        <section className="hero">
          <div className="hero-copy">
            <div className="hero-eyebrow">In the kitchen</div>
            <h2 className="hero-headline">{headline}</h2>
            <p className="hero-sub">{subline}</p>
          </div>
          <FreshnessRing
            fresh={Math.max(0, freshCount)}
            soon={soon.length}
            expired={expired.length}
          />
        </section>

        {isEmpty ? (
          <Card>
            <EmptyState
              title="Nothing on the shelves yet"
              message="Add the things you keep at home and Pantry will track what's running low, what's about to expire, and what you can cook tonight."
              action={
                <div className="btn-row" style={{ justifyContent: 'center' }}>
                  <Link to="/stock" className="btn primary">
                    Add a product
                  </Link>
                  <Link to="/settings" className="btn">
                    Try the demo
                  </Link>
                </div>
              }
            />
          </Card>
        ) : (
          <>
            {expiring.length > 0 && (
              <>
                <div className="section-title">Eat these first</div>
                <div className="shelf">
                  {expiring.slice(0, 10).map(({ entry, product, status }) => (
                    <button
                      key={entry.id}
                      className="shelf-card"
                      style={
                        {
                          '--stripe':
                            status === 'expired' ? 'var(--paprika)' : 'var(--zest)',
                        } as React.CSSProperties
                      }
                      onClick={() => navigate(`/stock/${product.id}`)}
                    >
                      <div className="when">
                        {entry.bestBefore ? relativeDays(entry.bestBefore) : ''}
                      </div>
                      <div className="what">{product.name}</div>
                      <div className="qty">
                        {formatAmount(entry.amount)}{' '}
                        {lookups.unitName(product.unitId, entry.amount)}
                        {entry.locationId ? ` · ${lookups.locationName(entry.locationId)}` : ''}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="stats">
              <button className="stat danger" onClick={() => navigate('/stock?filter=expired')}>
                <div className="value">{expired.length}</div>
                <div className="label">Past it</div>
              </button>
              <button className="stat warn" onClick={() => navigate('/stock?filter=soon')}>
                <div className="value">{soon.length}</div>
                <div className="label">Use soon</div>
              </button>
              <button className="stat info" onClick={() => navigate('/stock?filter=missing')}>
                <div className="value">{missing.length}</div>
                <div className="label">Running low</div>
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
                      onClick={() =>
                        recipe ? navigate(`/recipes/${recipe.id}`) : navigate('/plan')
                      }
                    >
                      <div className="row-main">
                        <div className="row-title">
                          {recipe?.name ?? entry.note ?? 'Planned meal'}
                        </div>
                        <div className="row-sub">
                          <span style={{ textTransform: 'capitalize' }}>{entry.mealType}</span> ·{' '}
                          {entry.servings} servings
                        </div>
                      </div>
                      {entry.cookedAt ? (
                        <Badge tone="ok">Cooked</Badge>
                      ) : (
                        <IconChevronRight className="muted" style={{ width: 18 }} />
                      )}
                    </div>
                  )
                })}
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
                    <div className="row-title" style={{ color: 'var(--brand)' }}>
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
                    <IconChef style={{ width: 20, flexShrink: 0, color: 'var(--brand)' }} />
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

            {attention === 0 && missing.length === 0 && chores.length === 0 && (
              <Card>
                <EmptyState
                  title="Nothing needs you"
                  message="No food spoiling, nothing below its minimum, no chores due. Go and enjoy your evening."
                />
              </Card>
            )}
          </>
        )}
      </main>
    </>
  )
}
