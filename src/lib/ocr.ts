/** Reading text out of photos and screenshots.
 *
 *  Tesseract is ~7 MB of WebAssembly and language data — far too much to ship
 *  in an app that is otherwise 93 kB. So it is fetched from a CDN the first
 *  time someone actually scans something, and never at all for people who only
 *  ever type. The browser caches it afterwards, so later scans work offline.
 *
 *  Recognition runs on the device. Photographs are never uploaded anywhere.
 */

const CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@7/dist/tesseract.min.js'

interface TesseractWorker {
  recognize: (image: Blob | string) => Promise<{ data: { text: string } }>
  terminate: () => Promise<void>
}

interface TesseractGlobal {
  createWorker: (
    lang: string,
    oem?: number,
    options?: { logger?: (m: { status: string; progress: number }) => void },
  ) => Promise<TesseractWorker>
}

function getTesseract(): TesseractGlobal | undefined {
  return (globalThis as { Tesseract?: TesseractGlobal }).Tesseract
}

let loading: Promise<TesseractGlobal> | null = null

/** Injects the library once; concurrent callers share the same promise. */
function loadLibrary(): Promise<TesseractGlobal> {
  const existing = getTesseract()
  if (existing) return Promise.resolve(existing)
  if (loading) return loading

  loading = new Promise<TesseractGlobal>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = CDN
    script.async = true
    script.onload = () => {
      const lib = getTesseract()
      if (lib) resolve(lib)
      else reject(new Error('loaded-but-missing'))
    }
    script.onerror = () => reject(new Error('load-failed'))
    document.head.appendChild(script)
  })
  // A failed load must not poison later attempts — the network may come back.
  loading.catch(() => {
    loading = null
  })
  return loading
}

export class OcrUnavailableError extends Error {
  constructor() {
    super('ocr-unavailable')
    this.name = 'OcrUnavailableError'
  }
}

export interface OcrProgress {
  /** 0–1, or undefined while the engine is still downloading. */
  progress: number
  /** Plain-language description of the current phase. */
  label: string
}

/**
 * Reads text from an image.
 *
 * @throws OcrUnavailableError when the engine can't be fetched — offline on a
 *         first run, or a page whose content policy blocks the CDN.
 */
export async function readTextFromImage(
  image: Blob,
  onProgress?: (p: OcrProgress) => void,
): Promise<string> {
  let lib: TesseractGlobal
  try {
    lib = await loadLibrary()
  } catch {
    throw new OcrUnavailableError()
  }

  onProgress?.({ progress: 0, label: 'Warming up…' })

  let worker: TesseractWorker | undefined
  try {
    worker = await lib.createWorker('eng', 1, {
      logger: (m) => {
        // Tesseract's own phase names are jargon; translate them.
        const label =
          m.status === 'recognizing text'
            ? 'Reading the words…'
            : m.status.includes('loading') || m.status.includes('initializing')
              ? 'Getting ready…'
              : 'Working…'
        onProgress?.({ progress: m.progress, label })
      },
    })
    const result = await worker.recognize(image)
    return result.data.text ?? ''
  } catch {
    throw new OcrUnavailableError()
  } finally {
    await worker?.terminate().catch(() => undefined)
  }
}

/** True once the engine is in memory, so later scans are instant. */
export function isOcrReady(): boolean {
  return Boolean(getTesseract())
}

/**
 * Tidies raw OCR output before it reaches the parser.
 *
 * Recognition of a receipt is noisy: stray single characters, lines of pure
 * punctuation, and long runs of spaces used as column separators.
 */
export function cleanOcrText(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) =>
      line
        // Column gaps become a single separator the line parser understands.
        .replace(/\s{2,}/g, ' ')
        .replace(/[|_]{2,}/g, ' ')
        .trim(),
    )
    .filter((line) => {
      if (line.length < 2) return false
      // Drop lines with no letters at all — barcodes, rules, till codes.
      if (!/[a-z]/i.test(line)) return false
      return true
    })
    .join('\n')
}
