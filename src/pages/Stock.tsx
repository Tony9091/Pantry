import { useMemo, useState } from 'react'
import { navigate, useQuery } from '../lib/router'
import { useDb, useStore } from '../store/useStore'
import {
  expiryStatus,
  makeLookups,
  productStats,
  productStock,
  type ProductStock,
} from '../store/selectors'
import {
  clsx,
  formatAmount,
  formatDate,
  formatMoney,
  formatUnitPrice,
  groupBy,
  matches,
  relativeDays,
} from '../lib/util'
import { TopBar } from '../components/Layout'
import { Badge, Card, ConfirmDialog, EmptyState, SearchInput } from '../components/ui'
import { ConsumeDialog, ProductDialog, PurchaseDialog } from '../components/dialogs'
import { BarcodeScanner, isScannerSupported } from '../components/BarcodeScanner'
import { PriceHistory } from '../components/PriceHistory'
import {
  IconBarcode,
  IconBox,
  IconChef,
  IconChevronRight,
  IconEdit,
  IconPlus,
  IconSnow,
  IconTrash,
} from '../components/icons'
import type { StockAction } from '../types'

type Filter = 'all' | 'expired' | 'soon' | 'missing' | 'instock'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'instock', label: 'In stock' },
  { value: 'expired', label: 'Expired' },
  { value: 'soon', label: 'Expiring' },
  { value: 'missing', label: 'Below min' },
]

