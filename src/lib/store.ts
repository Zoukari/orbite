import { create } from 'zustand'
import { db, loadAll, SETTINGS_KEY } from './db'
import type { Edge, EdgeKind, Entity, EntityType, Settings, ViewId } from './types'
import { DEFAULT_PRIORITIES, DEFAULT_STATUSES } from './meta'
import { addDays, nextOccurrence, today } from './dates'

export const uid = () =>
  (globalThis.crypto && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36))
const now = () => new Date().toISOString()

export const defaultSettings = (): Settings => ({
  theme: 'dark',
  animations: true,
  showQuotes: true,
  favoriteQuotes: [],
  hiddenQuotes: [],
  priorities: DEFAULT_PRIORITIES,
  statuses: DEFAULT_STATUSES,
  dailyTop: { date: today(), ids: [] },
  lastBackupAt: null,
  lastSyncAt: null,
  onboarded: false,
  recents: [],
  rightPanel: true
})

type Listener = () => void
const changeListeners = new Set<Listener>()
export const onLocalChange = (fn: Listener) => {
  changeListeners.add(fn)
  return () => changeListeners.delete(fn)
}
const emitChange = () => changeListeners.forEach((f) => f())
let initOnce: Promise<void> | null = null

interface DataState {
  ready: boolean
  entities: Record<string, Entity>
  edges: Record<string, Edge>
  settings: Settings
  rev: number // incrémenté à chaque modification (pour mémos)

  init(): Promise<void>
  reload(): Promise<void>
  create(p: Partial<Entity> & { type: EntityType }): Entity
  update(id: string, patch: Partial<Entity>, event?: { action: string; detail?: string }): void
  updateMany(patches: { id: string; patch: Partial<Entity> }[]): void
  remove(id: string): void
  archive(id: string, archived?: boolean): void
  duplicate(id: string): string | null
  toggleDone(id: string): void
  moveUnder(id: string, parentId: string | null, mapId?: string | null): void
  addRef(targetId: string, parentId: string | null, mapId: string, pos?: { x: number; y: number }): Entity
  link(a: string, b: string): void
  addEdge(mapId: string, source: string, target: string, kind: EdgeKind): void
  updateEdge(id: string, patch: Partial<Edge>): void
  removeEdge(id: string): void
  setSettings(patch: Partial<Settings>): void
  touchRecent(id: string): void
  rollover(): number
  wipe(): Promise<void>
}

function persistEntities(list: Entity[]) {
  db.entities.bulkPut(list.map((e) => ({ ...e, _dirty: 1 as const }))).then(emitChange)
}
function persistEdges(list: Edge[]) {
  db.edges.bulkPut(list.map((e) => ({ ...e, _dirty: 1 as const }))).then(emitChange)
}
function persistSettings(s: Settings) {
  db.kv.put({ key: SETTINGS_KEY, value: s, updatedAt: now(), _dirty: 1 }).then(emitChange)
}

