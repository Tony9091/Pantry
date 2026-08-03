/** The one field.
 *
 *  Instead of eight inputs, a person types or pastes whatever they have and the
 *  app works it out. Written to be usable by everyone in the house, so the
 *  language is plain and every guess is shown before anything is saved. */

import { useMemo, useRef, useState } from 'react'
import { navigate } from '../lib/router'
import { useDb, useStore } from '../store/useStore'
import { makeLookups } from '../store/selectors'
import { parseInput, type ParsedItem } from '../lib/parse'
import { cleanOcrText, readTextFromImage, type OcrProgress } from '../lib/ocr'
import { clsx, formatAmount, formatMoney } from '../lib/util'
import { TopBar } from '../components/Layout'
import { Badge, Card, Select, TextInput, useToast } from '../components/ui'
import { BarcodeScanner, isScannerSupported } from '../components/BarcodeScanner'
import {
  IconBarcode,
  IconCamera,
  IconCheck,
  IconImage,
  IconPlus,
  IconTrash,
} from '../components/icons'

type Destination = 'stock' | 'shopping'

const EXAMPLES = [
  '2 gallons milk',
  '3 bananas, 1 loaf bread, 2 dozen eggs',
  '12 oz cheddar $6.75 from Supermarket',
  'chicken breast 2 lb exp 12/24/2026',
]

