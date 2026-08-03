/** Camera barcode scanner built on the native BarcodeDetector API.
 *
 *  Support is good on Android Chrome and recent desktop Chrome; Safari and
 *  Firefox don't ship it. Rather than pull in a multi-megabyte WASM decoder,
 *  unsupported browsers get a manual-entry field — the same code path the
 *  scanner feeds, so nothing downstream has to care which was used. */

import { useEffect, useRef, useState } from 'react'
import { IconBarcode, IconClose } from './icons'
import { Modal, TextInput } from './ui'

interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>
}

interface BarcodeDetectorCtor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike
  getSupportedFormats?: () => Promise<string[]>
}

function getDetectorCtor(): BarcodeDetectorCtor | undefined {
  return (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
}

export function isScannerSupported(): boolean {
  return Boolean(getDetectorCtor()) && Boolean(navigator.mediaDevices?.getUserMedia)
}

export function BarcodeScanner({
  onDetected,
  onClose,
}: {
  onDetected: (barcode: string) => void
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [manual, setManual] = useState('')
  const supported = isScannerSupported()

  useEffect(() => {
    if (!supported) return
    let stream: MediaStream | undefined
    let raf = 0
    let stopped = false

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        })
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()

        const Ctor = getDetectorCtor()
        if (!Ctor) return
        const detector = new Ctor({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'],
        })

        const tick = async () => {
          if (stopped || !videoRef.current) return
          try {
            const results = await detector.detect(videoRef.current)
            if (results.length > 0 && results[0].rawValue) {
              // Short vibration as tactile confirmation where supported.
              navigator.vibrate?.(60)
              onDetected(results[0].rawValue)
              return
            }
          } catch {
            // A single failed frame is normal (e.g. video not ready yet).
          }
          raf = requestAnimationFrame(() => void tick())
        }
        void tick()
      } catch (err) {
        setError(
          err instanceof DOMException && err.name === 'NotAllowedError'
            ? 'Camera permission was denied. Enter the barcode by hand instead.'
            : 'Could not start the camera. Enter the barcode by hand instead.',
        )
      }
    }

    void start()

    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [supported, onDetected])

  // Manual fallback: no camera, or the browser has no BarcodeDetector.
  if (!supported || error) {
    return (
      <Modal
        title="Enter barcode"
        onClose={onClose}
        footer={
          <>
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn primary"
              disabled={!manual.trim()}
              onClick={() => onDetected(manual.trim())}
            >
              Use barcode
            </button>
          </>
        }
      >
        <p style={{ fontSize: 13.5, color: 'var(--text-dim)', marginBottom: 14 }}>
          {error ??
            "This browser can't scan barcodes with the camera. Chrome on Android and desktop can — meanwhile you can type the number from the package."}
        </p>
        <TextInput
          autoFocus
          inputMode="numeric"
          placeholder="e.g. 5010029000109"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && manual.trim()) onDetected(manual.trim())
          }}
        />
      </Modal>
    )
  }

  return (
    <div className="scanner">
      <div className="scanner-bar">
        <IconBarcode style={{ width: 22, height: 22 }} />
        <h2>Scan a barcode</h2>
        <button className="icon-btn bare" onClick={onClose} aria-label="Close" style={{ color: '#fff' }}>
          <IconClose />
        </button>
      </div>
      <video ref={videoRef} playsInline muted />
      <div className="scanner-frame" />
      <div className="scanner-foot">Line the barcode up inside the frame</div>
    </div>
  )
}
