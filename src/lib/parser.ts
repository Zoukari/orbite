import { addDays, today, ymd, parseYmd } from './dates'
import type { Entity, EntityType } from './types'

// Analyseur de langage naturel 100 % local (aucune IA).
// "Demain appeler la banque pour Vagabox priorité haute"
//   → { date: demain, title: "Appeler la banque", projectId: Vagabox, priority: 4 }

export interface Parsed {
  title: string
  type: EntityType
  date?: string
  time?: string
  priority?: number
  projectId?: string
  projectTitle?: string
  tags: string[]
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const MONTHS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre']

export function parseCapture(input: string, entities: Entity[]): Parsed {
  let text = ' ' + input.trim() + ' '
  const out: Parsed = { title: '', type: 'task', tags: [] }
  const cut = (re: RegExp) => { text = text.replace(re, ' ') }

  // Type explicite
  const typeRules: [RegExp, EntityType][] = [
    [/\b(id[ée]e)\s*:/i, 'idea'], [/\bnote\s*:/i, 'note'], [/\bprojet\s*:/i, 'project'], [/\bobjectif\s*:/i, 'objective'], [/\bt[âa]che\s*:/i, 'task'], [/\bjalon\s*:/i, 'milestone']
  ]
  for (const [re, t] of typeRules) if (re.test(text)) { out.type = t; cut(re); break }

  // Tags #mot
  text = text.replace(/#([\p{L}\d_-]+)/gu, (_m, t) => { out.tags.push(t); return ' ' })

  // Priorité
  const n = norm(text)
  const prioRules: [RegExp, number][] = [
    [/\b(priorite\s+)?(critique|tres urgent|tres urgente)\b/, 5],
    [/\bpriorite\s+(haute|elevee|forte)\b|\burgent(e)?\b|\bepique\b|!!+/, 4],
    [/\bpriorite\s+(moyenne|normale)\b|\brare\b/, 3],
    [/\bpriorite\s+(basse|faible)\b/, 1]
  ]
  for (const [re, p] of prioRules) {
    const m = n.match(re)
    if (m) {
      out.priority = p
      const idx = n.indexOf(m[0])
      text = text.slice(0, idx) + ' ' + text.slice(idx + m[0].length)
      break
    }
  }

  // Dates relatives
  const t = today()
  const nn = () => norm(text)
  const dateRules: [RegExp, () => string][] = [
    [/\bapres[- ]demain\b/, () => addDays(t, 2)],
    [/\baujourd'?hui\b|\bce soir\b|\bce matin\b/, () => t],
    [/\bdemain\b/, () => addDays(t, 1)],
    [/\bsemaine prochaine\b/, () => addDays(t, 7)],
    [/\bmois prochain\b/, () => { const d = parseYmd(t); d.setMonth(d.getMonth() + 1); return ymd(d) }],
    [/\bdans (\d+) jours?\b/, () => addDays(t, Number(nn().match(/dans (\d+) jours?/)![1]))],
    [/\bdans (\d+) semaines?\b/, () => addDays(t, 7 * Number(nn().match(/dans (\d+) semaines?/)![1]))]
  ]
  for (const [re, fn] of dateRules) {
    const m = nn().match(re)
    if (m) {
      out.date = fn()
      removeNorm(m[0])
      break
    }
  }
  if (!out.date) {
    const m = nn().match(new RegExp(`\\b(?:le |ce |)?(${WEEKDAYS.join('|')})( prochain)?\\b`))
    if (m) {
      const target = WEEKDAYS.indexOf(m[1])
      let d = addDays(t, 1)
      while (parseYmd(d).getDay() !== target) d = addDays(d, 1)
      out.date = d
      removeNorm(m[0])
    }
  }
  if (!out.date) {
    const m = nn().match(new RegExp(`\\ble (\\d{1,2})(?:er)?(?: (${MONTHS.join('|')}))?\\b`))
    if (m) {
      const day = Number(m[1])
      const base = parseYmd(t)
      const month = m[2] ? MONTHS.indexOf(m[2]) : base.getMonth()
      let d = new Date(base.getFullYear(), month, day)
      if (ymd(d) < t) d = m[2] ? new Date(base.getFullYear() + 1, month, day) : new Date(base.getFullYear(), month + 1, day)
      out.date = ymd(d)
      removeNorm(m[0])
    }
  }
  if (!out.date) {
    const m = nn().match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/)
    if (m) {
      const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : parseYmd(t).getFullYear()
      out.date = ymd(new Date(y, Number(m[2]) - 1, Number(m[1])))
      removeNorm(m[0])
    }
  }
  // Heure
  const tm = nn().match(/\b(?:a )?(\d{1,2})\s?h\s?(\d{2})?\b/)
  if (tm) {
    out.time = `${tm[1].padStart(2, '0')}:${tm[2] || '00'}`
    removeNorm(tm[0])
  }

  // Projet : correspondance avec les projets existants (le plus long titre gagne)
  const candidates = entities
    .filter((e) => ['project', 'subproject', 'objective', 'category'].includes(e.type) && e.title && !e.archived)
    .sort((a, b) => b.title.length - a.title.length)
  for (const p of candidates) {
    const pt = norm(p.title)
    const re = new RegExp(`\\b(?:pour|sur|dans|projet|chez)?\\s*${escapeRe(pt)}\\b`)
    const m = nn().match(re)
    if (m) {
      out.projectId = p.id
      out.projectTitle = p.title
      // on retire "pour X" uniquement s'il est introduit par une préposition
      if (/^(pour|sur|dans|projet|chez)\s/.test(m[0].trim())) removeNorm(m[0])
      break
    }
  }

  const title = text.replace(/\s{2,}/g, ' ').replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '').trim()
  out.title = title ? title[0].toUpperCase() + title.slice(1) : input.trim()
  return out

  // supprime un fragment trouvé dans la version normalisée (mêmes positions, NFD retiré)
  function removeNorm(fragment: string) {
    const normalized = norm(text)
    const idx = normalized.indexOf(fragment)
    if (idx < 0) return
    // la normalisation conserve la longueur pour le français (accents décomposés puis retirés)
    const map = mapIndex(text)
    const start = map[idx] ?? idx
    const end = map[idx + fragment.length] ?? idx + fragment.length
    text = text.slice(0, start) + ' ' + text.slice(end)
  }
}

// table de correspondance index normalisé → index original
function mapIndex(orig: string) {
  const res: number[] = []
  for (let i = 0; i < orig.length; i++) {
    const n = norm(orig[i])
    for (let k = 0; k < n.length; k++) res.push(i)
  }
  res.push(orig.length)
  return res
}
function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