export const useData = create<DataState>((set, get) => ({
  ready: false,
  entities: {},
  edges: {},
  settings: defaultSettings(),
  rev: 0,

  async init() {
    if (initOnce) return initOnce
    initOnce = (async () => {
    await get().reload()
    // rattrapage : les tâches liées à un projet de la map mais absentes de la map y sont placées
    {
      const ents = get().entities
      const patches: { id: string; patch: Partial<Entity> }[] = []
      const tmp = { ...ents }
      for (const e of Object.values(ents)) {
        const a = mapAnchor(tmp, e)
        if (!a) continue
        const pos = placeChild(tmp, a)
        const patch = { parentId: a.id, mapId: a.mapId, ...pos }
        tmp[e.id] = { ...e, ...patch }
        patches.push({ id: e.id, patch })
      }
      if (patches.length) get().updateMany(patches)
      if (get().settings.theme !== 'dark') get().setSettings({ theme: 'dark' })
    }
    const n = get().rollover()
    if (n) console.info(`[orbite] ${n} tâche(s) reportée(s)`)
    set({ ready: true })
    })()
    return initOnce
  },

  async reload() {
    const { entities, edges, settings } = await loadAll()
    const em: Record<string, Entity> = {}
    for (const e of entities) if (!e.deleted) { const { _dirty, ...rest } = e as any; em[e.id] = rest }
    const ed: Record<string, Edge> = {}
    for (const e of edges) if (!e.deleted) { const { _dirty, ...rest } = e as any; ed[e.id] = rest }
    const s = { ...defaultSettings(), ...(settings || {}) }
    set({ entities: em, edges: ed, settings: s, rev: get().rev + 1 })
  },

  create(p) {
    const t = now()
    const e: Entity = {
      id: uid(),
      title: '',
      createdAt: t,
      updatedAt: t,
      history: [{ at: t, action: 'created' }],
      ...p
    } as Entity
    if (e.type === 'task' && !e.status) e.status = 'todo'
    if ((e.type === 'project' || e.type === 'subproject') && !e.status) e.status = 'todo'
    if ((e.type === 'project' || e.type === 'subproject' || e.type === 'objective') && !e.progressMode) e.progressMode = 'auto'
    // une tâche / un jalon / un objectif rattaché à un élément de la map apparaît sur la map, sous lui
    const anchor = mapAnchor(get().entities, e)
    if (anchor) Object.assign(e, { parentId: anchor.id, mapId: anchor.mapId, ...placeChild(get().entities, anchor) })
    set((s) => ({ entities: { ...s.entities, [e.id]: e }, rev: s.rev + 1 }))
    persistEntities([e])
    return e
  },

  update(id, patch, event) {
    const prev = get().entities[id]
    if (!prev) return
    const t = now()
    const history = [...(prev.history || [])]
    if (patch.status && patch.status !== prev.status) history.push({ at: t, action: 'status', detail: patch.status })
    if (event) history.push({ at: t, ...event })
    const next: Entity = { ...prev, ...patch, history: history.slice(-80), updatedAt: t }
    set((s) => ({ entities: { ...s.entities, [id]: next }, rev: s.rev + 1 }))
    persistEntities([next])
  },

  updateMany(patches) {
    const t = now()
    const ents = { ...get().entities }
    const changed: Entity[] = []
    for (const { id, patch } of patches) {
      if (!ents[id]) continue
      ents[id] = { ...ents[id], ...patch, updatedAt: t }
      changed.push(ents[id])
    }
    set((s) => ({ entities: ents, rev: s.rev + 1 }))
    persistEntities(changed)
  },

  remove(id) {
    const s = get()
    const ids = new Set([id, ...descendants(s.entities, id)])
    // les références pointant vers une entité supprimée disparaissent aussi
    for (const e of Object.values(s.entities)) if (e.type === 'ref' && e.refId && ids.has(e.refId)) ids.add(e.id)
    const t = now()
    const ents = { ...s.entities }
    const dead: Entity[] = []
    ids.forEach((i) => {
      if (!ents[i]) return
      dead.push({ ...ents[i], deleted: true, updatedAt: t })
      delete ents[i]
    })
    // nettoyage des liens
    for (const e of Object.values(ents)) {
      if (e.linkedIds?.some((l) => ids.has(l)) || e.projectIds?.some((l) => ids.has(l))) {
        ents[e.id] = { ...e, linkedIds: e.linkedIds?.filter((l) => !ids.has(l)), projectIds: e.projectIds?.filter((l) => !ids.has(l)), updatedAt: t }
        dead.push(ents[e.id])
      }
    }
    const edges = { ...s.edges }
    const deadEdges: Edge[] = []
    for (const ed of Object.values(edges)) {
      if (ids.has(ed.source) || ids.has(ed.target)) {
        deadEdges.push({ ...ed, deleted: true, updatedAt: t })
        delete edges[ed.id]
      }
    }
    const top = s.settings.dailyTop
    set((st) => ({ entities: ents, edges, rev: st.rev + 1 }))
    if (top.ids.some((i) => ids.has(i))) get().setSettings({ dailyTop: { ...top, ids: top.ids.filter((i) => !ids.has(i)) } })
    persistEntities(dead)
    if (deadEdges.length) persistEdges(deadEdges)
  },

  archive(id, archived = true) {
    get().update(id, { archived }, { action: archived ? 'archived' : 'unarchived' })
  },

  duplicate(id) {
    const s = get()
    const src = s.entities[id]
    if (!src) return null
    const map = new Map<string, string>()
    const subtree = [id, ...descendants(s.entities, id)]
    subtree.forEach((i) => map.set(i, uid()))
    const t = now()
    const copies: Entity[] = subtree.map((i) => {
      const e = s.entities[i]
      return {
        ...e,
        id: map.get(i)!,
        title: i === id ? `${e.title} (copie)` : e.title,
        parentId: i === id ? e.parentId : map.get(e.parentId!) ?? e.parentId,
        x: (e.x ?? 0) + 60,
        y: (e.y ?? 0) + 60,
        favorite: false,
        createdAt: t,
        updatedAt: t,
        history: [{ at: t, action: 'created', detail: 'dupliqué' }]
      }
    })
    const ents = { ...s.entities }
    copies.forEach((c) => (ents[c.id] = c))
    set((st) => ({ entities: ents, rev: st.rev + 1 }))
    persistEntities(copies)
    return map.get(id)!
  },

  toggleDone(id) {
    const e = get().entities[id]
    if (!e) return
    const t = today()
    if (!e.done && e.recurrence) {
      // tâche récurrente : on journalise et on avance à la prochaine occurrence
      const base = e.date && e.date > t ? e.date : t
      get().update(id, { date: nextOccurrence(e.recurrence, base), postponed: 0, postponedFrom: null, checklist: e.checklist?.map((c) => ({ ...c, done: false })) }, { action: 'done', detail: 'occurrence' })
      return
    }
    const done = !e.done
    get().update(
      id,
      { done, doneAt: done ? new Date().toISOString() : null, status: done ? 'done' : e.status === 'done' ? 'todo' : e.status },
      { action: done ? 'done' : 'reopened' }
    )
  },

  moveUnder(id, parentId, mapId) {
    const s = get()
    const e = s.entities[id]
    if (!e) return
    if (parentId && (parentId === id || descendants(s.entities, id).includes(parentId))) return
    const parent = parentId ? s.entities[parentId] : null
    const targetMap = mapId ?? parent?.mapId ?? e.mapId ?? null
    const pos = parent ? placeChild(s.entities, parent) : { x: e.x ?? 0, y: e.y ?? 0 }
    const patch: Partial<Entity> = { parentId, mapId: targetMap, inbox: false }
    if (targetMap !== e.mapId || parentId !== e.parentId) Object.assign(patch, pos)
    // déplacer aussi les descendants vers la même map
    const desc = descendants(s.entities, id)
    get().update(id, patch, { action: 'moved', detail: parent?.title || 'racine' })
    if (desc.length && targetMap !== e.mapId) {
      const dx = (patch.x ?? e.x ?? 0) - (e.x ?? 0)
      const dy = (patch.y ?? e.y ?? 0) - (e.y ?? 0)
      get().updateMany(desc.map((d) => ({ id: d, patch: { mapId: targetMap, x: (s.entities[d].x ?? 0) + dx, y: (s.entities[d].y ?? 0) + dy } })))
    }
  },

  addRef(targetId, parentId, mapId, pos) {
    const s = get()
    const parent = parentId ? s.entities[parentId] : null
    const p = pos ?? (parent ? placeChild(s.entities, parent) : { x: 0, y: 0 })
    return get().create({ type: 'ref', refId: targetId, title: '', parentId, mapId, ...p })
  },

  link(a, b) {
    if (a === b) return
    const s = get()
    const ea = s.entities[a]
    const eb = s.entities[b]
    if (!ea || !eb) return
    const isProj = (x: Entity) => x.type === 'project' || x.type === 'subproject'
    const isObj = (x: Entity) => x.type === 'objective'
    const patch: Partial<Entity> = {}
    if (isProj(eb)) patch.projectIds = uniq([...(ea.projectIds || []), b])
    else if (isObj(eb)) patch.objectiveIds = uniq([...(ea.objectiveIds || []), b])
    else patch.linkedIds = uniq([...(ea.linkedIds || []), b])
    get().update(a, patch, { action: 'linked', detail: eb.title })
  },

  addEdge(mapId, source, target, kind) {
    if (source === target) return
    const exists = Object.values(get().edges).find((e) => e.source === source && e.target === target && e.kind === kind)
    if (exists) return
    const e: Edge = { id: uid(), mapId, source, target, kind, updatedAt: now() }
    set((s) => ({ edges: { ...s.edges, [e.id]: e }, rev: s.rev + 1 }))
    persistEdges([e])
  },

  updateEdge(id, patch) {
    const e = get().edges[id]
    if (!e) return
    const next = { ...e, ...patch, updatedAt: now() }
    set((s) => ({ edges: { ...s.edges, [id]: next }, rev: s.rev + 1 }))
    persistEdges([next])
  },

  removeEdge(id) {
    const e = get().edges[id]
    if (!e) return
    const edges = { ...get().edges }
    delete edges[id]
    set((s) => ({ edges, rev: s.rev + 1 }))
    persistEdges([{ ...e, deleted: true, updatedAt: now() }])
  },

  setSettings(patch) {
    const next = { ...get().settings, ...patch }
    set({ settings: next })
    persistSettings(next)
    if (patch.theme) {
      document.documentElement.classList.toggle('dark', patch.theme !== 'light')
      try { localStorage.setItem('orbite.theme', JSON.stringify(patch.theme)) } catch {}
    }
  },

  touchRecent(id) {
    const r = get().settings.recents.filter((x) => x !== id)
    get().setSettings({ recents: [id, ...r].slice(0, 12) })
  },

  // Report automatique : toute tâche non terminée prévue avant aujourd'hui passe à aujourd'hui
  rollover() {
    const t = today()
    const s = get()
    const patches: { id: string; patch: Partial<Entity> }[] = []
    for (const e of Object.values(s.entities)) {
      if (e.type !== 'task' || e.done || e.archived || !e.date || e.date >= t) continue
      const history = [...(e.history || []), { at: new Date().toISOString(), action: 'postponed', detail: `${e.date} → ${t}` }]
      patches.push({ id: e.id, patch: { date: t, postponed: (e.postponed || 0) + 1, postponedFrom: e.date, history: history.slice(-80) } })
    }
    if (patches.length) get().updateMany(patches)
    if (s.settings.dailyTop.date !== t) {
      // les priorités non terminées d'hier sont proposées à nouveau
      const keep = s.settings.dailyTop.ids.filter((i) => s.entities[i] && !s.entities[i].done)
      get().setSettings({ dailyTop: { date: t, ids: keep }, lastRolloverDate: t })
    }
    return patches.length
  },

  async wipe() {
    await db.transaction('rw', db.entities, db.edges, async () => {
      const t = now()
      const ents = await db.entities.toArray()
      const eds = await db.edges.toArray()
      await db.entities.bulkPut(ents.map((e) => ({ ...e, deleted: true, updatedAt: t, _dirty: 1 as const })))
      await db.edges.bulkPut(eds.map((e) => ({ ...e, deleted: true, updatedAt: t, _dirty: 1 as const })))
    })
    set((s) => ({ entities: {}, edges: {}, rev: s.rev + 1 }))
    get().setSettings({ dailyTop: { date: today(), ids: [] }, recents: [], activeMapId: undefined })
    emitChange()
  }
}))

