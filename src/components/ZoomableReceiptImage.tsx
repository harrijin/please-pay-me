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
  const [hasInteracted, setHasInteracted] = useState(false)

  // Mutable transform state applied directly to DOM for 60/120fps pinch-zoom without React re-renders
  const transformRef = useRef({ scale, tx: 0, ty: 0 })
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
    (nextTx: number, nextTy: number, targetScale: number): Point => {
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
        scaledW <= vpW ? (vpW - scaledW) / 2 : clamp(nextTx, vpW - scaledW, 0)
      const clampedY =
        scaledH <= vpH ? (vpH - scaledH) / 2 : clamp(nextTy, vpH - scaledH, 0)

      return { x: clampedX, y: clampedY }
    },
    []
  )

  const commitDomTransform = useCallback((animate: boolean) => {
    const img = imgRef.current
    if (!img) return
    const { tx, ty, scale: s } = transformRef.current
    img.classList.toggle('animating', animate)
    img.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${s})`
  }, [])

  const applyTransform = useCallback(
    (
      nextScale: number,
      nextTx: number,
      nextTy: number,
      animate = false,
      notifyParent = true
    ) => {
      const clampedScale = clamp(nextScale, minScale, maxScale)
      const clamped = clampTranslation(nextTx, nextTy, clampedScale)
      const prevScale = transformRef.current.scale
      transformRef.current = {
        scale: clampedScale,
        tx: clamped.x,
        ty: clamped.y,
      }
      commitDomTransform(animate)
      if (notifyParent && Math.abs(clampedScale - prevScale) > 0.001) {
        onScaleChange(clampedScale)
      }
    },
    [clampTranslation, commitDomTransform, maxScale, minScale, onScaleChange]
  )

  // Sync external +/-/reset button changes from parent into the GPU transform
  useEffect(() => {
    const cur = transformRef.current
    if (Math.abs(scale - cur.scale) <= 0.001) return

    const vp = viewportRef.current
    if (!vp) {
      transformRef.current.scale = scale
      commitDomTransform(true)
      return
    }

    if (scale <= minScale + 0.001) {
      applyTransform(scale, 0, 0, true, false)
    } else {
      const cx = vp.clientWidth / 2
      const cy = vp.clientHeight / 2
      const imgX = (cx - cur.tx) / cur.scale
      const imgY = (cy - cur.ty) / cur.scale
      const nextTx = cx - imgX * scale
      const nextTy = cy - imgY * scale
      applyTransform(scale, nextTx, nextTy, true, false)
    }
  }, [scale, minScale, applyTransform, commitDomTransform])

  // Prevent trackpad/wheel pinch from zooming the browser page when cursor is over the viewport
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
      applyTransform(nextScale, mx - imgX * nextScale, my - imgY * nextScale, false)
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
          applyTransform(nextScale, 0, 0, true)
        } else {
          const imgX = (pt.x - cur.tx) / cur.scale
          const imgY = (pt.y - cur.ty) / cur.scale
          applyTransform(nextScale, pt.x - imgX * nextScale, pt.y - imgY * nextScale, true)
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

      const imgX = (start.mid.x - start.tx) / start.scale
      const imgY = (start.mid.y - start.ty) / start.scale
      const nextTx = curMid.x - imgX * nextScale
      const nextTy = curMid.y - imgY * nextScale

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
      applyTransform(
        transformRef.current.scale,
        pan.tx + dx,
        pan.ty + dy,
        false,
        false
      )
    }
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId)
    const remaining = Array.from(pointersRef.current.entries())

    if (remaining.length < 2) {
      pinchStartRef.current = null
    }

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
    applyTransform(transformRef.current.scale, 0, 0, false, false)
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
        className="zoomable-img"
      />
      {showHint && !hasInteracted && (
        <div className="zoomable-hint" aria-hidden="true">
          Pinch to zoom · Drag to pan · Double-tap
        </div>
      )}
    </div>
  )
}
