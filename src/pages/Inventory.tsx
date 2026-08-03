/** Stocktake, modelled on Grocy's Inventory screen.
 *
 *  The distinction that matters: Purchase and Consume record a *change*, while
 *  Inventory records the truth. You count what's actually on the shelf, enter
 *  that number, and the app books the difference — which is what you want after
 *  someone in the house ate something without telling the app. */

import { useMemo, useState } from 'react'
import { navigate } from '../lib/router'
import { useDb, useStore } from '../store/useStore'
import { makeLookups, productStats } from '../store/selectors'
import {
  addDays,
  formatAmount,
  formatMoney,
  formatUnitPrice,
  isoDate,
  relativeDays,
} from '../lib/util'
import { TopBar } from '../components/Layout'
import {
  Badge,
  Card,
  EmptyState,
  Field,
  Select,
  Stepper,
  TextInput,
  useToast,
} from '../components/ui'
import { BarcodeScanner, isScannerSupported } from '../components/BarcodeScanner'
import { PriceHistory } from '../components/PriceHistory'
import { IconBarcode, IconChevronRight } from '../components/icons'

export function InventoryPage() {
  const db = useDb()
  const toast = useToast()
  const lookups = useMemo(() => makeLookups(db), [db])
  const inventory = useStore((s) => s.inventory)

  const [productId, setProductId] = useState('')
  const [amount, setAmount] = useState(0)
  const [dueDate, setDueDate] = useState('')
  const [neverOverdue, setNeverOverdue] = useState(false)
  const [price, setPrice] = useState('')
  const [storeId, setStoreId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [scanning, setScanning] = useState(false)

  const product = db.products.find((p) => p.id === productId)
  const stats = useMemo(
    () => (productId ? productStats(db, productId) : null),
    [db, productId],
  )

  /** Selecting a product pre-fills the form from what's already known. */
  const selectProduct = (id: string) => {
    setProductId(id)
    const next = db.products.find((p) => p.id === id)
    if (!next) return
    const current = db.stock
      .filter((e) => e.productId === id)
      .reduce((a, b) => a + b.amount, 0)
    setAmount(current)
    setStoreId(next.storeId ?? '')
    setLocationId(next.locationId ?? '')
    setDueDate(
      next.defaultBestBeforeDays ? addDays(isoDate(), next.defaultBestBeforeDays) : '',
    )
    setNeverOverdue(false)
    setPrice('')
  }

  const current = stats?.total ?? 0
  const delta = product ? amount - current : 0
  const changed = Math.abs(delta) > 0.0001

  const submit = () => {
    if (!product || !changed) return
    inventory(product.id, amount, {
      bestBefore: neverOverdue ? undefined : dueDate || undefined,
      locationId: locationId || undefined,
      price: price ? Number(price) : undefined,
      storeId: storeId || undefined,
    })
    toast(
      delta > 0
        ? `Added ${formatAmount(delta)} ${lookups.unitName(product.unitId, delta)}`
        : `Removed ${formatAmount(-delta)} ${lookups.unitName(product.unitId, -delta)}`,
    )
    // Re-read the product so the form reflects the new truth.
    selectProduct(product.id)
  }

  if (scanning) {
    return (
      <BarcodeScanner
        onClose={() => setScanning(false)}
        onDetected={(code) => {
          setScanning(false)
          const found = db.products.find((p) => p.barcode === code)
          if (found) selectProduct(found.id)
          else toast('No product has that barcode yet')
        }}
      />
    )
  }

  if (db.products.length === 0) {
    return (
      <>
        <TopBar title="Inventory" />
        <main className="main">
          <Card>
            <EmptyState
              title="Nothing to count yet"
              message="Add some products first, then come back here to record what's actually on the shelf."
              action={
                <button className="btn primary" onClick={() => navigate('/stock')}>
                  Go to stock
                </button>
              }
            />
          </Card>
        </main>
      </>
    )
  }

  return (
    <>
      <TopBar
        title="Inventory"
        subtitle="Record what's actually on the shelf"
        actions={
          <button
            className="icon-btn"
            onClick={() => setScanning(true)}
            aria-label="Scan barcode"
            title={isScannerSupported() ? 'Scan barcode' : 'Enter barcode'}
          >
            <IconBarcode />
          </button>
        }
      />

      <main className="main">
        <Card title="Stocktake">
          <Field label="Product">
            <Select value={productId} onChange={(e) => selectProduct(e.target.value)}>
              <option value="">Choose a product…</option>
              {[...db.products]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </Select>
          </Field>

          {product && (
            <>
              <div className="field-row">
                <Field
                  label="New stock amount"
                  hint={`Currently ${formatAmount(current)}`}
                >
                  <Stepper value={amount} onChange={setAmount} min={0} />
                </Field>
                <Field label="Quantity unit">
                  <Select value={product.unitId} disabled>
                    {db.units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              {changed && (
                <div className="install-banner" style={{ marginTop: 2 }}>
                  <div className="row-main">
                    {delta > 0 ? 'Booking in ' : 'Booking out '}
                    <strong>
                      {formatAmount(Math.abs(delta))}{' '}
                      {lookups.unitName(product.unitId, Math.abs(delta))}
                    </strong>
                  </div>
                  <Badge tone={delta > 0 ? 'ok' : 'warn'}>
                    {delta > 0 ? '+' : '−'}
                    {formatAmount(Math.abs(delta))}
                  </Badge>
                </div>
              )}

              {/* Only new stock needs a date, a price or a place to go. */}
              {delta > 0 && (
                <>
                  <Field label="Due date">
                    <TextInput
                      type="date"
                      value={dueDate}
                      disabled={neverOverdue}
                      onChange={(e) => setDueDate(e.target.value)}
                    />
                  </Field>

                  <label className="checkbox" style={{ marginBottom: 15 }}>
                    <input
                      type="checkbox"
                      checked={neverOverdue}
                      onChange={(e) => setNeverOverdue(e.target.checked)}
                    />
                    <span>Never overdue</span>
                  </label>

                  <div className="field-row">
                    <Field label={`Price (${db.settings.currency})`}>
                      <TextInput
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        placeholder="Optional"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                      />
                    </Field>
                    <Field label="Store">
                      <Select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                        <option value="">Unspecified</option>
                        {db.stores.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>

                  <Field label="Location">
                    <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                      <option value="">None</option>
                      {db.locations.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </>
              )}

              <button className="btn primary block" onClick={submit} disabled={!changed}>
                {changed ? 'Save stocktake' : 'Nothing to change'}
              </button>
            </>
          )}
        </Card>

        {product && stats && (
          <>
            <Card
              title="Product overview"
              action={
                <button
                  className="btn sm"
                  onClick={() => navigate(`/stock/${product.id}`)}
                  title="Open the full product page"
                >
                  Open
                  <IconChevronRight />
                </button>
              }
            >
              <h3 style={{ fontSize: 21, marginBottom: 10 }}>{product.name}</h3>
              <dl className="facts">
                <div className="fact">
                  <dt>Stock amount</dt>
                  <dd>
                    {formatAmount(stats.total)} {lookups.unitName(product.unitId, stats.total)}
                    {stats.openedAmount > 0 && (
                      <span className="qual">{formatAmount(stats.openedAmount)} opened</span>
                    )}
                  </dd>
                </div>
                {stats.stockValue > 0 && (
                  <div className="fact">
                    <dt>Stock value</dt>
                    <dd>{formatMoney(stats.stockValue, db.settings.currency)}</dd>
                  </div>
                )}
                <div className="fact">
                  <dt>Default location</dt>
                  <dd>{lookups.locationName(product.locationId) || '—'}</dd>
                </div>
                <div className="fact">
                  <dt>Last purchased</dt>
                  <dd>
                    {stats.lastPurchased ? (
                      <>
                        {stats.lastPurchased.slice(0, 10)}
                        <span className="qual">
                          {relativeDays(stats.lastPurchased.slice(0, 10))}
                        </span>
                      </>
                    ) : (
                      'Never'
                    )}
                  </dd>
                </div>
                <div className="fact">
                  <dt>Last used</dt>
                  <dd>
                    {stats.lastUsed ? (
                      <>
                        {stats.lastUsed.slice(0, 10)}
                        <span className="qual">{relativeDays(stats.lastUsed.slice(0, 10))}</span>
                      </>
                    ) : (
                      'Never'
                    )}
                  </dd>
                </div>
                {stats.lastUnitPrice !== undefined && (
                  <div className="fact">
                    <dt>Last price</dt>
                    <dd>
                      {formatUnitPrice(stats.lastUnitPrice, db.settings.currency)} per{' '}
                      {lookups.unitName(product.unitId, 1)}
                    </dd>
                  </div>
                )}
                {stats.averageUnitPrice !== undefined && (
                  <div className="fact">
                    <dt>Average price</dt>
                    <dd>
                      {formatUnitPrice(stats.averageUnitPrice, db.settings.currency)} per{' '}
                      {lookups.unitName(product.unitId, 1)}
                    </dd>
                  </div>
                )}
                {stats.lastUnitCost && (
                  <div className="fact">
                    <dt>Real cost</dt>
                    <dd>
                      {formatUnitPrice(stats.lastUnitCost.value, db.settings.currency)} /{' '}
                      {stats.lastUnitCost.label}
                      <span className="qual">last buy</span>
                    </dd>
                  </div>
                )}
                {stats.averageUnitCost && (
                  <div className="fact">
                    <dt>Average real cost</dt>
                    <dd>
                      {formatUnitPrice(stats.averageUnitCost.value, db.settings.currency)} /{' '}
                      {stats.averageUnitCost.label}
                    </dd>
                  </div>
                )}
                {stats.averageShelfLifeDays !== undefined && (
                  <div className="fact">
                    <dt>Average shelf life</dt>
                    <dd>
                      {stats.averageShelfLifeDays >= 60
                        ? `${Math.round(stats.averageShelfLifeDays / 30)} months`
                        : `${stats.averageShelfLifeDays} days`}
                    </dd>
                  </div>
                )}
                {stats.spoilRate !== undefined && (
                  <div className="fact">
                    <dt>Spoil rate</dt>
                    <dd className={stats.spoilRate > 0.2 ? 'bad' : undefined}>
                      {Math.round(stats.spoilRate * 100)}%
                    </dd>
                  </div>
                )}
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
          </>
        )}
      </main>
    </>
  )
}
