import { useEffect, useRef, useState, type ReactNode } from 'react'
import { EPASS_WIDTH } from './EpassCard'

/** Scales fixed-width content down to the available width (never up). */
export function FitWidth({ children, width = EPASS_WIDTH }: { children: ReactNode; width?: number }) {
  const outer = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [h, setH] = useState<number | undefined>(undefined)

  useEffect(() => {
    const el = outer.current
    const inn = inner.current
    if (!el || !inn) return
    const update = () => {
      const s = Math.min(1, el.clientWidth / width)
      setScale(s)
      setH(inn.offsetHeight * s)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    ro.observe(inn)
    return () => ro.disconnect()
  }, [width])

  return (
    <div ref={outer} className="w-full" style={{ height: h }}>
      <div ref={inner} style={{ width, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        {children}
      </div>
    </div>
  )
}
