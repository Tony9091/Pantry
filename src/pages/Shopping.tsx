import { useMemo, useState } from 'react'
import { useDb, useStore } from '../store/useStore'
import { makeLookups } from '../store/selectors'
import { clsx, formatAmount, groupBy, matches } from '../lib/util'
import { TopBar } from '../components/Layout'
import {
  Badge,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Modal,
  Select,
  Stepper,
  TextInput,
  useToast,
} from '../components/ui'
import { IconCheck, IconPlus, IconTrash } from '../components/icons'

export function ShoppingPage() {
  const db = useDb()
  const toast = useToast()
  const lookups = useMemo(() => makeLookups(db), [db])

  const addShoppingList = useStore((s) => s.addShoppingList)
  const removeShoppingList = useStore((s) => s.removeShoppingList)
  const toggleShoppingItem = useStore((s) => s.toggleShoppingItem)
  const removeShoppingItem = useStore((s) => s.removeShoppingItem)
  const clearDoneItems = useStore((s) => s.clearDoneItems)
  const fillFromMinStock = useStore((s) => s.fillFromMinStock)
  const completePurchases = useStore((s) => s.completePurchases)

  const [listId, setListId] = useState(db.shoppingLists[0]?.id ?? '')
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [creatingList, setCreatingList] = useState(false)
  const [deletingList, setDeletingList] = useState(false)

  // The selected list can vanish (deleted, or a fresh import) — fall back.
  const activeListId = db.shoppingLists.some((l) => l.id === listId)
    ? listId
    : (db.shoppingLists[0]?.id ?? '')
  const activeList = db.shoppingLists.find((l) => l.id === activeListId)

  const items = useMemo(
    () => db.shoppingItems.filter((i) => i.listId === activeListId && matches(i.name, search)),
    [db.shoppingItems, activeListId, search],
  )
  const open = items.filter((i) => !i.done)
  const done = items.filter((i) => i.done)

  // Grouped by store so a trip to one shop is a single contiguous block.
  const byStore = useMemo(
    () => groupBy(open, (i) => lookups.storeName(i.storeId) || 'Anywhere'),
    [open, lookups],
  )
  const storeNames = useMemo(
    () => [...byStore.keys()].sort((a, b) => (a === 'Anywhere' ? 1 : b === 'Anywhere' ? -1 : a.localeCompare(b))),
    [byStore],
  )

  const completable = done.filter((i) => i.productId).length

  return (
    <>
      <TopBar
        title="Shopping"
        subtitle={`${open.length} to buy · ${done.length} in the basket`}
        actions={
          <button className="btn primary desktop-only" onClick={() => setAdding(true)}>
            <IconPlus />
            Add item
          </button>
        }
      />

      <main className="main">
        <div className="chips">
          {db.shoppingLists.map((list) => {
            const count = db.shoppingItems.filter((i) => i.listId === list.id && !i.done).length
            return (
              <button
                key={list.id}
                className={clsx('chip', list.id === activeListId && 'active')}
                onClick={() => setListId(list.id)}
              >
                {list.name}
                {count > 0 ? ` · ${count}` : ''}
              </button>
            )
          })}
          <button className="chip" onClick={() => setCreatingList(true)}>
            + New list
          </button>
        </div>

        <div className="toolbar">
          <TextInput
            type="search"
            placeholder="Filter this list…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            className="btn"
            onClick={() => {
              const added = fillFromMinStock(activeListId)
              toast(
                added > 0
                  ? `Added ${added} item${added === 1 ? '' : 's'} that ran low`
                  : 'Nothing is below its minimum',
              )
            }}
            title="Add everything below its minimum stock level"
          >
            Add missing
          </button>
        </div>

        {items.length === 0 ? (
          <Card>
            <EmptyState
              title="This list is empty"
              message="Add items by hand, or pull in everything that has dropped below its minimum stock level."
              action={
                <div className="btn-row" style={{ justifyContent: 'center' }}>
                  <button className="btn primary" onClick={() => setAdding(true)}>
                    <IconPlus />
                    Add item
                  </button>
                  <button
                    className="btn"
                    onClick={() => {
                      const added = fillFromMinStock(activeListId)
                      toast(added > 0 ? `Added ${added} items` : 'Nothing is below its minimum')
                    }}
                  >
                    Add missing
                  </button>
                </div>
              }
            />
          </Card>
        ) : (
          <>
            {open.length > 0 &&
              storeNames.map((storeName) => (
                <div key={storeName}>
                  <div className="section-title">{storeName}</div>
                  <Card flush>
                    {byStore.get(storeName)!.map((item) => (
                      <div key={item.id} className="row">
                        <button
                          className="tick"
                          onClick={() => toggleShoppingItem(item.id)}
                          aria-label={`Mark ${item.name} as picked up`}
                        >
                          <IconCheck />
                        </button>
                        <div className="row-main">
                          <div className="row-title">{item.name}</div>
                          <div className="row-sub">
                            {formatAmount(item.amount)}{' '}
                            {lookups.unitName(item.unitId, item.amount)}
                            {item.note ? ` · ${item.note}` : ''}
                          </div>
                        </div>
                        {item.auto && <Badge tone="info">auto</Badge>}
                        <button
                          className="icon-btn bare"
                          onClick={() => removeShoppingItem(item.id)}
                          aria-label={`Remove ${item.name}`}
                        >
                          <IconTrash />
                        </button>
                      </div>
                    ))}
                  </Card>
                </div>
              ))}

            {done.length > 0 && (
              <>
                <div className="section-title">In the basket</div>
                <Card flush>
                  {done.map((item) => (
                    <div key={item.id} className="row done">
                      <button
                        className="tick on"
                        onClick={() => toggleShoppingItem(item.id)}
                        aria-label={`Put ${item.name} back on the list`}
                      >
                        <IconCheck />
                      </button>
                      <div className="row-main">
                        <div className="row-title">{item.name}</div>
                        <div className="row-sub">
                          {formatAmount(item.amount)} {lookups.unitName(item.unitId, item.amount)}
                        </div>
                      </div>
                      <button
                        className="icon-btn bare"
                        onClick={() => removeShoppingItem(item.id)}
                        aria-label={`Remove ${item.name}`}
                      >
                        <IconTrash />
                      </button>
                    </div>
                  ))}
                </Card>

                <div className="btn-row" style={{ marginTop: 12 }}>
                  <button
                    className="btn primary"
                    style={{ flex: 1 }}
                    disabled={completable === 0}
                    onClick={() => {
                      const moved = completePurchases(activeListId)
                      toast(
                        moved > 0
                          ? `Moved ${moved} item${moved === 1 ? '' : 's'} into your stock`
                          : 'Nothing to move',
                      )
                    }}
                    title="Add the ticked products to your stock and clear them from the list"
                  >
                    Complete purchase{completable > 0 ? ` (${completable})` : ''}
                  </button>
                  <button className="btn" onClick={() => clearDoneItems(activeListId)}>
                    Clear
                  </button>
                </div>
                {completable < done.length && (
                  <p className="hint" style={{ marginTop: 8 }}>
                    {done.length - completable} free-text item
                    {done.length - completable === 1 ? '' : 's'} can't be added to stock — they
                    aren't linked to a product. "Clear" removes them.
                  </p>
                )}
              </>
            )}
          </>
        )}

        {db.shoppingLists.length > 1 && activeList && (
          <div style={{ marginTop: 22 }}>
            <button className="btn danger block" onClick={() => setDeletingList(true)}>
              <IconTrash />
              Delete "{activeList.name}"
            </button>
          </div>
        )}
      </main>

      <button className="fab" onClick={() => setAdding(true)} aria-label="Add item">
        <IconPlus />
      </button>

      {adding && <AddItemDialog listId={activeListId} onClose={() => setAdding(false)} />}

      {creatingList && (
        <NewListDialog
          onClose={() => setCreatingList(false)}
          onCreate={(name) => setListId(addShoppingList(name).id)}
        />
      )}

      {deletingList && activeList && (
        <ConfirmDialog
          title={`Delete "${activeList.name}"?`}
          message="The list and everything on it will be removed. Your stock isn't affected."
          onConfirm={() => removeShoppingList(activeList.id)}
          onClose={() => setDeletingList(false)}
        />
      )}
    </>
  )
}

