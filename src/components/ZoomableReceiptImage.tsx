import { useCallback, useEffect, useRef, useState } from 'react'

interface ZoomableReceiptImageProps {
  src: string
  alt: string
  scale: number
  minScale?: number
  maxScale?: number
  onScaleChange: (nextScale: number) => void
  className?: string
  showHint?: boolean
}

interface Point {
  x: number
  y: number
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/**
 * GPU-accelerated pinch-to-zoom + 1-finger pan + double-tap image viewport.
 * Zooms strictly inside its container without triggering browser page zoom.
 */
export function ZoomableReceiptImage({
  src,
  alt,
  scale,
  minScale = 1,
  maxScale = 4,
  onScaleChange,
  className = '',
  showHint = false,
}: ZoomableReceiptImageProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  const [tx, setTx] = useState(0)
  const [ty, setTy] = useState(0)
  const [hasInteracted, setHasInteracted] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)

  // Keep latest transform in refs for zero-lag gesture math
  const transformRef = useRef({ scale, tx: 0, ty: 0 })
  transformRef.current.scale = scale
  transformRef.current.tx = tx
  transformRef.current.ty = ty

  const pointersRef = useRef<Map<number, Point>>(new Map())
  const pinchStartRef = useRef<{
    dist: number
    scale: number
    tx: number
    ty: number
    mid: Point
  } | null>(null)
  const panStartRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    tx: number
    ty: number
  } | null>(null)
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null)

  const clampTranslation = useCallback(
    (nextTx: number, nextTy: number, targetScale: number): { x: number; y: number } => {
      const vp = viewportRef.current
      const img = imgRef.current
      if (!vp || !img) return { x: nextTx, y: nextTy }

      const vpW = vp.clientWidth
      const vpH = vp.clientHeight
      const baseW = img.offsetWidth || vpW
      const baseH = img.offsetHeight || vpH
      const scaledW = baseW * targetScale
      const scaledH = baseH * targetScale

      const clampedX =
        scaledW <= vpW
          ? (vpW - scaledW) / 2
          : clamp(nextTx, vpW - scaledW, 0)
      const clampedY =
        scaledH <= vpH
          ? (vpH - scaledH) / 2
          : clamp(nextTy, vpH - scaledH, 0)

      return { x: clampedX, y: clampedY }
    },
    []
  )

  const applyTransform = useCallback(
    (nextScale: number, nextTx: number, nextTy: number, animate = false) => {
      const clampedScale = clamp(nextScale, minScale, maxScale)
      const clamped = clampTranslation(nextTx, nextTy, clampedScale)
      setIsAnimating(animate)
      setTx(clamped.x)
      setTy(clamped.y)
      if (Math.abs(clampedScale - transformRef.current.scale) > 0.001) {
        onScaleChange(clampedScale)
      }
    },
    [clampTranslation, maxScale, minScale, onScaleChange]
  )

  // When external +/-/reset buttons change `scale`, zoom smoothly around viewport center
  const prevScalePropRef = useRef(scale)
  useEffect(() => {
    const prev = prevScalePropRef.current
    if (Math.abs(scale - prev) > 0.001) {
      prevScalePropRef.current = scale
      const vp = viewportRef.current
      if (vp) {
        const cx = vp.clientWidth / 2
        const cy = vp.clientHeight / 2
        const cur = transformRef.current
        if (scale <= minScale + 0.001) {
          const reset = clampTranslation(0, 0, scale)
          setIsAnimating(true)
          setTx(reset.x)
          setTy(reset.y)
        } else {
          const imgX = (cx - cur.tx) / prev
          const imgY = (cy - cur.ty) / prev
          const nextTx = cx - imgX * scale
          const nextTy = cy - imgY * scale
          const clamped = clampTranslation(nextTx, nextTy, scale)
          setIsAnimating(true)
          setTx(clamped.x)
          setTy(clamped.y)
        }
      }
    }
  }, [scale, minScale, clampTranslation])

  // Prevent Safari/Chrome wheel-pinch from zooming the page when cursor is over the PiP viewport
  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return
    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      setHasInteracted(true)
      const rect = vp.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const cur = transformRef.current
      const zoomFactor = Math.exp(-e.deltaY * 0.006)
      const nextScale = clamp(cur.scale * zoomFactor, minScale, maxScale)
      const imgX = (mx - cur.tx) / cur.scale
      const imgY = (my - cur.ty) / cur.scale
      const nextTx = mx - imgX * nextScale
      const nextTy = my - imgY * nextScale
      prevScalePropRef.current = nextScale
      applyTransform(nextScale, nextTx, nextTy, false)
    }
    vp.addEventListener('wheel', handleWheel, { passive: false })
    return () => vp.removeEventListener('wheel', handleWheel)
  }, [applyTransform, maxScale, minScale])

  const getLocalPoint = (e: React.PointerEvent): Point => {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setIsAnimating(false)

    const pt = getLocalPoint(e)
    pointersRef.current.set(e.pointerId, pt)

    const pts = Array.from(pointersRef.current.values())
    if (pts.length === 2) {
      setHasInteracted(true)
      panStartRef.current = null
      const dist = Math.max(10, distance(pts[0], pts[1]))
      const mid = midpoint(pts[0], pts[1])
      pinchStartRef.current = {
        dist,
        scale: transformRef.current.scale,
        tx: transformRef.current.tx,
        ty: transformRef.current.ty,
        mid,
      }
      return
    }

    if (pts.length === 1) {
      // Detect double-tap to zoom in/out anchored to tap location
      const now = Date.now()
      const last = lastTapRef.current
      if (
        last &&
        now - last.time < 300 &&
        Math.hypot(pt.x - last.x, pt.y - last.y) < 34
      ) {
        lastTapRef.current = null
        setHasInteracted(true)
        const cur = transformRef.current
        const nextScale = cur.scale > 1.25 ? minScale : 2.2
        if (nextScale <= minScale + 0.001) {
          prevScalePropRef.current = nextScale
          applyTransform(nextScale, 0, 0, true)
        } else {
          const imgX = (pt.x - cur.tx) / cur.scale
          const imgY = (pt.y - cur.ty) / cur.scale
          const nextTx = pt.x - imgX * nextScale
          const nextTy = pt.y - imgY * nextScale
          prevScalePropRef.current = nextScale
          applyTransform(nextScale, nextTx, nextTy, true)
        }
        return
      }
      lastTapRef.current = { time: now, x: pt.x, y: pt.y }

      panStartRef.current = {
        pointerId: e.pointerId,
        startX: pt.x,
        startY: pt.y,
        tx: transformRef.current.tx,
        ty: transformRef.current.ty,
      }
    }
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!pointersRef.current.has(e.pointerId)) return
    e.preventDefault()

    const pt = getLocalPoint(e)
    pointersRef.current.set(e.pointerId, pt)

    const pts = Array.from(pointersRef.current.values())
    if (pts.length >= 2 && pinchStartRef.current) {
      const start = pinchStartRef.current
      const curDist = Math.max(10, distance(pts[0], pts[1]))
      const curMid = midpoint(pts[0], pts[1])
      const nextScale = clamp(
        start.scale * (curDist / start.dist),
        minScale,
        maxScale
      )

      // Keep the exact receipt point under the initial pinch midpoint glued to current midpoint
      const imgX = (start.mid.x - start.tx) / start.scale
      const imgY = (start.mid.y - start.ty) / start.scale
      const nextTx = curMid.x - imgX * nextScale
      const nextTy = curMid.y - imgY * nextScale

      prevScalePropRef.current = nextScale
      applyTransform(nextScale, nextTx, nextTy, false)
      return
    }

    if (pts.length === 1 && panStartRef.current?.pointerId === e.pointerId) {
      const pan = panStartRef.current
      const dx = pt.x - pan.startX
      const dy = pt.y - pan.startY
      if (Math.hypot(dx, dy) > 4) {
        setHasInteracted(true)
        lastTapRef.current = null
      }
      const clamped = clampTranslation(
        pan.tx + dx,
        pan.ty + dy,
        transformRef.current.scale
      )
      setTx(clamped.x)
      setTy(clamped.y)
    }
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId)
    const remaining = Array.from(pointersRef.current.entries())

    if (remaining.length < 2) {
      pinchStartRef.current = null
    }

    // Smooth handoff from 2-finger pinch back to 1-finger pan without jumping
    if (remaining.length === 1) {
      const [id, pt] = remaining[0]
      panStartRef.current = {
        pointerId: id,
        startX: pt.x,
        startY: pt.y,
        tx: transformRef.current.tx,
        ty: transformRef.current.ty,
      }
    } else if (remaining.length === 0) {
      panStartRef.current = null
    }
  }

  const handleImageLoad = () => {
    const clamped = clampTranslation(0, 0, transformRef.current.scale)
    setTx(clamped.x)
    setTy(clamped.y)
  }

  return (
    <div
      ref={viewportRef}
      className={`zoomable-viewport ${className}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        draggable={false}
        onLoad={handleImageLoad}
        className={`zoomable-img ${isAnimating ? 'animating' : ''}`}
        style={{
          transform: `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`,
        }}
      />
      {showHint && !hasInteracted && (
        <div className="zoomable-hint" aria-hidden="true">
          Pinch to zoom · Drag to pan · Double-tap
        </div>
      )}
    </div>
  )
}
