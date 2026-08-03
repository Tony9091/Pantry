/** Dialogs that more than one page needs: creating/editing a product, adding
 *  stock, and consuming stock. */

import { useMemo, useState } from 'react'
import type { ID, Product } from '../types'
import { useDb, useStore } from '../store/useStore'
import { makeLookups, productStock } from '../store/selectors'
import { addDays, formatAmount, isoDate } from '../lib/util'
import { Field, Modal, Select, Stepper, TextInput } from './ui'
import { BarcodeScanner, isScannerSupported } from './BarcodeScanner'
import { IconBarcode } from './icons'

/* --------------------------------------------------------- product editor */

export function ProductDialog({
  product,
  initialName,
  initialBarcode,
  onClose,
  onSaved,
}: {
  /** Omit to create a new product. */
  product?: Product
  initialName?: string
  initialBarcode?: string
  onClose: () => void
  onSaved?: (product: Product) => void
}) {
  const db = useDb()
  const addProduct = useStore((s) => s.addProduct)
  const updateProduct = useStore((s) => s.updateProduct)

  const [name, setName] = useState(product?.name ?? initialName ?? '')
  const [unitId, setUnitId] = useState(product?.unitId ?? db.units[0]?.id ?? '')
  const [groupId, setGroupId] = useState(product?.groupId ?? '')
  const [locationId, setLocationId] = useState(product?.locationId ?? '')
  const [storeId, setStoreId] = useState(product?.storeId ?? '')
  const [minStock, setMinStock] = useState(product?.minStock ?? 0)
  const [bbDays, setBbDays] = useState(product?.defaultBestBeforeDays ?? 0)
  const [barcode, setBarcode] = useState(product?.barcode ?? initialBarcode ?? '')
  const [note, setNote] = useState(product?.note ?? '')
  const [scanning, setScanning] = useState(false)

  const save = () => {
    const trimmed = name.trim()
    if (!trimmed || !unitId) return
    const payload = {
      name: trimmed,
      unitId,
      groupId: groupId || undefined,
      locationId: locationId || undefined,
      storeId: storeId || undefined,
      minStock: Math.max(0, minStock),
      defaultBestBeforeDays: bbDays > 0 ? bbDays : undefined,
      barcode: barcode.trim() || undefined,
      note: note.trim() || undefined,
    }
    if (product) {
      updateProduct(product.id, payload)
      onSaved?.({ ...product, ...payload })
    } else {
      onSaved?.(addProduct(payload))
    }
    onClose()
  }

  if (scanning) {
    return (
      <BarcodeScanner
        onDetected={(code) => {
          setBarcode(code)
          setScanning(false)
        }}
        onClose={() => setScanning(false)}
      />
    )
  }

  return (
    <Modal
      title={product ? 'Edit product' : 'New product'}
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
          autoFocus={!product}
          value={name}
          placeholder="e.g. Olive Oil"
          onChange={(e) => setName(e.target.value)}
        />
      </Field>

      <div className="field-row">
        <Field label="Unit">
          <Select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
            {db.units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Category">
          <Select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">None</option>
            {db.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="field-row">
        <Field label="Default location">
          <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">None</option>
            {db.locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Usual store">
          <Select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            <option value="">Any</option>
            {db.stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Minimum stock" hint="Drops below this and it lands on your shopping list. 0 turns the alert off.">
        <Stepper value={minStock} onChange={setMinStock} min={0} />
      </Field>

      <Field label="Shelf life (days)" hint="Pre-fills the best-before date when you add stock. 0 to skip.">
        <Stepper value={bbDays} onChange={setBbDays} min={0} />
      </Field>

      <Field label="Barcode">
        <div style={{ display: 'flex', gap: 8 }}>
          <TextInput
            value={barcode}
            inputMode="numeric"
            placeholder="Optional"
            onChange={(e) => setBarcode(e.target.value)}
          />
          <button
            className="btn"
            onClick={() => setScanning(true)}
            title={isScannerSupported() ? 'Scan with camera' : 'Enter barcode'}
          >
            <IconBarcode />
          </button>
        </div>
      </Field>

      <Field label="Note">
        <TextInput
          value={note}
          placeholder="Optional"
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
    </Modal>
  )
}

/* -------------------------------------------------------- add stock (buy) */

export function PurchaseDialog({
  productId,
  onClose,
}: {
  productId: ID
  onClose: () => void
}) {
  const db = useDb()
  const purchase = useStore((s) => s.purchase)
  const product = db.products.find((p) => p.id === productId)

  const [amount, setAmount] = useState(1)
  const [bestBefore, setBestBefore] = useState(
    product?.defaultBestBeforeDays ? addDays(isoDate(), product.defaultBestBeforeDays) : '',
  )
  const [locationId, setLocationId] = useState(product?.locationId ?? '')
  const [price, setPrice] = useState('')

  if (!product) return null
  const unit = db.units.find((u) => u.id === product.unitId)

  return (
    <Modal
      title={`Add ${product.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={amount <= 0}
            onClick={() => {
              purchase({
                productId,
                amount,
                bestBefore: bestBefore || undefined,
                locationId: locationId || undefined,
                price: price ? Number(price) : undefined,
              })
              onClose()
            }}
          >
            Add to stock
          </button>
        </>
      }
    >
      <Field label={`Amount${unit ? ` (${amount === 1 ? unit.name : unit.plural})` : ''}`}>
        <Stepper value={amount} onChange={setAmount} min={0} step={1} />
      </Field>

      <Field
        label="Best before"
        hint={product.defaultBestBeforeDays ? 'Pre-filled from the product shelf life.' : 'Leave empty if it never expires.'}
      >
        <TextInput type="date" value={bestBefore} onChange={(e) => setBestBefore(e.target.value)} />
      </Field>

      <div className="field-row">
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
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------ use / spoil */

export function ConsumeDialog({
  productId,
  onClose,
}: {
  productId: ID
  onClose: () => void
}) {
  const db = useDb()
  const consume = useStore((s) => s.consume)
  const stock = useMemo(() => productStock(db), [db])
  const lookups = useMemo(() => makeLookups(db), [db])

  const row = stock.get(productId)
  const [amount, setAmount] = useState(1)
  const [spoiled, setSpoiled] = useState(false)

  if (!row) return null
  const { product, total } = row

  return (
    <Modal
      title={`Use ${product.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={amount <= 0 || total <= 0}
            onClick={() => {
              consume(productId, Math.min(amount, total), { spoiled })
              onClose()
            }}
          >
            {spoiled ? 'Mark as wasted' : 'Use'}
          </button>
        </>
      }
    >
      <p style={{ fontSize: 13.5, color: 'var(--text-dim)', marginBottom: 14 }}>
        In stock: <strong>{formatAmount(total)}</strong>{' '}
        {lookups.unitName(product.unitId, total)}. The oldest batch is used first.
      </p>

      <Field label="Amount">
        <Stepper value={amount} onChange={setAmount} min={0} max={total} step={1} />
      </Field>

      <label className="checkbox">
        <input type="checkbox" checked={spoiled} onChange={(e) => setSpoiled(e.target.checked)} />
        <span>This went bad — record it as waste</span>
      </label>
    </Modal>
  )
}
