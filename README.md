# Pantry

Track your pantry, plan meals from what you have, and never waste food again.

Pantry is a household management app in the mould of [Grocy](https://grocy.info):
food inventory, inventory-aware shopping lists, recipes, meal planning and
chores. It is one codebase that runs as a **website on desktop** and installs to
the **home screen on iOS and Android** as a PWA.

Free, open source, no ads, no accounts, no tracking — and it works offline.

## What it does

**Pantry & food inventory** — Every product has a unit, a category, a storage
location and an optional minimum stock level. Stock is tracked as individual
batches, so two cartons of milk bought a week apart keep their own best-before
dates.

**Expiry monitoring** — The dashboard surfaces what has expired and what is
inside your warning window. Anything in a location flagged as a freezer is
exempt, because frozen food doesn't spoil on the fridge's schedule.

**Smart shopping lists** — Multiple named lists. "Add missing" pulls in every
product that has fallen below its minimum, with the shortfall already worked
out. Items are grouped by store so one shop is one contiguous block. Tick things
off as you go, then "Complete purchase" moves them into your stock in one tap.

**Recipes** — Ingredients can be linked to tracked products, so each recipe
shows whether you can cook it right now and what you're short. Cooking deducts
the ingredients from stock, oldest batch first. Anything you're missing can be
pushed to a shopping list.

**Meal planning** — A week grid you can plan into. Recipes carry their stock
availability into the planner, and the whole week's shortfall can be added to
your shopping list at once.

**Chores** — Recurring household jobs with daily/weekly/monthly/yearly
schedules, optional assignees, and overdue tracking.

**Barcode scanning** — Uses the browser's native `BarcodeDetector` where it
exists (Chrome on Android and desktop). Elsewhere — Safari, Firefox — you get a
manual entry field feeding the same code path, rather than a multi-megabyte WASM
decoder you'd have to download before your first scan.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
```

To build and serve the production bundle:

```bash
npm run build
npm run preview
```

The build output in `dist/` is fully static — put it on any static host, an S3
bucket, a NAS, GitHub Pages. It uses relative paths and hash routing, so it
works from a sub-path with no server rewrite rules.

### Installing it as an app

- **iOS/iPadOS** — open the site in Safari, Share → *Add to Home Screen*.
- **Android** — Chrome will offer *Install app*, or use the menu.
- **Desktop** — Chrome and Edge show an install icon in the address bar.

Once installed it runs full screen with no browser chrome and works with no
connection.

## Where your data lives

In `localStorage`, on the device you're using. Nothing is uploaded anywhere —
there is no server, no account and no sync. That's what makes it work offline
and keeps it private, but it also means:

- Clearing your browser's site data erases your pantry.
- Two devices are two separate pantries.

Settings → **Export backup** writes the whole database to a single JSON file,
and **Import backup** restores it. That's how you move to a new phone or share a
snapshot with someone else in the household.

Settings → **Load demo data** fills the app with a sample household if you want
to look around before committing.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Typecheck, then build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | TypeScript only |
| `npm run e2e` | Build, serve, and drive the app in a real browser |
| `npm run icons` | Regenerate the PWA icon set |

`npm run e2e` is the meaningful test: it drives the real UI and then asserts
against what actually landed in storage, so it catches stock arithmetic bugs and
not just rendering ones.

`npm run icons` regenerates `public/icons/` from `scripts/gen-icons.mjs`, which
draws the mark with a small signed-distance rasteriser and encodes PNGs with
Node's built-in zlib. No binary design assets in the repo, no image dependency.

## How it's put together

```
src/
  types.ts              Domain model — the whole database is plain JSON
  store/
    useStore.ts         Zustand store, persisted to localStorage
    selectors.ts        Pure derivations: expiry, shortfalls, availability
    seed.ts             Empty and demo databases
  lib/
    router.tsx          ~50-line hash router
    util.ts             Dates, formatting, grouping
  components/           Layout, UI primitives, dialogs, barcode scanner
  pages/                One file per section
public/
  sw.js                 Offline service worker
  manifest.webmanifest  PWA manifest
```

Three runtime dependencies: React, React DOM, and Zustand. Routing, UI
components, icons and the offline layer are all local code, which keeps the
bundle at ~83 kB gzipped and means there's no dependency that can break the
offline story.

Some deliberate choices worth knowing about:

- **Stock is batch-level, not a single number.** Consuming always takes from the
  oldest best-before first, which is what makes "use these first" and cooking
  deductions behave sensibly.
- **Deleting master data detaches rather than cascades.** Removing a location
  doesn't delete the food that was in it. Units are the exception: they're
  required on a product, so deleting one still in use is refused.
- **The persisted database is merged against a fresh schema on load,** so a
  saved database from an older version won't crash the UI on a key that didn't
  exist yet.

## Licence

MIT.
