export interface NormalizedRect {
  /** All coordinates are normalized in [0, 1] relative to the rotated image */
  x: number
  y: number
  w: number
  h: number
}

export interface ProcessedReceiptImage {
  /** Raw base64 JPEG string (without data URL prefix) for Gemini inlineData */
  base64: string
  /** Data URL for local thumbnail preview if needed */
  dataUrl: string
  width: number
  height: number
  byteLength: number
}

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not decode receipt image.'))
    img.src = src
  })
}

/**
 * Applies rotation (0/90/180/270 deg), burns blackout redaction boxes directly
 * onto canvas pixels, crops to the selected region, scales down to max 1600px,
 * and exports as JPEG (quality 0.88).
 */
export async function exportCroppedRedactedJpeg(options: {
  image: HTMLImageElement
  rotationDeg: number
  crop: NormalizedRect
  redactions: NormalizedRect[]
  maxDimension?: number
  quality?: number
}): Promise<ProcessedReceiptImage> {
  const {
    image,
    rotationDeg,
    crop,
    redactions,
    maxDimension = 1600,
    quality = 0.88,
  } = options

  const normRot = ((rotationDeg % 360) + 360) % 360
  const natW = image.naturalWidth
  const natH = image.naturalHeight
  const swapped = normRot === 90 || normRot === 270
  const rotW = swapped ? natH : natW
  const rotH = swapped ? natW : natH

  // Step 1: Render rotated image onto an offscreen canvas
  const rotCanvas = document.createElement('canvas')
  rotCanvas.width = rotW
  rotCanvas.height = rotH
  const rotCtx = rotCanvas.getContext('2d')
  if (!rotCtx) {
    throw new Error('Canvas 2D context unavailable.')
  }

  rotCtx.save()
  rotCtx.translate(rotW / 2, rotH / 2)
  rotCtx.rotate((normRot * Math.PI) / 180)
  rotCtx.drawImage(image, -natW / 2, -natH / 2)
  rotCtx.restore()

  // Step 2: Permanently burn blackout redaction rectangles into pixel data
  if (redactions.length > 0) {
    rotCtx.fillStyle = '#000000'
    for (const box of redactions) {
      const rx = Math.max(0, Math.floor(box.x * rotW))
      const ry = Math.max(0, Math.floor(box.y * rotH))
      const rw = Math.ceil(box.w * rotW)
      const rh = Math.ceil(box.h * rotH)
      rotCtx.fillRect(rx, ry, rw, rh)
    }
  }

  // Step 3: Crop & scale to maxDimension (1600px)
  const sx = Math.max(0, Math.min(rotW - 1, Math.round(crop.x * rotW)))
  const sy = Math.max(0, Math.min(rotH - 1, Math.round(crop.y * rotH)))
  const sw = Math.max(16, Math.min(rotW - sx, Math.round(crop.w * rotW)))
  const sh = Math.max(16, Math.min(rotH - sy, Math.round(crop.h * rotH)))

  const scale = Math.min(1, maxDimension / Math.max(sw, sh))
  const outW = Math.max(1, Math.round(sw * scale))
  const outH = Math.max(1, Math.round(sh * scale))

  const outCanvas = document.createElement('canvas')
  outCanvas.width = outW
  outCanvas.height = outH
  const outCtx = outCanvas.getContext('2d')
  if (!outCtx) {
    throw new Error('Output canvas 2D context unavailable.')
  }

  outCtx.fillStyle = '#ffffff'
  outCtx.fillRect(0, 0, outW, outH)
  outCtx.imageSmoothingEnabled = true
  outCtx.imageSmoothingQuality = 'high'
  outCtx.drawImage(rotCanvas, sx, sy, sw, sh, 0, 0, outW, outH)

  const dataUrl = outCanvas.toDataURL('image/jpeg', quality)
  const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '')

  // Release offscreen canvas memory promptly
  rotCanvas.width = 0
  rotCanvas.height = 0
  outCanvas.width = 0
  outCanvas.height = 0

  return {
    base64,
    dataUrl,
    width: outW,
    height: outH,
    byteLength: Math.round((base64.length * 3) / 4),
  }
}
