/**
 * Bundles the built app into one self-contained HTML file.
 *
 * Inlines the CSS and JS from `dist/` so the result has zero external
 * requests — it runs from a `file://` path, a USB stick, an email
 * attachment, or any static host, with no build step and no server.
 *
 *   npm run build && node scripts/build-standalone.mjs
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const assets = join(root, 'dist', 'assets')

let files
try {
  files = readdirSync(assets)
} catch {
  console.error('No dist/assets — run `npm run build` first.')
  process.exit(1)
}

const jsName = files.find((f) => f.endsWith('.js'))
const cssName = files.find((f) => f.endsWith('.css'))
if (!jsName || !cssName) {
  console.error('Expected one .js and one .css in dist/assets.')
  process.exit(1)
}

const js = readFileSync(join(assets, jsName), 'utf8')
const css = readFileSync(join(assets, cssName), 'utf8')

// A literal </script> inside the bundle would close the tag early. Splitting
// the sequence is safe because it only ever appears inside string literals.
const safeJs = js.replaceAll('</script>', '<\\/script>')

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=5">
<title>Pantry — Food Inventory &amp; Meal Planner</title>
<meta name="description" content="Track your pantry, plan meals from what you have, and never waste food again.">
<meta name="theme-color" content="#f4f5f7" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#14161a" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Pantry">
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<script type="module">${safeJs}</script>
</body>
</html>
`

const out = join(root, 'dist', 'pantry-standalone.html')
writeFileSync(out, html)
console.log(`pantry-standalone.html  ${(html.length / 1024).toFixed(0)} kB  (one file, no dependencies)`)
