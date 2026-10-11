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

export const PALETTE = [
  // froids
  '#8ea2ff', '#7aa7ff', '#5b8cff', '#7fd3ff', '#4fd1e8', '#38bdb0',
  // verts
  '#6fe0b8', '#9ee6a8', '#5fd17a', '#b5e06f',
  // chauds
  '#ffd479', '#f2b45a', '#ff9f5a', '#ff7a59', '#ff6b6b', '#ff9f9f',
  // roses / violets
  '#ff7ab6', '#ffb3c7', '#e08cff', '#b18cff', '#d6c6ff', '#9a7bff',
  // neutres
  '#c8cde0', '#8a90a6', '#e8ecff', '#c9a97a'
]

export const ICON_GROUPS: { label: string; icons: string[] }[] = [
  { label: 'Business', icons: ['💼', '🏢', '📈', '📊', '💰', '💵', '💳', '🧾', '🤝', '📦', '🚚', '✈️', '🛒', '🏷️', '📣', '🎯', '🚀', '⚙️', '🧠', '💡', '🖥️', '📱', '🌐', '🛠️'] },
  { label: 'Food & lieux', icons: ['🍔', '🌮', '🌯', '🍟', '🍕', '☕', '🥤', '🍽️', '🏪', '🏠', '🏡', '🏗️', '🏙️', '🕌', '🏝️', '🗺️'] },
  { label: 'Pays', icons: ['🇩🇯', '🇨🇦', '🇫🇷', '🇧🇪', '🇺🇸', '🇸🇦', '🇦🇪', '🇪🇹', '🇰🇪', '🇲🇦', '🇹🇷', '🇬🇧', '🌍', '🌎'] },
  { label: 'Perso', icons: ['❤️', '👨‍👩‍👧', '👤', '🎓', '📚', '✍️', '🏋️', '🏃', '⚽', '🎮', '🎧', '🎬', '📷', '🧘', '🩺', '🤲', '🌙', '⭐', '🌱', '🐪'] },
  { label: 'Objectifs', icons: ['🎯', '🏆', '🥇', '🔥', '⚡', '💎', '🧭', '📍', '🗓️', '⏳', '✅', '🚩', '🔑', '🛡️', '🌟', '🪐'] },
  { label: 'Symboles', icons: ['◎', '▣', '◉', '✦', '◆', '✧', '⌂', '✈', '€', '♥', '✎', '⚑', '☼', '☾', '♫', '⌘', '◐', '◇'] }
]
export const ICONS = ICON_GROUPS.flatMap((g) => g.icons)

// Hiérarchie : Projet → Sous-projet → Vision → Objectif → Jalon → Tâche (→ sous-tâche)
export function childType(t: EntityType): EntityType {
  if (t === 'category') return 'project'
  if (t === 'project') return 'subproject'
  if (t === 'subproject') return 'objective'
  if (t === 'vision') return 'objective'
  if (t === 'objective') return 'milestone'
  if (t === 'milestone' || t === 'task') return 'task'
  return 'idea'
}
