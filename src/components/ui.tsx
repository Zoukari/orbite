import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useData } from '../lib/store'
import { TYPE_META } from '../lib/meta'
import type { Entity } from '../lib/types'

export function useIsMobile() {
  const [m, setM] = useState(() => window.matchMedia('(max-width: 767px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const fn = () => setM(mq.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])
  return m
}

// ───────── Icônes (trait fin, style SF Symbols) ─────────
const P: Record<string, string> = {
  home: 'M4 11l8-6.5L20 11v8a1 1 0 01-1 1h-4v-6H9v6H5a1 1 0 01-1-1z',
  map: 'M12 12m-2.5 0a2.5 2.5 0 105 0 2.5 2.5 0 10-5 0M12 9.5V5M14.2 13.3l4 2.3M9.8 13.3l-4 2.3M12 5m-1.5 0a1.5 1.5 0 103 0 1.5 1.5 0 10-3 0M19.5 16.3m-1.5 0a1.5 1.5 0 103 0 1.5 1.5 0 10-3 0M4.5 16.3m-1.5 0a1.5 1.5 0 103 0 1.5 1.5 0 10-3 0',
  tasks: 'M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2',
  notes: 'M6 3h9l4 4v13a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1zM14 3v5h5M8.5 12h7M8.5 16h5',
  plus: 'M12 5v14M5 12h14',
  star: 'M12 4l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.4 7.2 18.9l.9-5.4-3.9-3.8 5.4-.8z',
  folder: 'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z',
  target: 'M12 12m-8 0a8 8 0 1016 0 8 8 0 10-16 0M12 12m-4 0a4 4 0 108 0 4 4 0 10-8 0M12 12m-.5 0a.5.5 0 101 0 .5.5 0 10-1 0',
  inbox: 'M4 13l2.5-7h11L20 13v5a1 1 0 01-1 1H5a1 1 0 01-1-1zM4 13h4.5l1 2h5l1-2H20',
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z',
  search: 'M11 11m-6.5 0a6.5 6.5 0 1013 0 6.5 6.5 0 10-13 0M20 20l-4.3-4.3',
  close: 'M6 6l12 12M18 6L6 18',
  chevron: 'M9 6l6 6-6 6',
  down: 'M6 9l6 6 6-6',
  mic: 'M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3zM5.5 11a6.5 6.5 0 0013 0M12 17.5V21',
  bolt: 'M13 3L5 13.5h6L10 21l8-10.5h-6z',
  focus: 'M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3M12 12m-3 0a3 3 0 106 0 3 3 0 10-6 0',
  sidebar: 'M4 5h16v14H4zM15 5v14',
  center: 'M12 12m-2 0a2 2 0 104 0 2 2 0 10-4 0M12 3v3M12 18v3M3 12h3M18 12h3',
  layout: 'M5 12h4M15 6h4M15 18h4M9 12c3 0 3-6 6-6M9 12c3 0 3 6 6 6',
  share: 'M12 3v12M7 8l5-5 5 5M5 14v5a1 1 0 001 1h12a1 1 0 001-1v-5',
  link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3',
  archive: 'M4 5h16v4H4zM5 9v9a1 1 0 001 1h12a1 1 0 001-1V9M10 13h4',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  open: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5',
  collapse: 'M8 12h8M12 3a9 9 0 100 18 9 9 0 000-18z',
  expand: 'M8 12h8M12 8v8M12 3a9 9 0 100 18 9 9 0 000-18z',
  connect: 'M6 6m-2 0a2 2 0 104 0 2 2 0 10-4 0M18 18m-2 0a2 2 0 104 0 2 2 0 10-4 0M7.5 7.5l9 9',
  move: 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3',
  child: 'M6 4v8a3 3 0 003 3h9M15 12l3 3-3 3',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  clock: 'M12 12m-8.5 0a8.5 8.5 0 1017 0 8.5 8.5 0 10-17 0M12 7.5V12l3 2',
  sun: 'M12 12m-4 0a4 4 0 108 0 4 4 0 10-8 0M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z',
  cloud: 'M7 18a4.5 4.5 0 01-.6-9A6 6 0 0118 9.5 4.3 4.3 0 0117.5 18z',
  history: 'M3 12a9 9 0 103-6.7L3 8M3 3v5h5M12 7.5V12l3 2',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  repeat: 'M17 2l3 3-3 3M4 11V9a4 4 0 014-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 01-4 4H4',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5'
}
export function Icon({ name, className = 'h-[18px] w-[18px]', stroke = 1.6 }: { name: keyof typeof P | string; className?: string; stroke?: number }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={P[name] || P.more} />
    </svg>
  )
}

// ───────── Overlays ─────────
export function Modal({ open, onClose, children, title, wide, bare }: { open: boolean; onClose: () => void; children: ReactNode; title?: ReactNode; wide?: boolean; bare?: boolean }) {
  const mobile = useIsMobile()
  useEffect(() => {
    if (!open) return
    const fn = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-start md:pt-[12vh]" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="fade absolute inset-0 bg-black/40 backdrop-blur-[2px] dark:bg-black/60" onPointerDown={onClose} />
      <div className={`relative w-full ${wide ? 'md:max-w-2xl' : 'md:max-w-lg'} ${mobile ? 'sheet max-h-[88vh] rounded-t-3xl safe-b' : 'rise max-h-[76vh] rounded-3xl'} flex flex-col overflow-hidden border border-line/70 bg-surface shadow-2xl`}>
        {mobile && <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line" />}
        {!bare && title && (
          <div className="flex items-center justify-between px-5 pb-2 pt-4">
            <div className="font-display text-base font-semibold">{title}</div>
            <button className="icon-btn -mr-2" onClick={onClose}><Icon name="close" /></button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

// ───────── Éléments de données ─────────
export function ProgressBar({ value, color, slim, showLabel = true }: { value: number | null; color?: string; slim?: boolean; showLabel?: boolean }) {
  if (value == null) return null
  return (
    <div className="flex items-center gap-2">
      <div className={`relative flex-1 overflow-hidden rounded-full bg-ink/10 ${slim ? 'h-1' : 'h-1.5'}`}>
        <div className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700" style={{ width: `${value}%`, background: color || 'rgb(var(--accent))' }} />
      </div>
      {showLabel && <span className="w-9 text-right font-mono text-[11px] tabular-nums text-mute">{value}%</span>}
    </div>
  )
}

export function PriorityBadge({ level, compact }: { level?: number; compact?: boolean }) {
  const prios = useData((s) => s.settings.priorities)
  if (!level) return null
  const p = prios.find((x) => x.level === level)
  if (!p) return null
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-[1px] text-[10.5px] font-semibold uppercase tracking-[0.06em]" style={{ color: p.color, background: `${p.color}1a`, boxShadow: level >= 4 ? `0 0 12px -3px ${p.color}66` : undefined }}>
      <span className="text-[11px] leading-none">{p.glyph}</span>
      {!compact && p.label}
    </span>
  )
}

export function StatusPill({ status }: { status?: string }) {
  const statuses = useData((s) => s.settings.statuses)
  if (!status) return null
  const st = statuses.find((x) => x.id === status)
  if (!st) return null
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium" style={{ color: st.color }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: st.color }} />
      {st.label}
    </span>
  )
}

export function TypeGlyph({ e, size = 'md' }: { e: Pick<Entity, 'type' | 'icon' | 'color'>; size?: 'sm' | 'md' | 'lg' }) {
  const m = TYPE_META[e.type]
  const color = e.color || m.tint
  const s = size === 'sm' ? 'h-5 w-5 text-[11px] rounded-md' : size === 'lg' ? 'h-10 w-10 text-lg rounded-xl' : 'h-7 w-7 text-sm rounded-lg'
  return (
    <span className={`inline-flex shrink-0 items-center justify-center ${s}`} style={{ color, background: `${color}1f` }}>
      {e.icon || m.glyph}
    </span>
  )
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-3 h-10 w-10 rounded-full border border-dashed border-line" />
      <div className="text-sm font-medium">{title}</div>
      {hint && <div className="mt-1 max-w-xs text-xs text-mute">{hint}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-xl bg-ink/[0.06] p-0.5">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} className={`rounded-[10px] px-2.5 py-1 text-xs font-medium transition ${value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-mute hover:text-ink'}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} className={`relative h-6 w-10 shrink-0 rounded-full transition ${on ? 'bg-accent' : 'bg-ink/15'}`} aria-pressed={on}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  )
}

// Petit « i » : l'explication n'apparaît qu'à la demande (survol ou tap)
export function Info({ text, className = '' }: { text: ReactNode; className?: string }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const show = (el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    setPos({ x: Math.min(Math.max(r.left + r.width / 2, 130), innerWidth - 130), y: r.bottom + 8 })
  }
  useEffect(() => {
    if (!pos) return
    const close = () => setPos(null)
    window.addEventListener('scroll', close, true)
    window.addEventListener('pointerdown', close)
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('pointerdown', close) }
  }, [pos])
  return (
    <>
      <button
        type="button"
        aria-label="Info"
        className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-mute/40 align-middle font-serif text-[9.5px] italic leading-none text-mute transition hover:border-accent hover:text-accent ${className}`}
        onPointerEnter={(e) => e.pointerType === 'mouse' && show(e.currentTarget)}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setPos(null)}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); pos ? setPos(null) : show(e.currentTarget) }}
      >
        i
      </button>
      {pos && createPortal(
        <span className="fade pointer-events-none fixed z-[90] w-60 -translate-x-1/2 rounded-xl border border-line bg-surface px-3 py-2 text-left text-[12px] font-normal normal-case not-italic leading-snug tracking-normal text-ink/85 shadow-xl" style={{ left: pos.x, top: pos.y }}>
          {text}
        </span>,
        document.body
      )}
    </>
  )
}
