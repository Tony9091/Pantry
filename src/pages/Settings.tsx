import { useRef, useState } from 'react'
import type { Database, ThemePreference } from '../types'
import { useDb, useStore } from '../store/useStore'
import { isoDate } from '../lib/util'
import { TopBar } from '../components/Layout'
import {
  Card,
  ConfirmDialog,
  Field,
  Modal,
  Select,
  Stepper,
  TextInput,
  useToast,
} from '../components/ui'
import { IconDownload, IconPlus, IconTrash, IconUpload } from '../components/icons'

export function SettingsPage() {
  const db = useDb()
  const toast = useToast()
  const updateSettings = useStore((s) => s.updateSettings)
  const replaceDatabase = useStore((s) => s.replaceDatabase)
  const loadDemoData = useStore((s) => s.loadDemoData)
  const resetDatabase = useStore((s) => s.resetDatabase)

  const fileInput = useRef<HTMLInputElement>(null)
  const [confirm, setConfirm] = useState<'reset' | 'demo' | null>(null)
  const [masterData, setMasterData] = useState<
    'locations' | 'units' | 'groups' | 'stores' | null
  >(null)

  const exportData = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pantry-backup-${isoDate()}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast('Backup downloaded')
  }

  const importData = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as Partial<Database>
      // Enough of a shape check to reject an unrelated JSON file without
      // wiping the user's real data.
      if (!Array.isArray(parsed.products) || !Array.isArray(parsed.units)) {
        toast("That file doesn't look like a Pantry backup")
        return
      }
      replaceDatabase(parsed as Database)
      toast('Backup restored')
    } catch {
      toast("Couldn't read that file")
    }
  }

  return (
    <>
      <TopBar title="Settings" />

      <main className="main">
        <Card title="Household">
          <Field label="Household name">
            <TextInput
              value={db.settings.householdName}
              onChange={(e) => updateSettings({ householdName: e.target.value })}
            />
          </Field>

          <Field
            label="Warn me this many days before expiry"
            hint="Anything inside this window shows up under “Use these first”."
          >
            <Stepper
              value={db.settings.expiryWarnDays}
              onChange={(v) => updateSettings({ expiryWarnDays: v })}
              min={0}
            />
          </Field>

          <div className="field-row">
            <Field label="Currency">
              <TextInput
                value={db.settings.currency}
                maxLength={3}
                onChange={(e) => updateSettings({ currency: e.target.value.toUpperCase() })}
              />
            </Field>
            <Field label="Week starts on">
              <Select
                value={String(db.settings.weekStartsOn)}
                onChange={(e) =>
                  updateSettings({ weekStartsOn: Number(e.target.value) as 0 | 1 })
                }
              >
                <option value="1">Monday</option>
                <option value="0">Sunday</option>
              </Select>
            </Field>
          </div>

          <Field label="Appearance">
            <Select
              value={db.settings.theme}
              onChange={(e) => updateSettings({ theme: e.target.value as ThemePreference })}
            >
              <option value="system">Match my device</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </Select>
          </Field>
        </Card>

        <Card title="Master data" flush>
          <MasterRow
            label="Locations"
            count={db.locations.length}
            onClick={() => setMasterData('locations')}
          />
          <MasterRow label="Units" count={db.units.length} onClick={() => setMasterData('units')} />
          <MasterRow
            label="Categories"
            count={db.groups.length}
            onClick={() => setMasterData('groups')}
          />
          <MasterRow
            label="Stores"
            count={db.stores.length}
            onClick={() => setMasterData('stores')}
          />
        </Card>

        <Card title="Your data">
          <p style={{ fontSize: 13.5, color: 'var(--text-dim)', marginBottom: 14 }}>
            Everything lives on this device — nothing is uploaded anywhere. Export a backup to move
            your pantry to another phone or computer.
          </p>
          <div className="btn-row">
            <button className="btn" onClick={exportData}>
              <IconDownload />
              Export backup
            </button>
            <button className="btn" onClick={() => fileInput.current?.click()}>
              <IconUpload />
              Import backup
            </button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importData(file)
              // Reset so re-picking the same file fires change again.
              e.target.value = ''
            }}
          />

          <div className="btn-row" style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => setConfirm('demo')}>
              Load demo data
            </button>
            <button className="btn danger" onClick={() => setConfirm('reset')}>
              <IconTrash />
              Erase everything
            </button>
          </div>
        </Card>

        <Card title="About">
          <p style={{ fontSize: 13.5, color: 'var(--text-dim)' }}>
            <strong style={{ color: 'var(--text)' }}>Pantry</strong> — food inventory, smart
            shopping lists, recipes, meal planning and chores. Free, open source, no ads, no
            tracking, and it works offline.
          </p>
          <p style={{ fontSize: 13.5, color: 'var(--text-faint)', marginTop: 10 }}>
            Add it to your home screen from your browser's share menu to run it like a native app.
          </p>
        </Card>
      </main>

      {masterData && (
        <MasterDataDialog kind={masterData} onClose={() => setMasterData(null)} />
      )}

      {confirm === 'reset' && (
        <ConfirmDialog
          title="Erase everything?"
          message="All products, stock, recipes, lists and chores on this device will be permanently deleted. Export a backup first if you might want any of it back."
          confirmLabel="Erase everything"
          onConfirm={() => {
            resetDatabase()
            toast('Everything erased')
          }}
          onClose={() => setConfirm(null)}
        />
      )}

      {confirm === 'demo' && (
        <ConfirmDialog
          title="Load demo data?"
          message="This replaces everything currently in the app with a sample household so you can look around."
          confirmLabel="Load demo"
          onConfirm={() => {
            loadDemoData()
            toast('Demo data loaded')
          }}
          onClose={() => setConfirm(null)}
        />
      )}
    </>
  )
}