export function QuickAddPage() {
  const db = useDb()
  const toast = useToast()
  const lookups = useMemo(() => makeLookups(db), [db])

  const addProduct = useStore((s) => s.addProduct)
  const purchase = useStore((s) => s.purchase)
  const addShoppingItem = useStore((s) => s.addShoppingItem)

  const [text, setText] = useState('')
  const [items, setItems] = useState<ParsedItem[] | null>(null)
  const [destination, setDestination] = useState<Destination>('stock')
  const [scanning, setScanning] = useState(false)
  const [reading, setReading] = useState<OcrProgress | null>(null)
  const [ocrFailed, setOcrFailed] = useState(false)
  const [dragging, setDragging] = useState(false)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  /** Runs a photo through text recognition and straight into the parser. */
  const readImage = async (file: Blob) => {
    setOcrFailed(false)
    setReading({ progress: 0, label: 'Getting ready…' })
    try {
      const raw = await readTextFromImage(file, setReading)
      const cleaned = cleanOcrText(raw)
      if (!cleaned.trim()) {
        toast("Couldn't make out any words — try a closer, flatter photo")
        return
      }
      // Show what was read so it can be corrected before parsing.
      setText(cleaned)
      const parsed = parseInput(cleaned, db)
      if (parsed.length > 0) setItems(parsed)
      else toast('Read the photo, but found no items — edit the text and try again')
    } catch {
      setOcrFailed(true)
    } finally {
      setReading(null)
    }
  }

  const listId = db.shoppingLists[0]?.id

  const read = (value: string) => {
    const parsed = parseInput(value, db)
    if (parsed.length === 0) {
      toast("Couldn't find anything to add — try naming an item")
      return
    }
    setItems(parsed)
  }

  const patch = (key: string, changes: Partial<ParsedItem>) =>
    setItems((list) => list?.map((i) => (i.key === key ? { ...i, ...changes } : i)) ?? null)

  const drop = (key: string) => setItems((list) => list?.filter((i) => i.key !== key) ?? null)

  const save = () => {
    if (!items || items.length === 0) return
    let count = 0

    for (const item of items) {
      // Anything not already known becomes a product, so nothing is lost.
      let productId = item.productId
      if (!productId) {
        productId = addProduct({
          name: item.name,
          unitId: item.unitId ?? db.units[0].id,
          locationId: item.locationId,
          storeId: item.storeId,
          minStock: 0,
        }).id
      }

      if (destination === 'stock') {
        purchase({
          productId,
          amount: item.amount,
          bestBefore: item.bestBefore,
          locationId: item.locationId,
          price: item.price,
          storeId: item.storeId,
          note: 'Quick add',
        })
      } else if (listId) {
        addShoppingItem({
          listId,
          productId,
          name: item.name,
          amount: item.amount,
          unitId: item.unitId,
          storeId: item.storeId,
        })
      }
      count++
    }

    toast(
      destination === 'stock'
        ? `Added ${count} ${count === 1 ? 'thing' : 'things'} to your kitchen`
        : `Put ${count} ${count === 1 ? 'thing' : 'things'} on the list`,
    )
    setItems(null)
    setText('')
    navigate(destination === 'stock' ? '/stock' : '/shopping')
  }

  if (scanning) {
    return (
      <BarcodeScanner
        onClose={() => setScanning(false)}
        onDetected={(code) => {
          setScanning(false)
          const found = db.products.find((p) => p.barcode === code)
          if (found) {
            setText((t) => (t ? `${t}\n${found.name}` : found.name))
            toast(`Found ${found.name}`)
          } else {
            toast('New barcode — type what it is and I’ll remember it')
          }
        }}
      />
    )
  }

  return (
    <>
      <TopBar
        title="Add anything"
        subtitle="Type it, paste it, or scan it"
        actions={
          <button
            className="icon-btn"
            onClick={() => setScanning(true)}
            aria-label="Scan a barcode"
            title={isScannerSupported() ? 'Scan a barcode' : 'Enter a barcode'}
          >
            <IconBarcode />
          </button>
        }
      />

      <main className="main">
        {!items && (
          <>
            <div
              className={clsx('magic', dragging && 'dragging')}
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'))
                if (file) void readImage(file)
              }}
            >
              <textarea
                ref={areaRef}
                className="magic-input"
                value={text}
                autoFocus
                placeholder={"What have you got?\n\nType it, paste a list, or snap a photo of a receipt."}
                onChange={(e) => setText(e.target.value)}
                onPaste={(e) => {
                  // A pasted screenshot goes straight through recognition.
                  const image = [...e.clipboardData.items].find((i) =>
                    i.type.startsWith('image/'),
                  )
                  const file = image?.getAsFile()
                  if (file) {
                    e.preventDefault()
                    void readImage(file)
                  }
                }}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') read(text)
                }}
              />

              <div className="magic-actions">
                <button
                  className="btn"
                  onClick={() => cameraRef.current?.click()}
                  disabled={Boolean(reading)}
                >
                  <IconCamera />
                  Snap a photo
                </button>
                <button
                  className="btn"
                  onClick={() => fileRef.current?.click()}
                  disabled={Boolean(reading)}
                >
                  <IconImage />
                  Pick a picture
                </button>
              </div>

              <button
                className="btn primary block magic-go"
                disabled={!text.trim() || Boolean(reading)}
                onClick={() => read(text)}
              >
                <IconCheck />
                Figure it out
              </button>
            </div>

            {/* `capture` opens the camera directly on a phone. */}
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void readImage(file)
                e.target.value = ''
              }}
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void readImage(file)
                e.target.value = ''
              }}
            />

            {reading && (
              <Card>
                <div className="reading">
                  <div className="reading-label">{reading.label}</div>
                  <div className="reading-track">
                    <div
                      className="reading-bar"
                      style={{ width: `${Math.round((reading.progress || 0) * 100)}%` }}
                    />
                  </div>
                  <p className="hint" style={{ marginTop: 10 }}>
                    Reading happens on your device — the photo isn't sent anywhere. The first
                    scan downloads the reader, so it takes a moment; after that it's quick.
                  </p>
                </div>
              </Card>
            )}

            {ocrFailed && (
              <Card title="Couldn't load the photo reader">
                <p style={{ fontSize: 14, color: 'var(--text-dim)', lineHeight: 1.55 }}>
                  Reading photos needs a connection the first time, to fetch the text reader.
                  You're either offline right now, or this page is blocked from downloading it.
                </p>
                <p style={{ fontSize: 14, color: 'var(--text-dim)', marginTop: 10, lineHeight: 1.55 }}>
                  In the meantime your phone can do it: open the photo, press and hold the
                  text, choose <strong>Copy</strong>, then paste it into the box above.
                </p>
                <button className="btn sm" style={{ marginTop: 12 }} onClick={() => setOcrFailed(false)}>
                  Got it
                </button>
              </Card>
            )}

            <div className="section-title">Or try one of these</div>
            <div className="stack">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  className="example"
                  onClick={() => {
                    setText(example)
                    read(example)
                  }}
                >
                  <span className="example-quote">“{example}”</span>
                </button>
              ))}
            </div>

            <Card title="What you can paste">
              <ul style={{ fontSize: 14, color: 'var(--text-dim)', lineHeight: 1.75 }}>
                <li>A photo of a receipt, or a screenshot</li>
                <li>A shopping list, one thing per line</li>
                <li>Rows copied straight out of Excel or Google Sheets</li>
                <li>The text off a receipt</li>
                <li>Amounts, prices, shops and dates — all picked out for you</li>
              </ul>
            </Card>
          </>
        )}

        {items && (
          <>
            <div className="spread" style={{ marginBottom: 12 }}>
              <div>
                <h2 style={{ fontSize: 19 }}>
                  Found {items.length} {items.length === 1 ? 'thing' : 'things'}
                </h2>
                <p className="hint" style={{ marginTop: 2 }}>
                  Change anything that looks wrong.
                </p>
              </div>
              <button className="btn sm" onClick={() => setItems(null)}>
                Start over
              </button>
            </div>

            <div className="chips">
              <button
                className={`chip ${destination === 'stock' ? 'active' : ''}`}
                onClick={() => setDestination('stock')}
              >
                I have these
              </button>
              <button
                className={`chip ${destination === 'shopping' ? 'active' : ''}`}
                onClick={() => setDestination('shopping')}
              >
                I need to buy these
              </button>
            </div>

            <div className="stack">
              {items.map((item) => (
                <div key={item.key} className="found">
                  <div className="found-head">
                    <TextInput
                      value={item.name}
                      aria-label="Name"
                      onChange={(e) => patch(item.key, { name: e.target.value })}
                    />
                    <button
                      className="icon-btn bare"
                      onClick={() => drop(item.key)}
                      aria-label={`Remove ${item.name}`}
                    >
                      <IconTrash />
                    </button>
                  </div>

                  <div className="found-grid">
                    <TextInput
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={item.amount}
                      aria-label="How many"
                      onChange={(e) => patch(item.key, { amount: Number(e.target.value) || 0 })}
                    />
                    <Select
                      value={item.unitId ?? ''}
                      aria-label="Unit"
                      onChange={(e) => patch(item.key, { unitId: e.target.value || undefined })}
                    >
                      <option value="">unit</option>
                      {db.units.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="found-tags">
                    {item.productId ? (
                      <Badge tone="ok">already known</Badge>
                    ) : (
                      <Badge tone="accent">new</Badge>
                    )}
                    {item.price !== undefined && (
                      <Badge tone="neutral">
                        {formatMoney(item.price, db.settings.currency)}
                      </Badge>
                    )}
                    {item.storeId && <Badge tone="neutral">{lookups.storeName(item.storeId)}</Badge>}
                    {item.locationId && (
                      <Badge tone="neutral">{lookups.locationName(item.locationId)}</Badge>
                    )}
                    {item.bestBefore && <Badge tone="warn">{item.bestBefore}</Badge>}
                  </div>
                </div>
              ))}
            </div>

            <button
              className="btn primary block"
              style={{ marginTop: 16 }}
              disabled={items.length === 0}
              onClick={save}
            >
              <IconPlus />
              {destination === 'stock'
                ? `Add ${items.length} to my kitchen`
                : `Add ${items.length} to my list`}
            </button>

            <p className="hint" style={{ textAlign: 'center', marginTop: 10 }}>
              {items.filter((i) => !i.productId).length > 0 &&
                `${items.filter((i) => !i.productId).length} of these are new — I'll remember them for next time.`}
            </p>
          </>
        )}
      </main>
    </>
  )
}

/** Small helper kept here so other pages can show the same amount phrasing. */
export function describeItem(item: ParsedItem, unitName: string): string {
  return `${formatAmount(item.amount)} ${unitName}`.trim()
}
