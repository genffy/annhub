'use client'

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * Draws a pixel-positioned scene at its natural `width` x `height` and scales it down to the width it is given, so a
 * browser window with an overlay in a precise spot stays exact on a phone. The wrapper keeps the aspect ratio, so the
 * page does not jump when the scale is measured. The scene stays hidden until then (no half-cropped first frame);
 * if scripts never run, a CSS animation reveals it at natural size after a moment.
 */
export default function Fit({ width, height, children, className = '' }: { width: number; height: number; children: ReactNode; className?: string }) {
  const outer = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState<number | null>(null)

  useEffect(() => {
    const el = outer.current
    if (!el) return
    const update = () => setScale(Math.min(1, el.clientWidth / width))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [width])

  return (
    <div ref={outer} className={`ah-fit ${className}`} style={{ aspectRatio: `${width} / ${height}`, maxWidth: width }}>
      <div className="ah-fit-in" data-ready={scale === null ? undefined : ''} style={{ width, height, transform: scale === null ? undefined : `scale(${scale})` }}>
        {children}
      </div>
    </div>
  )
}
