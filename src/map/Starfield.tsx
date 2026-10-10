import { useEffect, useRef } from 'react'

// Champ d'étoiles très discret, dessiné une seule fois sur un canvas.
// Le parallaxe (léger) suit le déplacement de la carte : pas de coût par frame.
export function Starfield({ offset, calm, light }: { offset: { x: number; y: number }; calm?: boolean; light?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = c.offsetWidth + 400
      const h = c.offsetHeight + 400
      c.width = w * dpr
      c.height = h * dpr
      const ctx = c.getContext('2d')!
      ctx.scale(dpr, dpr)
      let seed = 7
      const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
      const n = Math.round((w * h) / 9000)
      for (let i = 0; i < n; i++) {
        const x = rnd() * w
        const y = rnd() * h
        const r = rnd() < 0.92 ? 0.5 + rnd() * 0.4 : 0.9 + rnd() * 0.5
        if (light) {
          ctx.globalAlpha = 0.18 + rnd() * 0.35
          ctx.fillStyle = rnd() < 0.7 ? '#6f7fd6' : rnd() < 0.5 ? '#c9a24a' : '#9aa3c4'
        } else {
          ctx.globalAlpha = 0.15 + rnd() * 0.5
          ctx.fillStyle = rnd() < 0.85 ? '#dfe5ff' : '#b9c6ff'
        }
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      }
      if (light) {
        // quelques petites étoiles à 4 branches, très discrètes
        for (let i = 0; i < Math.round(n / 40); i++) {
          const x = rnd() * w, y = rnd() * h, s = 3 + rnd() * 3
          ctx.globalAlpha = 0.35
          ctx.strokeStyle = rnd() < 0.5 ? '#7a88e0' : '#d0a54e'
          ctx.lineWidth = 1
          ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x + s, y); ctx.moveTo(x, y - s); ctx.lineTo(x, y + s); ctx.stroke()
        }
      }
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(c.parentElement!)
    return () => ro.disconnect()
  }, [light])
  const px = ((offset.x * 0.03) % 200) - 200
  const py = ((offset.y * 0.03) % 200) - 200
  return (
    <div className={`space ${calm ? 'calm' : ''}`}>
      <canvas ref={ref} className="stars" style={{ width: 'calc(100% + 400px)', height: 'calc(100% + 400px)', transform: `translate3d(${px}px, ${py}px, 0)` }} />
    </div>
  )
}
