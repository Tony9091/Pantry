/** Small dependency-free helpers shared across the app. */

export function uid(prefix = ''): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14)
  return prefix ? `${prefix}_${rand}` : rand
}

/** Local-time ISO date (YYYY-MM-DD). `toISOString` would shift by timezone. */
export function isoDate(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function addDays(iso: string, days: number): string {
  const d = parseDate(iso)
  d.setDate(d.getDate() + days)
  return isoDate(d)
}

/** Whole days from today to `iso`. Negative means in the past. */
export function daysUntil(iso: string, from: string = isoDate()): number {
  const ms = parseDate(iso).getTime() - parseDate(from).getTime()
  return Math.round(ms / 86_400_000)
}

export function formatDate(iso: string): string {
  return parseDate(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatDateShort(iso: string): string {
  return parseDate(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** "in 3 days" / "today" / "5 days ago" — used for expiry and chore due dates. */
export function relativeDays(iso: string): string {
  const n = daysUntil(iso)
  if (n === 0) return 'today'
  if (n === 1) return 'tomorrow'
  if (n === -1) return 'yesterday'
  if (n > 0) return `in ${n} days`
  return `${Math.abs(n)} days ago`
}

/** Trims trailing zeros so 1.50 reads as "1.5" and 2.00 as "2". */
export function formatAmount(n: number): string {
  if (!Number.isFinite(n)) return '0'
  return String(Math.round(n * 1000) / 1000)
}

export function formatMoney(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n)
  } catch {
    // Falls back when `currency` isn't a valid ISO 4217 code.
    return `${currency} ${n.toFixed(2)}`
  }
}

export function startOfWeek(iso: string, weekStartsOn: 0 | 1): string {
  const d = parseDate(iso)
  const diff = (d.getDay() - weekStartsOn + 7) % 7
  d.setDate(d.getDate() - diff)
  return isoDate(d)
}

export function weekdayName(iso: string): string {
  return parseDate(iso).toLocaleDateString(undefined, { weekday: 'short' })
}

/** Case- and accent-insensitive substring match for search boxes. */
export function matches(haystack: string, needle: string): boolean {
  if (!needle.trim()) return true
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
  return norm(haystack).includes(norm(needle))
}

export function groupBy<T, K extends string>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>()
  for (const item of items) {
    const k = key(item)
    const bucket = out.get(k)
    if (bucket) bucket.push(item)
    else out.set(k, [item])
  }
  return out
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0)
}

export function clsx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}