function MasterRow({
  label,
  count,
  onClick,
}: {
  label: string
  count: number
  onClick: () => void
}) {
  return (
    <button className="row" onClick={onClick}>
      <div className="row-main">
        <div className="row-title">{label}</div>
      </div>
      <div className="row-aside muted">{count}</div>
    </button>
  )
}

/** One dialog covers all four master-data lists — they're all just names. */
function MasterDataDialog({
  kind,
  onClose,
}: {
  kind: 'locations' | 'units' | 'groups' | 'stores'
  onClose: () => void
}) {
  const db = useDb()
  const toast = useToast()
  const store = useStore()
  const [draft, setDraft] = useState('')
  const [isFreezer, setIsFreezer] = useState(false)

  const titles = {
    locations: 'Locations',
    units: 'Units',
    groups: 'Categories',
    stores: 'Stores',
  }

  const items =
    kind === 'locations'
      ? db.locations.map((l) => ({ id: l.id, name: l.name, sub: l.isFreezer ? 'Freezer' : '' }))
      : kind === 'units'
        ? db.units.map((u) => ({ id: u.id, name: u.name, sub: u.plural }))
        : kind === 'groups'
          ? db.groups.map((g) => ({ id: g.id, name: g.name, sub: '' }))
          : db.stores.map((s) => ({ id: s.id, name: s.name, sub: '' }))

  const add = () => {
    const name = draft.trim()
    if (!name) return
    if (kind === 'locations') store.addLocation(name, isFreezer)
    else if (kind === 'units') store.addUnit(name, `${name}s`)
    else if (kind === 'groups') store.addGroup(name)
    else store.addStore(name)
    setDraft('')
    setIsFreezer(false)
  }

  const remove = (id: string) => {
    if (kind === 'locations') store.removeLocation(id)
    else if (kind === 'units') {
      const inUse = db.products.some((p) => p.unitId === id)
      if (inUse) {
        toast("That unit is still used by a product — it can't be deleted")
        return
      }
      store.removeUnit(id)
    } else if (kind === 'groups') store.removeGroup(id)
    else store.removeStore(id)
  }

  return (
    <Modal
      title={titles[kind]}
      onClose={onClose}
      footer={
        <button className="btn primary" onClick={onClose}>
          Done
        </button>
      }
    >
      <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
        <TextInput
          value={draft}
          placeholder={`New ${titles[kind].toLowerCase().replace(/s$/, '')}`}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button className="btn primary" onClick={add} disabled={!draft.trim()}>
          <IconPlus />
        </button>
      </div>

      {kind === 'locations' && (
        <label className="checkbox" style={{ marginBottom: 14, fontSize: 13.5 }}>
          <input
            type="checkbox"
            checked={isFreezer}
            onChange={(e) => setIsFreezer(e.target.checked)}
          />
          <span>This is a freezer (no expiry warnings)</span>
        </label>
      )}

      <div style={{ marginTop: 10 }}>
        {items.map((item) => (
          <div key={item.id} className="ing">
            <span>{item.name}</span>
            {item.sub && <span className="muted"> · {item.sub}</span>}
            <button
              className="icon-btn bare"
              style={{ marginLeft: 'auto' }}
              onClick={() => remove(item.id)}
              aria-label={`Delete ${item.name}`}
            >
              <IconTrash />
            </button>
          </div>
        ))}
      </div>
    </Modal>
  )
}
