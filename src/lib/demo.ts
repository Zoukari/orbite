import { useData } from './store'
import { addDays, today } from './dates'
import { layoutTree } from './layout'
import type { Entity, EntityType } from './types'

// Structure exemple : supprimable d'un clic (Réglages > Données).
export function seedDemo() {
  const s = useData.getState()
  const t = today()
  const map = s.create({ type: 'map', title: 'Ma vie', icon: '◎', favorite: true, meta: { demo: true } })
  const mk = (type: EntityType, title: string, parent: Entity | null, extra: Partial<Entity> = {}) =>
    s.create({ type, title, parentId: parent?.id ?? null, mapId: map.id, x: 0, y: 0, meta: { demo: true }, ...extra })

  const root = mk('vision', 'MA VIE', null, { description: "D'où je viens, où j'en suis, où je vais." })
  const business = mk('category', 'Business', root, { color: '#7aa7ff', icon: '💼' })
  const shakpot = mk('project', 'Shakpot', business, { status: 'doing', color: '#f2b45a', icon: '🍔', description: 'Marque French tacos / wraps.' })
  const shakCa = mk('objective', 'Ouvrir au Canada', shakpot, { status: 'doing', color: '#f2b45a', icon: '🇨🇦' })
  const local = mk('task', 'Recherche local', shakCa, { date: addDays(t, 5), priority: 3 })
  mk('milestone', 'Première branche ouverte', shakCa, { date: addDays(t, 300) })
  const comparer = mk('task', 'Comparer 5 locaux', local, { date: addDays(t, 9), priority: 2 })
  mk('task', 'Appeler propriétaire', comparer, { date: addDays(t, 12), priority: 2 })
  mk('note', 'Critères local', shakCa, { description: '## Critères\n- Passage piéton fort\n- Extraction possible\n- Bail ≤ 5 ans\n- [ ] Vérifier zonage' })
  const vagabox = mk('project', 'Vagabox', business, { status: 'doing', color: '#6fe0b8', icon: '📦' })
  const vMkt = mk('objective', '1 000 envois / mois', vagabox, { status: 'doing' })
  mk('task', 'Appeler banque Vagabox', vMkt, { date: t, priority: 4 })
  mk('idea', 'Programme ambassadeurs diaspora', vMkt)
  const klik = mk('project', 'KLIK', business, { status: 'waiting', color: '#a78bff', icon: '⌘' })
  mk('task', 'Relancer devis client', klik, { date: addDays(t, -2), priority: 3, postponed: 2, postponedFrom: addDays(t, -1) })

  const perso = mk('category', 'Personnel', root, { color: '#ffb3c7', icon: '♥' })
  const fin = mk('category', 'Finances', perso, { icon: '💰' })
  mk('expense', 'Budget mensuel', fin, { amount: 0 })
  const voyage = mk('project', 'Voyage', perso, { status: 'backlog', icon: '✈' })
  mk('task', 'Comparer billets', voyage, { horizon: 'someday' })
  const objPerso = mk('objective', 'Objectifs personnels', perso, { progressMode: 'manual', progress: 40 })
  mk('milestone', 'MBA terminé', objPerso, { status: 'done', done: true, date: addDays(t, -200) })

  const canada = mk('category', 'Canada', root, { color: '#ff9f9f', icon: '🇨🇦' })
  const immig = mk('project', 'Immigration', canada, { status: 'doing' })
  const visa = mk('objective', 'Obtenir le visa', immig, { status: 'doing' })
  mk('task', 'Rassembler documents', visa, { date: t, priority: 5 })
  mk('milestone', 'Visa obtenu', visa, { date: addDays(t, 240) })
  mk('project', 'Travail', canada, { status: 'backlog' })
  mk('project', 'Logement', canada, { status: 'backlog' })

  const obj2027 = mk('objective', 'Objectifs 2027', root, { deadline: addDays(t, 450), description: 'Ce que je veux avoir accompli fin 2027.', color: '#6fe0b8' })
  const voiture = mk('task', 'Acheter une voiture', obj2027, { date: addDays(t, 420), priority: 2 })

  // Connexions multiples : "Acheter une voiture" ↔ Canada, Finances
  s.addEdge(map.id, voiture.id, canada.id, 'linked')
  s.addEdge(map.id, voiture.id, fin.id, 'depends')
  s.addEdge(map.id, shakCa.id, obj2027.id, 'leads')
  s.update(voiture.id, { objectiveIds: [obj2027.id], linkedIds: [canada.id, fin.id] })
  s.update(shakCa.id, { objectiveIds: [obj2027.id] })

  // Tâches hors Map (le Task Manager reste indépendant)
  s.create({ type: 'task', title: 'Envoyer dossier assurance', date: addDays(t, 1), priority: 3, meta: { demo: true } })
  s.create({ type: 'task', title: 'Séance sport', date: t, recurrence: { kind: 'weekdays', days: [0, 1, 2, 3, 4, 6] }, priority: 2, meta: { demo: true } })
  s.create({ type: 'task', title: 'Appeler Jean-Pierre pour Shakpot', inbox: true, meta: { demo: true } })
  s.create({ type: 'note', title: 'Idées en vrac', description: 'Une note libre, reliable à plusieurs projets.\n\n- **Gras**, *italique*\n- [lien](https://vagabox.fr)\n- [ ] case à cocher', projectIds: [shakpot.id, vagabox.id], meta: { demo: true } })

  // Disposition
  const ents = useData.getState().entities
  const pos = layoutTree(ents, root.id, map.id)
  s.updateMany(Object.entries(pos).map(([id, p]) => ({ id, patch: p })))

  // Une seconde Map liée
  const map2 = s.create({ type: 'map', title: 'Shakpot Canada — plan', icon: '🇨🇦', meta: { demo: true } })
  const c2 = s.create({ type: 'vision', title: 'Shakpot Canada', mapId: map2.id, x: 0, y: 0, color: '#f2b45a', meta: { demo: true } })
  s.create({ type: 'ref', refId: shakCa.id, parentId: c2.id, mapId: map2.id, x: 300, y: -60, meta: { demo: true } })
  s.create({ type: 'maplink', title: 'Retour à Ma vie', targetMapId: map.id, parentId: c2.id, mapId: map2.id, x: 300, y: 60, meta: { demo: true } })
  s.create({ type: 'maplink', title: 'Plan détaillé Canada', targetMapId: map2.id, parentId: shakCa.id, mapId: map.id, x: (pos[shakCa.id]?.x ?? 0) + 300, y: (pos[shakCa.id]?.y ?? 0) + 180, meta: { demo: true } })

  s.setSettings({ activeMapId: map.id, onboarded: true, dailyTop: { date: t, ids: [] } })
  return map.id
}

export function createBlankMap(title = 'Ma vie') {
  const s = useData.getState()
  const map = s.create({ type: 'map', title, icon: '◎', favorite: true })
  s.create({ type: 'vision', title: title.toUpperCase(), mapId: map.id, x: 0, y: 0 })
  s.setSettings({ activeMapId: map.id, onboarded: true })
  return map.id
}

export function removeDemo() {
  const s = useData.getState()
  const ids = Object.values(s.entities).filter((e) => (e.meta as any)?.demo).map((e) => e.id)
  ids.forEach((id) => useData.getState().entities[id] && useData.getState().remove(id))
  const left = Object.values(useData.getState().entities).find((e) => e.type === 'map')
  useData.getState().setSettings({ activeMapId: left?.id })
  return ids.length
}
