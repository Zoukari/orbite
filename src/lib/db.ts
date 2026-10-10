import Dexie, { type Table } from 'dexie'
import type { Edge, Entity, Settings } from './types'

// Stockage local (IndexedDB). Toujours la source de vérité de l'app.
// `_dirty = 1` → à pousser vers Supabase au prochain sync.
export type LocalEntity = Entity & { _dirty?: 0 | 1 }
export type LocalEdge = Edge & { _dirty?: 0 | 1 }

class OrbiteDB extends Dexie {
  entities!: Table<LocalEntity, string>
  edges!: Table<LocalEdge, string>
  kv!: Table<{ key: string; value: unknown; updatedAt: string; _dirty?: 0 | 1 }, string>

  constructor() {
    super('orbite')
    this.version(1).stores({
      entities: 'id, type, mapId, parentId, updatedAt, _dirty, date',
      edges: 'id, mapId, source, target, updatedAt, _dirty',
      kv: 'key, _dirty'
    })
  }
}

export const db = new OrbiteDB()

export const SETTINGS_KEY = 'settings'

export async function loadAll() {
  const [entities, edges, s] = await Promise.all([
    db.entities.toArray(),
    db.edges.toArray(),
    db.kv.get(SETTINGS_KEY)
  ])
  return { entities, edges, settings: (s?.value as Settings | undefined) ?? null }
}