// ───────── helpers relationnels ─────────

export const uniq = <T,>(a: T[]) => Array.from(new Set(a))

// Élément de la map auquel rattacher une entité qui n'y est pas encore
export function mapAnchor(ents: Record<string, Entity>, e: Entity): Entity | null {
  if (e.mapId || e.parentId || e.archived || e.deleted || e.inbox) return null
  if (!['task', 'milestone', 'objective'].includes(e.type)) return null
  for (const id of [...(e.objectiveIds || []), ...(e.projectIds || [])]) {
    const a = ents[id]
    if (a && a.mapId && !a.archived) return a
  }
  return null
}

export function childrenOf(ents: Record<string, Entity>, id: string) {
  const out: Entity[] = []
  for (const e of Object.values(ents)) if (e.parentId === id && !e.archived) out.push(e)
  return out
}

export function descendants(ents: Record<string, Entity>, id: string): string[] {
  const byParent = new Map<string, string[]>()
  for (const e of Object.values(ents)) {
    if (!e.parentId) continue
    const arr = byParent.get(e.parentId) || []
    arr.push(e.id)
    byParent.set(e.parentId, arr)
  }
  const out: string[] = []
  const stack = [...(byParent.get(id) || [])]
  while (stack.length) {
    const c = stack.pop()!
    out.push(c)
    stack.push(...(byParent.get(c) || []))
  }
  return out
}

