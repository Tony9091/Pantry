import { useMemo, useState } from 'react'
import type { Chore, ChorePeriod } from '../types'
import { useDb, useStore } from '../store/useStore'
import { choreStatus } from '../store/selectors'
import { relativeDays } from '../lib/util'
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
import { IconCheck, IconEdit, IconPlus } from '../components/icons'

const PERIODS: { value: ChorePeriod; label: string }[] = [
  { value: 'daily', label: 'Day(s)' },
  { value: 'weekly', label: 'Week(s)' },
  { value: 'monthly', label: 'Month(s)' },
  { value: 'yearly', label: 'Year(s)' },
  { value: 'manually', label: 'No schedule' },
]

export function ChoresPage() {
  const db = useDb()
  const toast = useToast()
  const trackChore = useStore((s) => s.trackChore)

  const [editing, setEditing] = useState<Chore | null>(null)
  const [creating, setCreating] = useState(false)

  const statuses = useMemo(
    () =>
      db.chores.map(choreStatus).sort((a, b) => {
        if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
        return (a.nextDue ?? '9999-12-31').localeCompare(b.nextDue ?? '9999-12-31')
      }),
    [db.chores],
  )

  const due = statuses.filter((s) => s.overdue || s.dueToday)
  const later = statuses.filter((s) => !s.overdue && !s.dueToday)

  const track = (chore: Chore) => {
    trackChore(chore.id)
    toast(`${chore.name} — done`)
  }

  return (
    <>
      <TopBar
        title="Chores"
        subtitle={`${due.length} due · ${db.chores.length} total`}
        actions={
          <button className="btn primary desktop-only" onClick={() => setCreating(true)}>
            <IconPlus />
            New chore
          </button>
        }
      />

      <main className="main">
        {db.chores.length === 0 ? (
          <Card>
            <EmptyState
              title="No chores yet"
              message="Set up the recurring jobs around the house and Pantry will tell you when each one is due again."
              action={
                <button className="btn primary" onClick={() => setCreating(true)}>
                  <IconPlus />
                  New chore
                </button>
              }
            />
          </Card>
        ) : (
          <>
            {due.length > 0 && (
              <>
                <div className="section-title">Due now</div>
                <Card flush>
                  {due.map(({ chore, overdue, nextDue }) => (
                    <div key={chore.id} className="row">
                      <button
                        className="tick"
                        onClick={() => track(chore)}
                        aria-label={`Mark ${chore.name} done`}
                      >
                        <IconCheck />
                      </button>
                      <div className="row-main">
                        <div className="row-title">{chore.name}</div>
                        <div className="row-sub">
                          {chore.assignedTo ?? 'Anyone'}
                          {nextDue ? ` · due ${relativeDays(nextDue)}` : ''}
                        </div>
                      </div>
                      {overdue ? <Badge tone="danger">Overdue</Badge> : <Badge tone="warn">Today</Badge>}
                      <button
                        className="icon-btn bare"
                        onClick={() => setEditing(chore)}
                        aria-label={`Edit ${chore.name}`}
                      >
                        <IconEdit />
                      </button>
                    </div>
                  ))}
                </Card>
              </>
            )}

            {later.length > 0 && (
              <>
                <div className="section-title">Scheduled</div>
                <Card flush>
                  {later.map(({ chore, nextDue }) => (
                    <div key={chore.id} className="row">
                      <button
                        className="tick"
                        onClick={() => track(chore)}
                        aria-label={`Mark ${chore.name} done`}
                      >
                        <IconCheck />
                      </button>
                      <div className="row-main">
                        <div className="row-title">{chore.name}</div>
                        <div className="row-sub">
                          {chore.assignedTo ?? 'Anyone'}
                          {nextDue
                            ? ` · next ${relativeDays(nextDue)}`
                            : ' · whenever you feel like it'}
                        </div>
                      </div>
                      <button
                        className="icon-btn bare"
                        onClick={() => setEditing(chore)}
                        aria-label={`Edit ${chore.name}`}
                      >
                        <IconEdit />
                      </button>
                    </div>
                  ))}
                </Card>
              </>
            )}
          </>
        )}
      </main>

      <button className="fab" onClick={() => setCreating(true)} aria-label="New chore">
        <IconPlus />
      </button>

      {(creating || editing) && (
        <ChoreDialog
          chore={editing ?? undefined}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
        />
      )}
    </>
  )
}

function ChoreDialog({ chore, onClose }: { chore?: Chore; onClose: () => void }) {
  const addChore = useStore((s) => s.addChore)
  const updateChore = useStore((s) => s.updateChore)
  const removeChore = useStore((s) => s.removeChore)

  const [name, setName] = useState(chore?.name ?? '')
  const [periodType, setPeriodType] = useState<ChorePeriod>(chore?.periodType ?? 'weekly')
  const [interval, setInterval] = useState(chore?.periodInterval ?? 1)
  const [assignedTo, setAssignedTo] = useState(chore?.assignedTo ?? '')
  const [lastDone, setLastDone] = useState(chore?.lastDone ?? '')
  const [deleting, setDeleting] = useState(false)

  const save = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const payload = {
      name: trimmed,
      periodType,
      periodInterval: Math.max(1, interval),
      assignedTo: assignedTo.trim() || undefined,
      lastDone: lastDone || undefined,
    }
    if (chore) updateChore(chore.id, payload)
    else addChore(payload)
    onClose()
  }

  if (deleting && chore) {
    return (
      <ConfirmDialog
        title={`Delete ${chore.name}?`}
        message="The chore and its history will be removed."
        onConfirm={() => {
          removeChore(chore.id)
          onClose()
        }}
        onClose={() => setDeleting(false)}
      />
    )
  }

  return (
    <Modal
      title={chore ? 'Edit chore' : 'New chore'}
      onClose={onClose}
      footer={
        <>
          {chore ? (
            <button className="btn danger" onClick={() => setDeleting(true)}>
              Delete
            </button>
          ) : (
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
          )}
          <button className="btn primary" onClick={save} disabled={!name.trim()}>
            Save
          </button>
        </>
      }
    >
      <Field label="Name">
        <TextInput
          autoFocus={!chore}
          value={name}
          placeholder="e.g. Clean the fridge"
          onChange={(e) => setName(e.target.value)}
        />
      </Field>

      <div className="field-row">
        <Field label="Repeat every">
          <Stepper
            value={interval}
            onChange={setInterval}
            min={1}
            // A one-off chore has no interval to set.
            {...(periodType === 'manually' ? { max: 1 } : {})}
          />
        </Field>
        <Field label="Period">
          <Select
            value={periodType}
            onChange={(e) => setPeriodType(e.target.value as ChorePeriod)}
          >
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Assigned to">
        <TextInput
          value={assignedTo}
          placeholder="Anyone"
          onChange={(e) => setAssignedTo(e.target.value)}
        />
      </Field>

      <Field label="Last done" hint="Leave empty and it counts as due right away.">
        <TextInput type="date" value={lastDone} onChange={(e) => setLastDone(e.target.value)} />
      </Field>
    </Modal>
  )
}
