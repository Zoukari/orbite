import { useEffect, useMemo, useState } from 'react'
import { useData } from '../lib/store'
import { sunPosition, moonPhase, defaultLocation } from '../lib/sun'

// Ciel vivant : suit le vrai soleil de ta ville, par étapes de 30 min.
// Reste sombre en journée (bleu profond) pour garder le texte lisible.
type RGB = [number, number, number]
const KEYS: { alt: number; top: RGB; mid: RGB; bottom: RGB; glow: RGB; ga: number }[] = [
  { alt: -90, top: [10, 12, 30], mid: [14, 17, 38], bottom: [20, 24, 50], glow: [110, 120, 255], ga: 0.1 }, // nuit
  { alt: -18, top: [10, 12, 30], mid: [14, 17, 38], bottom: [20, 24, 50], glow: [110, 120, 255], ga: 0.1 },
  { alt: -10, top: [14, 16, 42], mid: [26, 24, 64], bottom: [48, 34, 82], glow: [150, 110, 255], ga: 0.2 }, // heure bleue
  { alt: -3, top: [20, 22, 58], mid: [52, 34, 86], bottom: [120, 58, 92], glow: [255, 120, 140], ga: 0.32 }, // crépuscule rose
  { alt: 3, top: [24, 34, 74], mid: [70, 50, 96], bottom: [150, 84, 80], glow: [255, 160, 90], ga: 0.4 }, // lever/coucher doré
  { alt: 12, top: [18, 44, 88], mid: [26, 62, 112], bottom: [50, 88, 132], glow: [255, 200, 130], ga: 0.28 }, // heure dorée
  { alt: 30, top: [14, 46, 92], mid: [20, 64, 118], bottom: [34, 86, 140], glow: [150, 210, 255], ga: 0.2 }, // jour
  { alt: 90, top: [12, 48, 98], mid: [18, 66, 124], bottom: [30, 90, 148], glow: [160, 220, 255], ga: 0.2 }
]
const mix = (a: RGB, b: RGB, k: number): RGB => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * k)) as RGB
const css = (c: RGB, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`

export function skyAt(alt: number) {
  let i = 0
  while (i < KEYS.length - 2 && alt > KEYS[i + 1].alt) i++
  const A = KEYS[i], B = KEYS[i + 1]
  const k = Math.max(0, Math.min(1, (alt - A.alt) / (B.alt - A.alt)))
  return { top: mix(A.top, B.top, k), mid: mix(A.mid, B.mid, k), bottom: mix(A.bottom, B.bottom, k), glow: mix(A.glow, B.glow, k), ga: A.ga + (B.ga - A.ga) * k }
}

const STEP = 30 * 60000
export function useSkyState() {
  const on = useData((s) => s.settings.sky !== false)
  const loc = useData((s) => s.settings.skyLoc) || defaultLocation()
  const [slot, setSlot] = useState(() => Math.floor(Date.now() / STEP))
  useEffect(() => {
    const id = setInterval(() => setSlot(Math.floor(Date.now() / STEP)), 60000)
    const vis = () => document.visibilityState === 'visible' && setSlot(Math.floor(Date.now() / STEP))
    document.addEventListener('visibilitychange', vis)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', vis) }
  }, [])
  return useMemo(() => {
    const date = new Date(slot * STEP + STEP / 2) // milieu du créneau de 30 min
    const sun = sunPosition(date, loc.lat, loc.lng)
    const phase = moonPhase(date)
    return { on, loc, date, sun, phase }
  }, [slot, loc.lat, loc.lng, on])
}

export function Sky() {
  const { on, sun, phase } = useSkyState()
  const sky = skyAt(sun.alt)
  const night = Math.max(0, Math.min(1, (-sun.alt - 2) / 12)) // 0 = jour, 1 = nuit noire
  useEffect(() => {
    document.documentElement.style.setProperty('--night', on ? (0.25 + night * 0.75).toFixed(2) : '1')
    const m = document.querySelector('meta[name="theme-color"]')
    if (m) m.setAttribute('content', on ? `rgb(${sky.top.join(',')})` : '#141831')
  }, [on, night, sky.top])
  if (!on) return null

  // position à l'écran : l'arc va de 8 % (lever) à 92 % (coucher), hauteur selon l'altitude
  const H0 = Math.max(20, sun.H0)
  const sx = 50 + (sun.H / H0) * 42
  const sy = 78 - (Math.max(-8, sun.alt) / Math.max(15, sun.noonAlt)) * 64
  const sunUp = sun.alt > -6
  // lune : en retard sur le soleil de phase × 360°
  let mH = sun.H - phase * 360
  mH = ((mH + 540) % 360) - 180
  const mAlt = Math.cos((mH * Math.PI) / 180)
  const mx = 50 + (mH / 90) * 42
  const my = 78 - Math.max(-0.15, mAlt) * 60
  const moonUp = mAlt > -0.1 && sun.alt < 4 && phase > 0.03 && phase < 0.97
  const lit = phase <= 0.5 ? phase * 2 : (1 - phase) * 2 // 0 → 1 → 0

  return (
    <div className="sky pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <div className="sky-layer absolute inset-0" style={{ background: `linear-gradient(180deg, ${css(sky.top)} 0%, ${css(sky.mid)} 55%, ${css(sky.bottom)} 100%)` }} />
      {/* halo à l'horizon, côté soleil */}
      <div className="sky-layer absolute inset-0" style={{ background: `radial-gradient(ellipse 85% 55% at ${Math.max(5, Math.min(95, sx))}% 105%, ${css(sky.glow, sky.ga)}, transparent 70%)` }} />
      <div className="sky-stars absolute inset-0" style={{ opacity: night * 0.9 }} />
      {sunUp && (
        <div className="sky-body absolute" style={{ left: `${sx}%`, top: `${sy}%` }}>
          <div className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ width: 340, height: 340, background: `radial-gradient(circle, ${css(sky.glow, 0.28)} 0%, ${css(sky.glow, 0.08)} 40%, transparent 70%)` }} />
          <div className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ width: 54, height: 54, background: sun.alt < 8 ? 'radial-gradient(circle at 40% 40%, #fff3d6, #ffb46b 60%, #ff8a5c)' : 'radial-gradient(circle at 40% 40%, #ffffff, #fff1c9 55%, #ffd58a)', boxShadow: `0 0 40px 12px ${css(sky.glow, 0.45)}`, opacity: Math.min(1, (sun.alt + 6) / 6) }} />
        </div>
      )}
      {moonUp && (
        <div className="sky-body absolute" style={{ left: `${mx}%`, top: `${my}%` }}>
          <div className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ width: 200, height: 200, background: `radial-gradient(circle, rgba(200,210,255,${0.06 + lit * 0.1}), transparent 70%)` }} />
          <svg className="absolute -translate-x-1/2 -translate-y-1/2" width="40" height="40" viewBox="-20 -20 40 40" style={{ filter: 'drop-shadow(0 0 10px rgba(210,220,255,.45))' }}>
            <circle r="16" fill="rgba(200,210,255,0.12)" />
            <path d={moonPath(phase)} fill="#e9edff" />
          </svg>
        </div>
      )}
    </div>
  )
}

// croissant/gibbeuse : bord extérieur = demi-cercle, terminateur = demi-ellipse
function moonPath(phase: number) {
  const r = 16
  const waxing = phase < 0.5
  const k = Math.cos(phase * 2 * Math.PI) // 1 = nouvelle, -1 = pleine
  const rx = Math.abs(k) * r
  const outerSweep = waxing ? 1 : 0
  const innerSweep = (waxing ? k > 0 : k < 0) ? 0 : 1
  return `M0,${-r} A${r},${r} 0 0 ${outerSweep} 0,${r} A${rx},${r} 0 0 ${innerSweep} 0,${-r} Z`
}