export function ancestors(ents: Record<string, Entity>, id: string): Entity[] {
  const out: Entity[] = []
  let cur = ents[id]
  const seen = new Set<string>()
  while (cur?.parentId && ents[cur.parentId] && !seen.has(cur.parentId)) {
    seen.add(cur.parentId)
    cur = ents[cur.parentId]
    out.unshift(cur)
  }
  return out
}

export function pathLabel(ents: Record<string, Entity>, id: string) {
  return ancestors(ents, id).map((a) => displayTitle(ents, a)).join(' › ')
}

// Une référence affiche toujours le contenu de sa cible (pas de duplication)
export function resolve(ents: Record<string, Entity>, e: Entity): Entity {
  if (e.type === 'ref' && e.refId && ents[e.refId]) return ents[e.refId]
  return e
}
export function displayTitle(ents: Record<string, Entity>, e: Entity) {
  if (e.type === 'ref') return ents[e.refId!]?.title || 'Référence perdue'
  if (e.type === 'map') return e.title || 'Map sans titre'
  return e.title || 'Sans titre'
}

export function placeChild(ents: Record<string, Entity>, parent: Entity) {
  const kids = childrenOf(ents, parent.id).filter((k) => k.mapId === parent.mapId)
  const px = parent.x ?? 0
  const py = parent.y ?? 0
  const n = kids.length
  // les enfants s'étalent vers la droite, en éventail
  return { x: px + 300, y: py + (n % 2 ? 1 : -1) * Math.ceil(n / 2) * 92 }
}

