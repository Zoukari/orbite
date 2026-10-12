// ─────────────────────────────────────────────────────────────
// Modèle de données unifié : TOUT est une Entity.
// Map, projet, tâche, note, objectif… partagent la même forme,
// ce qui permet de relier n'importe quoi à n'importe quoi.
// ─────────────────────────────────────────────────────────────

export type EntityType =
  | 'map' // une Mind Map (conteneur)
  | 'category'
  | 'vision'
  | 'project'
  | 'subproject'
  | 'objective'
  | 'task'
  | 'idea'
  | 'note'
  | 'text'
  | 'checklist'
  | 'link'
  | 'image'
  | 'document'
  | 'person'
  | 'expense'
  | 'milestone'
  | 'maplink' // nœud qui ouvre une autre Map
  | 'ref' // référence vers une autre entité (pas de duplication)

export type EdgeKind = 'linked' | 'depends' | 'leads' | 'reference' | 'parent'

export interface HistoryEvent {
  at: string
  action: string // created, status, done, postponed, moved, …
  detail?: string
}

export interface Comment {
  id: string
  at: string
  text: string
}

export interface ChecklistItem {
  id: string
  text: string
  done: boolean
}

export interface Recurrence {
  kind: 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'every'
  days?: number[] // 0=dim … 6=sam (pour weekdays)
  interval?: number // pour 'every' (tous les N jours)
}

export type Horizon = 'auto' | 'someday'

export interface Entity {
  id: string
  type: EntityType
  title: string
  description?: string // markdown
  // Placement Mind Map (optionnel : une tâche peut vivre hors map)
  mapId?: string | null
  parentId?: string | null // parent principal (arborescence)
  x?: number
  y?: number
  collapsed?: boolean
  // Relations
  linkedIds?: string[] // liens libres (ex: note liée à plusieurs projets)
  projectIds?: string[]
  objectiveIds?: string[]
  refId?: string // pour type 'ref'
  targetMapId?: string // pour type 'maplink'
  // État
  status?: string
  priority?: number // 1..5
  progressMode?: 'auto' | 'manual'
  progress?: number // 0..100 (manuel)
  color?: string
  icon?: string
  tags?: string[]
  // Dates
  date?: string | null // YYYY-MM-DD (jour prévu)
  time?: string | null // HH:MM
  deadline?: string | null
  duration?: number | null // minutes
  horizon?: Horizon
  inbox?: boolean
  done?: boolean
  doneAt?: string | null
  recurrence?: Recurrence | null
  reminder?: string | null // ISO
  postponed?: number
  postponedFrom?: string | null // date d'origine du dernier report
  // Contenu
  checklist?: ChecklistItem[]
  url?: string
  amount?: number
  comments?: Comment[]
  history?: HistoryEvent[]
  // Méta
  favorite?: boolean
  archived?: boolean
  deleted?: boolean
  createdAt: string
  updatedAt: string
  meta?: Record<string, unknown>
}

export interface Edge {
  id: string
  mapId: string
  source: string
  target: string
  kind: EdgeKind
  label?: string
  deleted?: boolean
  updatedAt: string
}

export interface PriorityLevel {
  level: number
  label: string
  color: string
  glyph: string
}

export interface StatusDef {
  id: string
  label: string
  color: string
  done?: boolean
}

export interface Settings {
  theme: 'dark' | 'light'
  animations: boolean
  showQuotes: boolean
  favoriteQuotes: number[]
  hiddenQuotes: number[]
  priorities: PriorityLevel[]
  statuses: StatusDef[]
  dailyTop: { date: string; ids: string[] }
  activeMapId?: string
  lastBackupAt?: string | null
  lastSyncAt?: string | null
  onboarded: boolean
  recents: string[]
  rightPanel: boolean
  lastRolloverDate?: string
  userName?: string
  sky?: boolean
  skyLoc?: { lat: number; lng: number; label: string }
}

export type ViewId =
  | 'home'
  | 'map'
  | 'maps'
  | 'tasks'
  | 'notes'
  | 'inbox'
  | 'projects'
  | 'objectives'
  | 'favorites'
  | 'settings'
