import type { Entity } from './types'
import { addDays, diffDays, horizonOf, today } from './dates'
import { progressOf } from './store'

// ─────────────────────────────────────────────────────────────
// Command Center : moteur de règles local, sans LLM.
// Chaque commande = des mots-clés + une requête sur les données.
// Un module IA pourra plus tard s'ajouter comme une "commande" de plus
// (voir src/lib/ai.ts).
// ─────────────────────────────────────────────────────────────

export interface CommandResult {
  title: string
  empty: string
  items: Entity[]
  meta?: (e: Entity) => string
}

interface Command {
  id: string
  label: string
  keywords: string[]
  run(ents: Record<string, Entity>): CommandResult
}

const active = (ents: Record<string, Entity>) => Object.values(ents).filter((e) => !e.archived)
const openTasks = (ents: Record<string, Entity>) => active(ents).filter((e) => e.type === 'task' && !e.done)
const byPrio = (a: Entity, b: Entity) => (b.priority ?? 0) - (a.priority ?? 0) || (a.date || '9').localeCompare(b.date || '9')

export const COMMANDS: Command[] = [
  {
    id: 'urgent',
    label: "Qu'est-ce que j'ai d'urgent ?",
    keywords: ['urgent', 'urgence', 'critique', 'presse'],
    run: (ents) => {
      const lim = addDays(today(), 2)
      return {
        title: 'Urgent',
        empty: "Rien d'urgent. Profite-en pour avancer sur le long terme.",
        items: openTasks(ents).filter((t) => (t.priority ?? 0) >= 4 || (t.deadline && t.deadline <= lim) || horizonOf(t) === 'overdue').sort(byPrio)
      }
    }
  },
  {
    id: 'today',
    label: 'Que dois-je faire aujourd’hui ?',
    keywords: ['aujourd', 'faire', 'today', 'journee', 'jour'],
    run: (ents) => ({
      title: "Aujourd'hui",
      empty: 'Aucune tâche prévue aujourd’hui.',
      items: openTasks(ents).filter((t) => ['today', 'overdue'].includes(horizonOf(t))).sort(byPrio)
    })
  },
  {
    id: 'overdue',
    label: 'Quelles tâches sont en retard ?',
    keywords: ['retard', 'reportee', 'en retard', 'overdue'],
    run: (ents) => ({
      title: 'En retard / reportées',
      empty: 'Aucun retard.',
      items: openTasks(ents).filter((t) => (t.postponed ?? 0) > 0 || horizonOf(t) === 'overdue' || (t.deadline && t.deadline < today())).sort(byPrio),
      meta: (t) => (t.postponed ? `Reportée ${t.postponed}×` : '')
    })
  },
  {
    id: 'blocked',
    label: 'Quels projets sont bloqués ?',
    keywords: ['bloque', 'bloques', 'blocage', 'attente'],
    run: (ents) => ({
      title: 'Bloqué / en attente',
      empty: 'Aucun projet bloqué.',
      items: active(ents).filter((e) => e.status === 'blocked' || e.status === 'waiting'),
      meta: (e) => (e.status === 'blocked' ? 'Bloqué' : 'En attente')
    })
  },
  {
    id: 'slow',
    label: 'Quels objectifs avancent le moins ?',
    keywords: ['objectif', 'avance', 'moins', 'progression', 'lent'],
    run: (ents) => {
      const objs = active(ents).filter((e) => e.type === 'objective' && e.status !== 'done')
      return {
        title: 'Objectifs les moins avancés',
        empty: 'Aucun objectif en cours.',
        items: objs.sort((a, b) => (progressOf(ents, a) ?? 0) - (progressOf(ents, b) ?? 0)),
        meta: (e) => `${progressOf(ents, e) ?? 0} %`
      }
    }
  },
  {
    id: 'procrastinated',
    label: 'Qu’ai-je reporté plusieurs fois ?',
    keywords: ['reporte', 'plusieurs', 'repousse', 'procrastin'],
    run: (ents) => ({
      title: 'Reporté plusieurs fois',
      empty: 'Rien de repoussé en boucle. Bien.',
      items: openTasks(ents).filter((t) => (t.postponed ?? 0) >= 2).sort((a, b) => (b.postponed ?? 0) - (a.postponed ?? 0)),
      meta: (t) => `Reportée ${t.postponed}×`
    })
  },
  {
    id: 'week',
    label: 'Que reste-t-il cette semaine ?',
    keywords: ['semaine', 'week', '7 jours'],
    run: (ents) => {
      const t = today()
      return {
        title: '7 prochains jours',
        empty: 'Semaine dégagée.',
        items: openTasks(ents).filter((x) => x.date && diffDays(x.date, t) >= 0 && diffDays(x.date, t) <= 7).sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      }
    }
  },
  {
    id: 'inbox',
    label: 'Qu’y a-t-il dans l’Inbox ?',
    keywords: ['inbox', 'trier', 'organiser', 'capture'],
    run: (ents) => ({ title: 'Inbox', empty: 'Inbox vide.', items: active(ents).filter((e) => e.inbox) })
  },
  {
    id: 'done',
    label: 'Qu’ai-je terminé récemment ?',
    keywords: ['termine', 'fini', 'accompli', 'fait', 'bilan'],
    run: (ents) => ({
      title: 'Terminé (14 derniers jours)',
      empty: 'Rien de terminé récemment.',
      items: active(ents)
        .filter((e) => e.done && e.doneAt && Date.now() - new Date(e.doneAt).getTime() < 14 * 86400000)
        .sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''))
    })
  },
  {
    id: 'doing',
    label: 'Quels projets sont en cours ?',
    keywords: ['en cours', 'projets', 'actifs'],
    run: (ents) => ({
      title: 'Projets en cours',
      empty: 'Aucun projet en cours.',
      items: active(ents).filter((e) => (e.type === 'project' || e.type === 'subproject') && e.status === 'doing'),
      meta: (e) => `${progressOf(ents, e) ?? 0} %`
    })
  }
]

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function matchCommand(q: string): Command | null {
  const n = norm(q)
  if (n.length < 3) return null
  let best: { c: Command; score: number } | null = null
  for (const c of COMMANDS) {
    let score = 0
    for (const k of c.keywords) if (n.includes(k)) score += k.length
    if (norm(c.label).startsWith(n)) score += 20
    if (score && (!best || score > best.score)) best = { c, score }
  }
  return best?.c ?? null
}