// Tâches rattachées à une entité (descendants + liens explicites)
export function relatedTasks(ents: Record<string, Entity>, id: string): Entity[] {
  const desc = new Set(descendants(ents, id))
  const out: Entity[] = []
  for (const e of Object.values(ents)) {
    if (e.type !== 'task' || e.archived) continue
    if (desc.has(e.id) || e.projectIds?.includes(id) || e.objectiveIds?.includes(id) || e.linkedIds?.includes(id)) out.push(e)
    else if (e.type === 'task' && desc.size) {
      // tâche placée via une référence dans la branche
    }
  }
  for (const d of desc) {
    const r = ents[d]
    if (r?.type === 'ref' && r.refId && ents[r.refId]?.type === 'task' && !out.includes(ents[r.refId])) out.push(ents[r.refId])
  }
  return out
}

export function relationCounts(ents: Record<string, Entity>, id: string) {
  const desc = new Set(descendants(ents, id))
  const c = { tasks: 0, objectives: 0, notes: 0, documents: 0, milestones: 0, projects: 0 }
  const seen = new Set<string>()
  const add = (e: Entity) => {
    if (seen.has(e.id) || e.archived) return
    seen.add(e.id)
    if (e.type === 'task') c.tasks++
    else if (e.type === 'objective') c.objectives++
    else if (e.type === 'note' || e.type === 'idea' || e.type === 'text' || e.type === 'checklist') c.notes++
    else if (e.type === 'document' || e.type === 'link' || e.type === 'image') c.documents++
    else if (e.type === 'milestone') c.milestones++
    else if (e.type === 'project' || e.type === 'subproject') c.projects++
  }
  const self = ents[id]
  for (const e of Object.values(ents)) {
    if (e.id === id) continue
    const r = resolve(ents, e)
    if (desc.has(e.id) || e.linkedIds?.includes(id) || e.projectIds?.includes(id) || e.objectiveIds?.includes(id)) add(r)
  }
  for (const l of [...(self?.linkedIds || []), ...(self?.objectiveIds || []), ...(self?.projectIds || [])]) if (ents[l]) add(ents[l])
  return c
}

