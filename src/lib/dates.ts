import type { Entity, Recurrence } from './types'

const pad = (n: number) => String(n).padStart(2, '0')

export function ymd(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
export function today() {
  return ymd(new Date())
}
export function parseYmd(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export function addDays(s: string, n: number) {
  const d = parseYmd(s)
  d.setDate(d.getDate() + n)
  return ymd(d)
}
export function diffDays(a: string, b: string) {
  return Math.round((parseYmd(a).getTime() - parseYmd(b).getTime()) / 86400000)
}

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const DAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']
export const DAY_NAMES = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

export function fmtDay(s?: string | null) {
  if (!s) return ''
  const t = today()
  const dd = diffDays(s, t)
  if (dd === 0) return "Aujourd'hui"
  if (dd === 1) return 'Demain'
  if (dd === -1) return 'Hier'
  const d = parseYmd(s)
  const base = `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
  return d.getFullYear() !== new Date().getFullYear() ? `${base} ${d.getFullYear()}` : base
}

export function fmtRelative(iso?: string | null) {
  if (!iso) return 'jamais'
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.round(ms / 60000)
  if (m < 1) return "à l'instant"
  if (m < 60) return `il y a ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `il y a ${h} h`
  const d = Math.round(h / 24)
  if (d < 30) return `il y a ${d} j`
  return new Date(iso).toLocaleDateString('fr-FR')
}

export type HorizonKey = 'overdue' | 'today' | 'short' | 'medium' | 'long' | 'someday' | 'inbox' | 'done'

export const HORIZONS: { key: HorizonKey; label: string; hint?: string }[] = [
  { key: 'overdue', label: 'En retard' },
  { key: 'today', label: "Aujourd'hui" },
  { key: 'short', label: 'Court terme', hint: '1 à 30 jours' },
  { key: 'medium', label: 'Moyen terme', hint: '1 mois à 1 an' },
  { key: 'long', label: 'Long terme', hint: 'au-delà d’un an' },
  { key: 'someday', label: 'Un jour / Peut-être' },
  { key: 'inbox', label: 'Inbox', hint: 'à organiser' }
]

export function horizonOf(t: Entity, now = today()): HorizonKey {
  if (t.done) return 'done'
  if (t.horizon === 'someday') return 'someday'
  const when = t.date || t.deadline
  if (!when) return t.inbox ? 'inbox' : 'someday'
  const dd = diffDays(when, now)
  if (dd < 0) return 'overdue'
  if (dd === 0) return 'today'
  if (dd <= 30) return 'short'
  if (dd <= 365) return 'medium'
  return 'long'
}

// Prochaine occurrence d'une tâche récurrente, strictement après `from`
export function nextOccurrence(r: Recurrence, from: string): string {
  switch (r.kind) {
    case 'daily':
      return addDays(from, 1)
    case 'every':
      return addDays(from, Math.max(1, r.interval || 1))
    case 'weekly':
      return addDays(from, 7 * Math.max(1, r.interval || 1))
    case 'monthly': {
      const d = parseYmd(from)
      d.setMonth(d.getMonth() + Math.max(1, r.interval || 1))
      return ymd(d)
    }
    case 'weekdays': {
      const days = r.days?.length ? r.days : [1, 2, 3, 4, 5]
      let s = from
      for (let i = 0; i < 8; i++) {
        s = addDays(s, 1)
        if (days.includes(parseYmd(s).getDay())) return s
      }
      return addDays(from, 1)
    }
  }
}

export function recurrenceLabel(r?: Recurrence | null) {
  if (!r) return ''
  switch (r.kind) {
    case 'daily': return 'Tous les jours'
    case 'weekly': return r.interval && r.interval > 1 ? `Toutes les ${r.interval} semaines` : 'Chaque semaine'
    case 'monthly': return r.interval && r.interval > 1 ? `Tous les ${r.interval} mois` : 'Chaque mois'
    case 'every': return `Tous les ${r.interval || 1} jours`
    case 'weekdays': return (r.days?.length ? r.days : [1, 2, 3, 4, 5]).map((d) => DAY_NAMES[d]).join(' · ')
  }
}