/** Mirrors the "New Shopping List" prompt: a name and you're done. */
function NewListDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (name: string) => void
}) {
  const [name, setName] = useState('')
  const submit = () => {
    if (!name.trim()) return
    onCreate(name.trim())
    onClose()
  }
  return (
    <Modal
      title="New shopping list"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit} disabled={!name.trim()}>
            Create
          </button>
        </>
      }
    >
      <Field label="Name">
        <TextInput
          autoFocus
          value={name}
          placeholder="e.g. Weekly shop"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
      </Field>
    </Modal>
  )
}

/** Adds either a known product (so it can be moved into stock later) or a
 *  free-text line for things you don't track. */
function AddItemDialog({ listId, onClose }: { listId: string; onClose: () => void }) {
  const db = useDb()
  const addShoppingItem = useStore((s) => s.addShoppingItem)

  const [productId, setProductId] = useState('')
  const [name, setName] = useState('')
  const [amount, setAmount] = useState(1)
  const [unitId, setUnitId] = useState('')
  const [storeId, setStoreId] = useState('')
  const [note, setNote] = useState('')

  const product = db.products.find((p) => p.id === productId)
  const effectiveName = product?.name ?? name
  const canSave = effectiveName.trim().length > 0 && amount > 0

  const submit = () => {
    if (!canSave) return
    addShoppingItem({
      listId,
      productId: productId || undefined,
      name: effectiveName.trim(),
      amount,
      unitId: (product?.unitId ?? unitId) || undefined,
      storeId: (storeId || product?.storeId) || undefined,
      note: note.trim() || undefined,
    })
    onClose()
  }

  return (
    <Modal
      title="Add to list"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit} disabled={!canSave}>
            Add
          </button>
        </>
      }
    >
      <Field label="Product" hint="Pick a tracked product to move it into stock after shopping.">
        <Select
          value={productId}
          onChange={(e) => {
            setProductId(e.target.value)
            const next = db.products.find((p) => p.id === e.target.value)
            if (next) setStoreId(next.storeId ?? '')
          }}
        >
          <option value="">Something else…</option>
          {[...db.products]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </Select>
      </Field>

      {!productId && (
        <Field label="Item">
          <TextInput
            autoFocus
            value={name}
            placeholder="e.g. Paper towels"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </Field>
      )}

      <div className="field-row">
        <Field label="Amount">
          <Stepper value={amount} onChange={setAmount} min={0} />
        </Field>
        <Field label="Unit">
          <Select
            value={product?.unitId ?? unitId}
            disabled={Boolean(product)}
            onChange={(e) => setUnitId(e.target.value)}
          >
            <option value="">None</option>
            {db.units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Store">
        <Select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
          <option value="">Anywhere</option>
          {db.stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
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