export function relatedEntities(ents: Record<string, Entity>, id: string, kind: keyof ReturnType<typeof relationCounts>) {
  const desc = new Set(descendants(ents, id))
  const self = ents[id]
  const match = (e: Entity) => {
    switch (kind) {
      case 'tasks': return e.type === 'task'
      case 'objectives': return e.type === 'objective'
      case 'notes': return ['note', 'idea', 'text', 'checklist'].includes(e.type)
      case 'documents': return ['document', 'link', 'image'].includes(e.type)
      case 'milestones': return e.type === 'milestone'
      case 'projects': return e.type === 'project' || e.type === 'subproject'
    }
  }
  const out = new Map<string, Entity>()
  for (const e of Object.values(ents)) {
    if (e.id === id || e.archived) continue
    const r = resolve(ents, e)
    if ((desc.has(e.id) || e.linkedIds?.includes(id) || e.projectIds?.includes(id) || e.objectiveIds?.includes(id)) && match(r)) out.set(r.id, r)
  }
  for (const l of [...(self?.linkedIds || []), ...(self?.objectiveIds || []), ...(self?.projectIds || [])]) if (ents[l] && match(ents[l])) out.set(l, ents[l])
  return [...out.values()]
}

export function progressOf(ents: Record<string, Entity>, e: Entity): number | null {
  if (e.progressMode === 'manual') return Math.round(e.progress ?? 0)
  if (e.type === 'task') return e.done ? 100 : e.checklist?.length ? Math.round((e.checklist.filter((c) => c.done).length / e.checklist.length) * 100) : null
  if (e.type === 'checklist') return e.checklist?.length ? Math.round((e.checklist.filter((c) => c.done).length / e.checklist.length) * 100) : null
  if (!['project', 'subproject', 'objective', 'category', 'vision'].includes(e.type)) return null
  const tasks = relatedTasks(ents, e.id)
  if (!tasks.length) return e.status === 'done' ? 100 : null
  return Math.round((tasks.filter((t) => t.done).length / tasks.length) * 100)
}

export function urgentCount(ents: Record<string, Entity>, id: string) {
  const t = today()
  return relatedTasks(ents, id).filter((x) => !x.done && ((x.priority ?? 0) >= 4 || (x.deadline && x.deadline <= addDays(t, 2)))).length
}

export function isNoteLike(e: Entity) {
  return ['note', 'idea', 'text', 'checklist', 'document', 'link'].includes(e.type)
}

// ───────── état UI ─────────

export type AddToMode = 'link' | 'move' | 'ref' | 'task' | 'pickParent'

interface UIState {
  view: ViewId
  detailId: string | null
  addTo: { sourceId: string; mode: AddToMode; onPick?: (id: string) => void } | null
  menu: { id: string; x: number; y: number } | null
  palette: boolean
  paletteQuery: string
  capture: { open: boolean; type?: EntityType; text?: string; voice?: boolean } | null
  focusId: string | null
  connectFrom: string | null
  editingId: string | null
  dropAsk: { entityId: string; target: 'map' | 'tasks' | 'notes'; pos?: { x: number; y: number } } | null
  toast: string | null
  linkFilter: { id: string; kind: string } | null
  share: string | null
  set(p: Partial<UIState>): void
  go(v: ViewId): void
  open(id: string): void
  notify(msg: string): void
}

export const useUI = create<UIState>((set) => ({
  view: 'map',
  detailId: null,
  addTo: null,
  menu: null,
  palette: false,
  paletteQuery: '',
  capture: null,
  focusId: null,
  connectFrom: null,
  editingId: null,
  dropAsk: null,
  toast: null,
  linkFilter: null,
  share: null,
  set: (p) => set(p),
  go: (view) => set({ view, menu: null }),
  open: (id) => {
    set({ detailId: id, menu: null })
    useData.getState().touchRecent(id)
  },
  notify: (toast) => {
    set({ toast })
    setTimeout(() => set((s) => (s.toast === toast ? { toast: null } : {})), 2600)
  }
}))
