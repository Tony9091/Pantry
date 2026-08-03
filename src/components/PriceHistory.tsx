/** Price history, one line per store — mirrors Grocy's product-overview chart.
 *
 *  Hand-drawn SVG rather than a charting library: the whole app is 84 kB
 *  gzipped and works offline, which a charting dependency would undo.
 *
 *  Series colours come from a categorical palette validated for colour-vision
 *  deficiency and for contrast against both surfaces. Because the light steps
 *  sit below 3:1 on white, identity is never carried by colour alone — every
 *  series is direct-labelled and legended. */

import { useId, useMemo, useState } from 'react'
import type { PricePoint } from '../store/selectors'
import type { ID } from '../types'
import { formatMoney, parseDate } from '../lib/util'

/** Fixed slot order — assigned by store, never cycled or re-ranked. */
const SERIES_SLOTS = ['s1', 's2', 's3', 's4'] as const

interface Series {
  key: string
  label: string
  slot: string
  points: { x: number; y: number; date: string; price: number }[]
}

export function PriceHistory({
  points,
  currency,
  storeName,
  unitLabel,
}: {
  points: PricePoint[]
  currency: string
  storeName: (id: ID | undefined) => string
  unitLabel: string
}) {
  const uid = useId()
  const [hover, setHover] = useState<{ x: number; y: number; label: string; price: number; date: string } | null>(null)

  const W = 320
  const H = 150
  const PAD = { top: 12, right: 14, bottom: 26, left: 54 }

  const model = useMemo(() => {
    if (points.length === 0) return null

    const times = points.map((p) => parseDate(p.date.slice(0, 10)).getTime())
    const prices = points.map((p) => p.unitPrice)
    const tMin = Math.min(...times)
    const tMax = Math.max(...times)
    const pMin = Math.min(...prices)
    const pMax = Math.max(...prices)

    // Pad the value axis so lines never sit on the frame, and keep a sane band
    // when every purchase cost the same. The "is it flat" test has to be
    // relative — an absolute threshold would call a per-gram price range flat
    // and squash every point onto the floor.
    const span = pMax - pMin
    const isFlat = span <= Math.abs(pMax) * 1e-6
    const pad = isFlat ? Math.max(Math.abs(pMax) * 0.15, 0.01) : span * 0.18
    const yLo = Math.max(0, pMin - pad)
    const yHi = pMax + pad

    const plotW = W - PAD.left - PAD.right
    const plotH = H - PAD.top - PAD.bottom
    const sx = (t: number) => (tMax === tMin ? PAD.left + plotW / 2 : PAD.left + ((t - tMin) / (tMax - tMin)) * plotW)
    const sy = (v: number) => PAD.top + plotH - ((v - yLo) / (yHi - yLo)) * plotH

    const byStore = new Map<string, PricePoint[]>()
    for (const p of points) {
      const key = p.storeId ?? '__none'
      const list = byStore.get(key)
      if (list) list.push(p)
      else byStore.set(key, [p])
    }

    const series: Series[] = [...byStore.entries()]
      // Stable order so a colour always belongs to the same store.
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(0, SERIES_SLOTS.length)
      .map(([key, pts], i) => ({
        key,
        label: key === '__none' ? 'Unspecified' : storeName(key) || 'Unspecified',
        slot: SERIES_SLOTS[i],
        points: pts
          .map((p) => ({
            x: sx(parseDate(p.date.slice(0, 10)).getTime()),
            y: sy(p.unitPrice),
            date: p.date,
            price: p.unitPrice,
          }))
          .sort((a, b) => a.x - b.x),
      }))

    return { series, yLo, yHi, sy, tMin, tMax }
  }, [points, storeName])

  if (!model || points.length < 2) return null

  const { series, yLo, yHi, sy, tMin, tMax } = model
  const ticks = [yLo + (yHi - yLo) * 0.15, (yLo + yHi) / 2, yHi - (yHi - yLo) * 0.15]
  const fmtDate = (t: number) =>
    new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

  /** Enough decimals to tell the ticks apart. Per-gram prices need three or
   *  four places; per-bottle prices need none. */
  const tickDecimals = (() => {
    const span = yHi - yLo
    if (span >= 5) return 0
    if (span >= 0.5) return 1
    if (span >= 0.05) return 2
    if (span >= 0.005) return 3
    return 4
  })()

  const fmtTick = (v: number) => {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        minimumFractionDigits: tickDecimals,
        maximumFractionDigits: tickDecimals,
      }).format(v)
    } catch {
      return `${currency} ${v.toFixed(tickDecimals)}`
    }
  }

  /** Point values want real precision too — "$0.02" hides a 30% difference. */
  const fmtPrice = (v: number) => (v < 1 ? fmtTick(v) : formatMoney(v, currency))

  return (
    <div className="viz">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="viz-svg"
        role="img"
        aria-label={`Price per ${unitLabel} over time, by store`}
        onMouseLeave={() => setHover(null)}
      >
        {/* Recessive grid — reference, not content. */}
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={PAD.left} x2={W - PAD.right} y1={sy(v)} y2={sy(v)} className="viz-grid" />
            <text x={PAD.left - 7} y={sy(v)} className="viz-tick" textAnchor="end" dominantBaseline="middle">
              {fmtTick(v)}
            </text>
          </g>
        ))}

        <text x={PAD.left} y={H - 7} className="viz-tick" textAnchor="start">
          {fmtDate(tMin)}
        </text>
        {tMax !== tMin && (
          <text x={W - PAD.right} y={H - 7} className="viz-tick" textAnchor="end">
            {fmtDate(tMax)}
          </text>
        )}

        {series.map((s) => (
          <g key={s.key} className={`viz-series ${s.slot}`}>
            {s.points.length > 1 && (
              <polyline
                points={s.points.map((p) => `${p.x},${p.y}`).join(' ')}
                className="viz-line"
              />
            )}
            {s.points.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={4}
                className="viz-dot"
                onMouseEnter={() =>
                  setHover({ x: p.x, y: p.y, label: s.label, price: p.price, date: p.date })
                }
              />
            ))}
          </g>
        ))}

        {hover && (
          <g className="viz-hover" pointerEvents="none">
            <line x1={hover.x} x2={hover.x} y1={PAD.top} y2={H - PAD.bottom} className="viz-crosshair" />
            <circle cx={hover.x} cy={hover.y} r={6} className="viz-hover-ring" />
          </g>
        )}
      </svg>

      {hover && (
        <div className="viz-tip" key={`${hover.label}-${hover.date}`}>
          <strong>{fmtPrice(hover.price)}</strong> per {unitLabel} ·{' '}
          {hover.label} ·{' '}
          {new Date(hover.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
        </div>
      )}

      {/* Legend is always present for two or more series; identity never rests
          on colour alone. */}
      {series.length > 1 && (
        <div className="viz-legend">
          {series.map((s) => (
            <span key={s.key} className={`viz-key ${s.slot}`}>
              <i />
              {s.label}
            </span>
          ))}
        </div>
      )}
      {series.length === 1 && (
        <div className="viz-legend">
          <span className={`viz-key ${series[0].slot}`}>
            <i />
            {series[0].label}
          </span>
        </div>
      )}
      <span id={`${uid}-desc`} hidden>
        Price per {unitLabel} for each purchase, grouped by store.
      </span>
    </div>
  )
}
