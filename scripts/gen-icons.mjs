/**
 * Generates the PWA icon set.
 *
 * Everything is drawn from scratch and encoded with Node's built-in zlib, so
 * the repository carries no binary design assets and no image dependency —
 * run `npm run icons` to regenerate them after changing the mark.
 */

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')

/* ------------------------------------------------------------ PNG encoding */

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** Encodes an RGBA byte array as a PNG buffer. */
function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  // 10..12 stay zero: deflate, adaptive filtering, no interlace.

  // One filter byte (0 = None) per scanline.
  const raw = Buffer.alloc(height * (width * 4 + 1))
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1)
    raw[rowStart] = 0
    rgba.copy
      ? rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4)
      : Buffer.from(rgba.buffer, y * width * 4, width * 4).copy(raw, rowStart + 1)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* -------------------------------------------------------------- geometry */

/** Shortest distance from point p to segment ab. */
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
  const cx = ax + t * dx
  const cy = ay + t * dy
  return Math.hypot(px - cx, py - cy)
}

/** Distance to a rounded rectangle's edge; negative inside. */
function distToRoundedRect(px, py, w, h, r) {
  const qx = Math.abs(px - w / 2) - (w / 2 - r)
  const qy = Math.abs(py - h / 2) - (h / 2 - r)
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
  return outside + Math.min(Math.max(qx, qy), 0) - r
}

/** 0→1 ramp across `edge`, used for anti-aliasing. */
function smooth(edge, d) {
  return Math.max(0, Math.min(1, 0.5 - d / edge))
}

/* ------------------------------------------------------------- the mark */

// The cart, in a 24×24 design space: handle, then the basket outline.
const CART = [
  [2.6, 4.8],
  [5.6, 4.8],
  [8.9, 16.8],
  [18.6, 16.8],
  [21.4, 7.6],
  [6.37, 7.6],
]

const STROKE = 2.0

/** Distance from a design-space point to the cart's stroked path. */
function distToCart(x, y) {
  let best = Infinity
  for (let i = 0; i < CART.length - 1; i++) {
    const [ax, ay] = CART[i]
    const [bx, by] = CART[i + 1]
    best = Math.min(best, distToSegment(x, y, ax, ay, bx, by))
  }
  return best - STROKE / 2
}

function mix(a, b, t) {
  return a + (b - a) * t
}

/**
 * Renders one icon.
 * @param size    pixel dimensions
 * @param radius  corner radius as a fraction of size (0 = square)
 * @param glyph   glyph width as a fraction of size
 */
function renderIcon(size, { radius = 0.225, glyph = 0.62 } = {}) {
  const rgba = Buffer.alloc(size * size * 4)
  const aa = 1.6 // anti-aliasing width in pixels

  const cornerR = radius * size
  const glyphScale = (glyph * size) / 24
  const glyphOffset = (size - 24 * glyphScale) / 2

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5
      const py = y + 0.5

      // Background: rounded square with a diagonal leaf-to-pine gradient.
      const bgAlpha = radius > 0 ? smooth(aa, distToRoundedRect(px, py, size, size, cornerR)) : 1
      const t = Math.max(0, Math.min(1, (px / size) * 0.45 + (py / size) * 0.55))
      let r = mix(0x3c, 0x0a, t)
      let g = mix(0xe6, 0x7d, t)
      let b = mix(0x8c, 0x4e, t)

      // Glyph: white cart composited over the gradient.
      const gx = (px - glyphOffset) / glyphScale
      const gy = (py - glyphOffset) / glyphScale
      const glyphAlpha = smooth(aa / glyphScale, distToCart(gx, gy))
      if (glyphAlpha > 0) {
        r = mix(r, 255, glyphAlpha)
        g = mix(g, 255, glyphAlpha)
        b = mix(b, 255, glyphAlpha)
      }

      const i = (y * size + x) * 4
      rgba[i] = Math.round(r)
      rgba[i + 1] = Math.round(g)
      rgba[i + 2] = Math.round(b)
      rgba[i + 3] = Math.round(bgAlpha * 255)
    }
  }

  return encodePng(size, size, rgba)
}

/* ------------------------------------------------------------------ main */

mkdirSync(OUT_DIR, { recursive: true })

const targets = [
  // iOS rounds the home-screen icon itself, so this one is full-bleed square.
  ['icon-180.png', 180, { radius: 0, glyph: 0.62 }],
  ['icon-192.png', 192, { radius: 0.225, glyph: 0.62 }],
  ['icon-512.png', 512, { radius: 0.225, glyph: 0.62 }],
  // Maskable icons get cropped to a circle on some launchers: full bleed,
  // glyph kept inside the 80% safe zone.
  ['icon-maskable-512.png', 512, { radius: 0, glyph: 0.5 }],
  ['favicon-32.png', 32, { radius: 0.2, glyph: 0.7 }],
]

for (const [name, size, opts] of targets) {
  const png = renderIcon(size, opts)
  writeFileSync(join(OUT_DIR, name), png)
  console.log(`${name.padEnd(24)} ${size}×${size}  ${(png.length / 1024).toFixed(1)} kB`)
}