export function StockPage() {
  const db = useDb()
  const query = useQuery()
  const lookups = useMemo(() => makeLookups(db), [db])
  const stock = useMemo(() => productStock(db), [db])

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>((query.get('filter') as Filter) ?? 'all')
  const [locationId, setLocationId] = useState<string>('')
  const [creating, setCreating] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scannedCode, setScannedCode] = useState<string | null>(null)

  const rows = useMemo(() => {
    const warn = db.settings.expiryWarnDays
    return [...stock.values()]
      .filter((row) => {
        if (!matches(row.product.name, search)) return false
        if (locationId && row.product.locationId !== locationId) return false
        switch (filter) {
          case 'instock':
            return row.total > 0
          case 'missing':
            return row.belowMin
          case 'expired':
            return row.entries.some(
              (e) =>
                expiryStatus(e.bestBefore, warn, lookups.isFreezer(e.locationId)) === 'expired',
            )
          case 'soon':
            return row.entries.some((e) => {
              const s = expiryStatus(e.bestBefore, warn, lookups.isFreezer(e.locationId))
              return s === 'soon' || s === 'expired'
            })
          default:
            return true
        }
      })
      .sort((a, b) => a.product.name.localeCompare(b.product.name))
  }, [stock, search, filter, locationId, db.settings.expiryWarnDays, lookups])

  const grouped = useMemo(
    () => groupBy(rows, (row) => lookups.groupName(row.product.groupId)),
    [rows, lookups],
  )
  const groupNames = useMemo(() => [...grouped.keys()].sort(), [grouped])

  /** A scanned code either opens the matching product or pre-fills a new one. */
  const handleScan = (code: string) => {
    setScanning(false)
    const found = db.products.find((p) => p.barcode === code)
    if (found) {
      navigate(`/stock/${found.id}`)
    } else {
      setScannedCode(code)
      setCreating(true)
    }
  }

  if (scanning) {
    return <BarcodeScanner onDetected={handleScan} onClose={() => setScanning(false)} />
  }

  return (
    <>
      <TopBar
        title="Stock"
        subtitle={`${db.products.length} products · ${db.stock.length} batches`}
        actions={
          <>
            <button
              className="icon-btn"
              onClick={() => setScanning(true)}
              title={isScannerSupported() ? 'Scan barcode' : 'Enter barcode'}
              aria-label="Scan barcode"
            >
              <IconBarcode />
            </button>
            <button className="btn primary desktop-only" onClick={() => setCreating(true)}>
              <IconPlus />
              New product
            </button>
          </>
        }
      />

      <main className="main">
        <div className="toolbar">
          <SearchInput value={search} onChange={setSearch} placeholder="Search products…" />
          {db.locations.length > 0 && (
            <select
              className="input"
              style={{ width: 'auto', flexShrink: 0 }}
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
            >
              <option value="">All locations</option>
              {db.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="chips">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              className={clsx('chip', filter === f.value && 'active')}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {rows.length === 0 ? (
          <Card>
            <EmptyState
              title={db.products.length === 0 ? 'No products yet' : 'Nothing matches'}
              message={
                db.products.length === 0
                  ? 'Add the things you keep at home — Pantry tracks the amounts, dates and locations for you.'
                  : 'Try a different filter or search term.'
              }
              action={
                db.products.length === 0 ? (
                  <button className="btn primary" onClick={() => setCreating(true)}>
                    <IconPlus />
                    New product
                  </button>
                ) : undefined
              }
            />
          </Card>
        ) : (
          groupNames.map((groupName) => (
            <div key={groupName}>
              <div className="section-title">{groupName}</div>
              <Card flush>
                {grouped.get(groupName)!.map((row) => (
                  <StockRow key={row.product.id} row={row} />
                ))}
              </Card>
            </div>
          ))
        )}
      </main>

      <button className="fab" onClick={() => setCreating(true)} aria-label="New product">
        <IconPlus />
      </button>

      {creating && (
        <ProductDialog
          initialBarcode={scannedCode ?? undefined}
          onClose={() => {
            setCreating(false)
            setScannedCode(null)
          }}
          onSaved={(product) => navigate(`/stock/${product.id}`)}
        />
      )}
    </>
  )
}

function StockRow({ row }: { row: ProductStock }) {
  const db = useDb()
  const lookups = useMemo(() => makeLookups(db), [db])
  const { product, total, nextExpiry, belowMin } = row

  const inFreezer = lookups.isFreezer(product.locationId)
  const status = expiryStatus(nextExpiry, db.settings.expiryWarnDays, inFreezer)

  return (
    <div className="row tappable" onClick={() => navigate(`/stock/${product.id}`)}>
      <div className="row-main">
        <div className="row-title">
          {product.name}
          {inFreezer && <IconSnow style={{ width: 14, marginLeft: 6, verticalAlign: -2, opacity: 0.6 }} />}
        </div>
        <div className="row-sub">
          {total > 0 ? (
            <>
              {formatAmount(total)} {lookups.unitName(product.unitId, total)}
              {product.locationId ? ` · ${lookups.locationName(product.locationId)}` : ''}
            </>
          ) : (
            'Out of stock'
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
        {status === 'expired' && <Badge tone="danger">Expired</Badge>}
        {status === 'soon' && nextExpiry && <Badge tone="warn">{relativeDays(nextExpiry)}</Badge>}
        {belowMin && <Badge tone="info">Low</Badge>}
        <IconChevronRight className="muted" style={{ width: 18 }} />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ detail page */

export function ProductDetailPage({ productId }: { productId: string }) {
  const db = useDb()
  const lookups = useMemo(() => makeLookups(db), [db])
  const stock = useMemo(() => productStock(db), [db])
  const stats = useMemo(() => productStats(db, productId), [db, productId])
  const openEntry = useStore((s) => s.openEntry)
  const removeStockEntry = useStore((s) => s.removeStockEntry)
  const removeProduct = useStore((s) => s.removeProduct)

  const [editing, setEditing] = useState(false)
  const [purchasing, setPurchasing] = useState(false)
  const [consuming, setConsuming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const row = stock.get(productId)
  if (!row) {
    return (
      <>
        <TopBar title="Not found" />
        <main className="main">
          <Card>
            <EmptyState
              title="This product no longer exists"
              action={
                <button className="btn" onClick={() => navigate('/stock')}>
                  Back to stock
                </button>
              }
            />
          </Card>
        </main>
      </>
    )
  }

  const { product, total, entries, belowMin, shortfall } = row
  const recipesUsing = db.recipes.filter((r) => r.ingredients.some((i) => i.productId === productId))
  const history = db.stockLog.filter((l) => l.productId === productId).slice(0, 12)

  return (
    <>
      <TopBar
        title={product.name}
        subtitle={`${formatAmount(total)} ${lookups.unitName(product.unitId, total)} in stock`}
        back={
          <button className="icon-btn bare" onClick={() => navigate('/stock')} aria-label="Back">
            <IconChevronRight style={{ transform: 'rotate(180deg)' }} />
          </button>
        }
        actions={
          <button className="icon-btn" onClick={() => setEditing(true)} aria-label="Edit product">
            <IconEdit />
          </button>
        }
      />

      <main className="main">
        <div className="btn-row" style={{ marginBottom: 16 }}>
          <button className="btn primary" style={{ flex: 1 }} onClick={() => setPurchasing(true)}>
            <IconPlus />
            Add stock
          </button>
          <button
            className="btn"
            style={{ flex: 1 }}
            disabled={total <= 0}
            onClick={() => setConsuming(true)}
          >
            Use
          </button>
        </div>

        {belowMin && (
          <div className="install-banner">
            <div className="row-main">
              Below the minimum of {formatAmount(product.minStock)}{' '}
              {lookups.unitName(product.unitId, product.minStock)} — {formatAmount(shortfall)} short.
            </div>
            <button className="btn sm" onClick={() => navigate('/shopping')}>
              Shop
            </button>
          </div>
        )}

        <Card title="Batches" count={`${entries.length}`} flush>
          {entries.length === 0 ? (
            <EmptyState title="Nothing in stock" message="Add stock when you next buy this." />
          ) : (
            entries.map((entry) => {
              const status = expiryStatus(
                entry.bestBefore,
                db.settings.expiryWarnDays,
                lookups.isFreezer(entry.locationId),
              )
              return (
                <div key={entry.id} className="row">
                  <div className="row-main">
                    <div className="row-title">
                      {formatAmount(entry.amount)} {lookups.unitName(product.unitId, entry.amount)}
                      {entry.openedAt && (
                        <span style={{ marginLeft: 7 }}>
                          <Badge tone="neutral">Opened</Badge>
                        </span>
                      )}
                    </div>
                    <div className="row-sub">
                      {entry.bestBefore ? `Best before ${relativeDays(entry.bestBefore)}` : 'No expiry'}
                      {entry.locationId ? ` · ${lookups.locationName(entry.locationId)}` : ''}
                    </div>
                  </div>
                  {status === 'expired' && <Badge tone="danger">Expired</Badge>}
                  {status === 'soon' && <Badge tone="warn">Soon</Badge>}
                  {!entry.openedAt && (
                    <button className="btn sm" onClick={() => openEntry(entry.id)}>
                      Open
                    </button>
                  )}
                  <button
                    className="icon-btn bare"
                    onClick={() => removeStockEntry(entry.id)}
                    aria-label="Remove batch"
                    title="Remove batch"
                  >
                    <span style={{ fontSize: 18, lineHeight: 1 }}>×</span>
                  </button>
                </div>
              )
            })
          )}
        </Card>

        <Card title="Product overview">
          <dl className="facts">
            <Fact
              label="Stock amount"
              value={`${formatAmount(stats.total)} ${lookups.unitName(product.unitId, stats.total)}`}
              qualifier={
                stats.openedAmount > 0 ? `${formatAmount(stats.openedAmount)} opened` : undefined
              }
            />
            {stats.stockValue > 0 && (
              <Fact
                label="Stock value"
                value={formatMoney(stats.stockValue, db.settings.currency)}
              />
            )}
            <Fact label="Default location" value={lookups.locationName(product.locationId) || '—'} />
            <Fact
              label="Last purchased"
              value={stats.lastPurchased ? formatDate(stats.lastPurchased.slice(0, 10)) : 'Never'}
              qualifier={
                stats.lastPurchased ? relativeDays(stats.lastPurchased.slice(0, 10)) : undefined
              }
            />
            <Fact
              label="Last used"
              value={stats.lastUsed ? formatDate(stats.lastUsed.slice(0, 10)) : 'Never'}
              qualifier={stats.lastUsed ? relativeDays(stats.lastUsed.slice(0, 10)) : undefined}
            />
            {stats.lastUnitPrice !== undefined && (
              <Fact
                label="Last price"
                value={`${formatUnitPrice(stats.lastUnitPrice, db.settings.currency)} per ${lookups.unitName(product.unitId, 1)}`}
              />
            )}
            {stats.averageUnitPrice !== undefined && (
              <Fact
                label="Average price"
                value={`${formatUnitPrice(stats.averageUnitPrice, db.settings.currency)} per ${lookups.unitName(product.unitId, 1)}`}
              />
            )}
            {stats.lastUnitCost && (
              <Fact
                label="Real cost"
                value={`${formatUnitPrice(stats.lastUnitCost.value, db.settings.currency)} / ${stats.lastUnitCost.label}`}
                qualifier="last buy"
              />
            )}
            {stats.averageUnitCost && (
              <Fact
                label="Average real cost"
                value={`${formatUnitPrice(stats.averageUnitCost.value, db.settings.currency)} / ${stats.averageUnitCost.label}`}
              />
            )}
            {stats.averageShelfLifeDays !== undefined && (
              <Fact
                label="Average shelf life"
                value={describeDuration(stats.averageShelfLifeDays)}
              />
            )}
            {stats.spoilRate !== undefined && (
              <Fact
                label="Spoil rate"
                value={`${Math.round(stats.spoilRate * 100)}%`}
                // Anything over a fifth binned is worth flagging.
                bad={stats.spoilRate > 0.2}
              />
            )}
            <Fact label="Category" value={lookups.groupName(product.groupId)} />
            <Fact
              label="Minimum stock"
              value={product.minStock > 0 ? formatAmount(product.minStock) : 'Not set'}
            />
            {product.barcode && <Fact label="Barcode" value={product.barcode} />}
            {product.note && <Fact label="Note" value={product.note} />}
          </dl>
        </Card>

        {stats.priceHistory.length >= 2 && (
          <Card title="Price history">
            <PriceHistory
              points={stats.priceHistory}
              currency={db.settings.currency}
              storeName={lookups.storeName}
              unitLabel={lookups.unitName(product.unitId, 1)}
            />
          </Card>
        )}

        {recipesUsing.length > 0 && (
          <Card title="Used in recipes" count={`${recipesUsing.length}`} flush>
            {recipesUsing.map((recipe) => (
              <div
                key={recipe.id}
                className="row tappable"
                onClick={() => navigate(`/recipes/${recipe.id}`)}
              >
                <div className="row-main">
                  <div className="row-title">{recipe.name}</div>
                </div>
                <IconChevronRight className="muted" style={{ width: 18 }} />
              </div>
            ))}
          </Card>
        )}

        {history.length > 0 && (
          <Card title="History" count={`${history.length}`} flush>
            <div className="timeline">
              {history.map((entry) => (
                <HistoryEntry
                  key={entry.id}
                  action={entry.action}
                  amount={entry.amount}
                  note={entry.note}
                  ts={entry.ts}
                  unit={lookups.unitName(product.unitId, entry.amount)}
                />
              ))}
            </div>
          </Card>
        )}

        <div style={{ marginTop: 16 }}>
          <button className="btn danger block" onClick={() => setDeleting(true)}>
            <IconTrash />
            Delete product
          </button>
        </div>
      </main>

      {editing && <ProductDialog product={product} onClose={() => setEditing(false)} />}
      {purchasing && <PurchaseDialog productId={product.id} onClose={() => setPurchasing(false)} />}
      {consuming && <ConsumeDialog productId={product.id} onClose={() => setConsuming(false)} />}
      {deleting && (
        <ConfirmDialog
          title={`Delete ${product.name}?`}
          message={`This also removes its ${entries.length} stock ${
            entries.length === 1 ? 'batch' : 'batches'
          } and any shopping list entries. Recipes keep the ingredient as free text.`}
          onConfirm={() => {
            removeProduct(product.id)
            navigate('/stock')
          }}
          onClose={() => setDeleting(false)}
        />
      )}
    </>
  )
}

/** One event on the stock timeline. Each action gets its own icon, colour and
 *  plain-English phrasing — "Bought" reads faster than "purchase". */
function HistoryEntry({
  action,
  amount,
  note,
  ts,
  unit,
}: {
  action: StockAction
  amount: number
  note?: string
  ts: string
  unit: string
}) {
  /** `dir` is the effect on stock. The log stores consumption as a positive
   *  quantity, so the sign has to come from the action, not from `amount`. */
  const meta: Record<
    StockAction,
    { label: string; icon: typeof IconPlus; dir: 'up' | 'down' | 'signed' | 'none' }
  > = {
    purchase: { label: 'Bought', icon: IconPlus, dir: 'up' },
    consume: { label: 'Used', icon: IconChef, dir: 'down' },
    spoil: { label: 'Went to waste', icon: IconTrash, dir: 'down' },
    // "Opened" records the batch size rather than a change.
    open: { label: 'Opened', icon: IconBox, dir: 'none' },
    // Corrections are a true delta and carry their own sign.
    correction: { label: 'Adjusted', icon: IconEdit, dir: 'signed' },
  }
  const { label, icon: Icon, dir } = meta[action]
  const when = new Date(ts)
  const isUp = dir === 'up' || (dir === 'signed' && amount > 0)

  return (
    <div className={`tl ${action}`}>
      <div className="tl-node">
        <Icon />
      </div>
      <div className="tl-body">
        <div className="tl-title">
          <span>{label}</span>
          {dir !== 'none' && (
            <span className={`tl-delta ${isUp ? 'up' : 'down'}`}>
              {isUp ? '+' : '−'}
              {formatAmount(Math.abs(amount))} {unit}
            </span>
          )}
        </div>
        <div className="tl-when">
          {when.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ·{' '}
          {when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
          {note ? ` · ${note}` : ''}
        </div>
      </div>
    </div>
  )
}

/** One line of the product overview panel. */
function Fact({
  label,
  value,
  qualifier,
  bad,
}: {
  label: string
  value: string
  qualifier?: string
  bad?: boolean
}) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd className={bad ? 'bad' : undefined}>
        {value}
        {qualifier && <span className="qual">{qualifier}</span>}
      </dd>
    </div>
  )
}

/** Grocy reports shelf life in months once it's long enough to be clearer. */
function describeDuration(days: number): string {
  if (days >= 365) {
    const years = Math.round(days / 365)
    return `${years} year${years === 1 ? '' : 's'}`
  }
  if (days >= 60) {
    const months = Math.round(days / 30)
    return `${months} month${months === 1 ? '' : 's'}`
  }
  return `${days} day${days === 1 ? '' : 's'}`
}
