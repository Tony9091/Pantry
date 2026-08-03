/** Presentational building blocks shared by every page. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { clsx } from '../lib/util'
import { IconClose, IconInbox, IconMinus, IconPlus, IconSearch } from './icons'

/* ------------------------------------------------------------------ modal */

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

export function Modal({ title, onClose, children, footer }: ModalProps) {
  const backdrop = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    // Prevent the page behind the sheet from scrolling on touch devices.
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [onClose])

  return (
    <div
      className="modal-backdrop"
      ref={backdrop}
      onMouseDown={(e) => {
        if (e.target === backdrop.current) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="modal">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn bare" onClick={onClose} aria-label="Close">
            <IconClose />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

/** Blocking yes/no sheet used before destructive actions. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Delete',
  onConfirm,
  onClose,
}: {
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn danger"
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p style={{ color: 'var(--text-dim)', fontSize: 14.5 }}>{message}</p>
    </Modal>
  )
}

/* ------------------------------------------------------------------ forms */

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      {/* Children render their own control; cloning would be brittle, so the
          label is associated via the wrapper's id on the first input. */}
      <div id={id}>{children}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  )
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx('input', props.className)} />
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={clsx('input', props.className)} />
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={clsx('input', props.className)} />
}

/** Amount input with +/- buttons — much easier to hit on a phone. */
export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max,
}: {
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
}) {
  // Kept as a string while focused so the field can be cleared mid-edit
  // without snapping back to 0.
  const [draft, setDraft] = useState<string | null>(null)

  const clamp = (v: number) => {
    let out = v
    if (min !== undefined) out = Math.max(min, out)
    if (max !== undefined) out = Math.min(max, out)
    // Guards against 0.1 + 0.2 drift accumulating over many taps.
    return Math.round(out * 1000) / 1000
  }

  return (
    <div className="stepper">
      <button
        type="button"
        onClick={() => onChange(clamp(value - step))}
        disabled={min !== undefined && value <= min}
        aria-label="Decrease"
      >
        <IconMinus />
      </button>
      <input
        type="number"
        inputMode="decimal"
        value={draft ?? value}
        onChange={(e) => {
          setDraft(e.target.value)
          const parsed = Number(e.target.value)
          if (e.target.value !== '' && Number.isFinite(parsed)) onChange(clamp(parsed))
        }}
        onBlur={() => setDraft(null)}
        step={step}
      />
      <button
        type="button"
        onClick={() => onChange(clamp(value + step))}
        disabled={max !== undefined && value >= max}
        aria-label="Increase"
      >
        <IconPlus />
      </button>
    </div>
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="search">
      <IconSearch />
      <input
        className="input"
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

export function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="chips">
      {options.map((opt) => (
        <button
          key={opt.value}
          className={clsx('chip', value === opt.value && 'active')}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

/* ----------------------------------------------------------------- layout */

export function Card({
  title,
  count,
  action,
  children,
  flush,
}: {
  title?: string
  count?: ReactNode
  action?: ReactNode
  children: ReactNode
  flush?: boolean
}) {
  return (
    <div className="card">
      {title && (
        <div className="card-head">
          <h2>{title}</h2>
          {count !== undefined && <span className="count">{count}</span>}
          {action}
        </div>
      )}
      <div className={clsx('card-body', flush && 'flush')}>{children}</div>
    </div>
  )
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string
  message?: string
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <IconInbox />
      <div className="empty-title">{title}</div>
      {message && <p>{message}</p>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  )
}

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'danger' | 'warn' | 'ok' | 'info' | 'neutral' | 'accent'
  children: ReactNode
}) {
  return <span className={`badge ${tone}`}>{children}</span>
}

/* ----------------------------------------------------------------- toasts */

interface Toast {
  id: number
  message: string
}

const ToastContext = createContext<(message: string) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(0)

  const push = useCallback((message: string) => {
    const id = nextId.current++
    setToasts((t) => [...t, { id, message }])
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600)
  }, [])

  const value = useMemo(() => push, [push])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toasts.length > 0 && (
        <div className="toasts" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className="toast">
              {t.message}
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
