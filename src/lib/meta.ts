import type { EntityType, PriorityLevel, StatusDef, EdgeKind } from './types'

export const TYPE_META: Record<EntityType, { label: string; glyph: string; tint: string; shape: 'pill' | 'card' | 'orb' | 'diamond' | 'chip' }> = {
  map: { label: 'Map', glyph: '◎', tint: '#8ea2ff', shape: 'orb' },
  category: { label: 'Catégorie', glyph: '◇', tint: '#b9c3e6', shape: 'orb' },
  vision: { label: 'Vision', glyph: '✦', tint: '#f4d58d', shape: 'orb' },
  project: { label: 'Projet', glyph: '▣', tint: '#7aa7ff', shape: 'card' },
  subproject: { label: 'Sous-projet', glyph: '▢', tint: '#86b7ff', shape: 'card' },
  objective: { label: 'Objectif', glyph: '◉', tint: '#6fe0b8', shape: 'card' },
  task: { label: 'Tâche', glyph: '○', tint: '#c8cde0', shape: 'chip' },
  idea: { label: 'Idée', glyph: '✧', tint: '#ffd479', shape: 'pill' },
  note: { label: 'Note', glyph: '≡', tint: '#d6c6ff', shape: 'pill' },
  text: { label: 'Texte', glyph: 'T', tint: '#c8cde0', shape: 'pill' },
  checklist: { label: 'Checklist', glyph: '☑', tint: '#9ee6a8', shape: 'pill' },
  link: { label: 'Lien', glyph: '↗', tint: '#7fd3ff', shape: 'pill' },
  image: { label: 'Image', glyph: '▨', tint: '#ffb3c7', shape: 'pill' },
  document: { label: 'Document', glyph: '▤', tint: '#c2cbe0', shape: 'pill' },
  person: { label: 'Personne', glyph: '◐', tint: '#ffb27a', shape: 'pill' },
  expense: { label: 'Dépense', glyph: '¤', tint: '#ff9f9f', shape: 'pill' },
  milestone: { label: 'Jalon', glyph: '◆', tint: '#f4d58d', shape: 'diamond' },
  maplink: { label: 'Lien de Map', glyph: '⟴', tint: '#8ea2ff', shape: 'orb' },
  ref: { label: 'Référence', glyph: '⇢', tint: '#c8cde0', shape: 'pill' }
}

// Types proposés à la création (ordre du menu)
export const CREATABLE: EntityType[] = [
  'project', 'subproject', 'objective', 'task', 'idea', 'note', 'text', 'checklist',
  'link', 'image', 'document', 'person', 'expense', 'milestone', 'category', 'vision', 'maplink'
]

export const DEFAULT_STATUSES: StatusDef[] = [
  { id: 'backlog', label: 'Backlog', color: '#7b8197' },
  { id: 'todo', label: 'À faire', color: '#a7b0c8' },
  { id: 'doing', label: 'En cours', color: '#7aa7ff' },
  { id: 'waiting', label: 'En attente', color: '#d9b86c' },
  { id: 'blocked', label: 'Bloqué', color: '#ff7a7a' },
  { id: 'done', label: 'Terminé', color: '#6fe0b8', done: true }
]

// Niveaux "style jeu", sobres : glyphe + couleur + halo discret
export const DEFAULT_PRIORITIES: PriorityLevel[] = [
  { level: 1, label: 'Commun', color: '#8a90a6', glyph: '·' },
  { level: 2, label: 'Notable', color: '#7fb6ff', glyph: '◇' },
  { level: 3, label: 'Rare', color: '#a78bff', glyph: '◆' },
  { level: 4, label: 'Épique', color: '#f2b45a', glyph: '✦' },
  { level: 5, label: 'Critique', color: '#ff6b6b', glyph: '✸' }
]

export const EDGE_META: Record<EdgeKind, { label: string; dash?: string; color: string }> = {
  parent: { label: 'parent / enfant', color: 'var(--edge)' },
  linked: { label: 'lié à', dash: '2 6', color: 'var(--edge-strong)' },
  depends: { label: 'dépend de', dash: '8 5', color: '#d9b86c' },
  leads: { label: 'mène à', color: '#6fe0b8' },
  reference: { label: 'référence', dash: '1 4', color: '#a78bff' }
}

export const PALETTE = ['#8ea2ff', '#7aa7ff', '#6fe0b8', '#9ee6a8', '#ffd479', '#f2b45a', '#ff9f9f', '#ffb3c7', '#d6c6ff', '#7fd3ff', '#c8cde0']

export const ICONS = ['◎', '▣', '◉', '✦', '◆', '✧', '⌂', '✈', '₿', '€', '♥', '✎', '⚑', '☼', '☾', '♫', '⚙', '⌘', '☕', '🍔', '📦', '🎮', '🇨🇦', '🏠', '🎓', '💼', '💰', '🚗', '🏋️', '📚']

export function childType(t: EntityType): EntityType {
  if (t === 'vision' || t === 'category') return 'category'
  if (t === 'project') return 'subproject'
  if (t === 'subproject' || t === 'objective' || t === 'task') return 'task'
  return 'idea'
}
