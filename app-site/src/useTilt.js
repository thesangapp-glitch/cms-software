import { useEffect, useRef } from 'react'

// Pointer-driven 3D tilt. Attach the returned ref to an element; it rotates in
// 3D toward the cursor and eases back out. Disabled for reduced-motion / touch.
export function useTilt({ max = 12, scale = 1.02 } = {}) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (window.matchMedia('(hover: none)').matches) return

    let raf
    let rx = 0, ry = 0, trx = 0, try_ = 0, active = false

    const onMove = (e) => {
      const r = el.getBoundingClientRect()
      const px = (e.clientX - r.left) / r.width
      const py = (e.clientY - r.top) / r.height
      trx = (0.5 - py) * max * 2
      try_ = (px - 0.5) * max * 2
      active = true
    }
    const onLeave = () => { trx = 0; try_ = 0; active = false }

    const loop = () => {
      rx += (trx - rx) * 0.1
      ry += (try_ - ry) * 0.1
      const s = active ? scale : 1
      el.style.transform = `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(${s})`
      raf = requestAnimationFrame(loop)
    }

    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onLeave)
    loop()
    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
    }
  }, [max, scale])

  return ref
}
