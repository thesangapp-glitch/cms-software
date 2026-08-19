import { useEffect, useRef } from 'react'
import { useTheme } from '../theme.jsx'

// Animated "connection network" — drifting nodes linked by lines when close.
// On-brand with the Sang logo (two connected nodes) and gives a futuristic,
// living backdrop. Pointer position gently parallaxes the field. Respects
// prefers-reduced-motion (renders a single static frame).
export default function NetworkCanvas({ density = 0.00009, className = '' }) {
  const canvasRef = useRef(null)
  const { theme } = useTheme()

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let raf
    let width = 0
    let height = 0
    let nodes = []
    const pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const palette = theme === 'dark'
      ? { a: [77, 139, 240], b: [23, 209, 224], line: '120, 170, 255' }
      : { a: [47, 107, 224], b: [15, 184, 198], line: '80, 130, 220' }

    function resize() {
      const rect = canvas.getBoundingClientRect()
      width = rect.width
      height = rect.height
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const count = Math.max(28, Math.min(90, Math.floor(width * height * density)))
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.28,
        vy: (Math.random() - 0.5) * 0.28,
        r: Math.random() * 1.8 + 1.1,
        m: Math.random(),
      }))
    }

    function mix(t) {
      return [
        Math.round(palette.a[0] + (palette.b[0] - palette.a[0]) * t),
        Math.round(palette.a[1] + (palette.b[1] - palette.a[1]) * t),
        Math.round(palette.a[2] + (palette.b[2] - palette.a[2]) * t),
      ]
    }

    const MAX = 140

    function frame() {
      pointer.x += (pointer.tx - pointer.x) * 0.05
      pointer.y += (pointer.ty - pointer.y) * 0.05
      const ox = (pointer.x - 0.5) * 26
      const oy = (pointer.y - 0.5) * 26

      ctx.clearRect(0, 0, width, height)

      for (const n of nodes) {
        if (!reduce) {
          n.x += n.vx
          n.y += n.vy
          if (n.x < 0 || n.x > width) n.vx *= -1
          if (n.y < 0 || n.y > height) n.vy *= -1
        }
      }

      // links
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j]
          const dx = a.x - b.x, dy = a.y - b.y
          const dist = Math.hypot(dx, dy)
          if (dist < MAX) {
            const alpha = (1 - dist / MAX) * 0.5
            ctx.strokeStyle = `rgba(${palette.line}, ${alpha})`
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(a.x + ox * a.m, a.y + oy * a.m)
            ctx.lineTo(b.x + ox * b.m, b.y + oy * b.m)
            ctx.stroke()
          }
        }
      }

      // nodes
      for (const n of nodes) {
        const [r, g, bl] = mix(n.m)
        const px = n.x + ox * n.m
        const py = n.y + oy * n.m
        const glow = ctx.createRadialGradient(px, py, 0, px, py, n.r * 4)
        glow.addColorStop(0, `rgba(${r},${g},${bl},0.9)`)
        glow.addColorStop(1, `rgba(${r},${g},${bl},0)`)
        ctx.fillStyle = glow
        ctx.beginPath()
        ctx.arc(px, py, n.r * 4, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = `rgb(${r},${g},${bl})`
        ctx.beginPath()
        ctx.arc(px, py, n.r, 0, Math.PI * 2)
        ctx.fill()
      }

      if (!reduce) raf = requestAnimationFrame(frame)
    }

    function onPointer(e) {
      pointer.tx = e.clientX / window.innerWidth
      pointer.ty = e.clientY / window.innerHeight
    }

    resize()
    frame()
    window.addEventListener('resize', resize)
    if (!reduce) window.addEventListener('pointermove', onPointer)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onPointer)
    }
  }, [theme, density])

  return <canvas ref={canvasRef} className={`network-canvas ${className}`} aria-hidden="true" />
}
