import { db, SETTINGS_KEY } from './db'
import { descendants, useData, resolve } from './store'
import type { Edge, Entity, Settings } from './types'
import { today } from './dates'

export interface BackupFile {
  app: 'orbite'
  version: 1
  exportedAt: string
  entities: Entity[]
  edges: Edge[]
  settings: Settings
}

function download(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 500)
}

export async function exportAll() {
  const entities = (await db.entities.toArray()).filter((e) => !e.deleted).map(({ _dirty, ...e }) => e)
  const edges = (await db.edges.toArray()).filter((e) => !e.deleted).map(({ _dirty, ...e }) => e)
  const file: BackupFile = { app: 'orbite', version: 1, exportedAt: new Date().toISOString(), entities, edges, settings: useData.getState().settings }
  download(`orbite-sauvegarde-${today()}.json`, JSON.stringify(file, null, 1), 'application/json')
  useData.getState().setSettings({ lastBackupAt: file.exportedAt })
}

export function exportTasksCsv() {
  const ents = useData.getState().entities
  const prio = useData.getState().settings.priorities
  const rows = Object.values(ents).filter((e) => e.type === 'task')
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const head = ['Titre', 'Statut', 'Terminée', 'Priorité', 'Date', 'Heure', 'Deadline', 'Durée (min)', 'Projets', 'Tags', 'Reports', 'Description']
  const lines = rows.map((t) => [
    t.title, t.status, t.done ? 'oui' : 'non', prio.find((p) => p.level === t.priority)?.label ?? '', t.date, t.time, t.deadline, t.duration,
    (t.projectIds || []).map((p) => ents[p]?.title).filter(Boolean).join(' | '), (t.tags || []).join(' '), t.postponed ?? 0, t.description
  ].map(esc).join(','))
  download(`orbite-taches-${today()}.csv`, '﻿' + [head.join(','), ...lines].join('\n'), 'text/csv')
}

export async function importBackup(file: File, mode: 'merge' | 'replace') {
  const data = JSON.parse(await file.text()) as BackupFile
  if (data.app !== 'orbite' || !Array.isArray(data.entities)) throw new Error('Fichier non reconnu')
  const t = new Date().toISOString()
  await db.transaction('rw', db.entities, db.edges, db.kv, async () => {
    if (mode === 'replace') {
      const all = await db.entities.toArray()
      const keep = new Set(data.entities.map((e) => e.id))
      await db.entities.bulkPut(all.filter((e) => !keep.has(e.id)).map((e) => ({ ...e, deleted: true, updatedAt: t, _dirty: 1 as const })))
      const alle = await db.edges.toArray()
      const keepE = new Set(data.edges.map((e) => e.id))
      await db.edges.bulkPut(alle.filter((e) => !keepE.has(e.id)).map((e) => ({ ...e, deleted: true, updatedAt: t, _dirty: 1 as const })))
    }
    for (const e of data.entities) {
      const cur = await db.entities.get(e.id)
      if (mode === 'replace' || !cur || cur.updatedAt <= e.updatedAt) await db.entities.put({ ...e, deleted: false, updatedAt: mode === 'replace' ? t : e.updatedAt, _dirty: 1 })
    }
    for (const e of data.edges || []) {
      const cur = await db.edges.get(e.id)
      if (mode === 'replace' || !cur || cur.updatedAt <= e.updatedAt) await db.edges.put({ ...e, deleted: false, updatedAt: mode === 'replace' ? t : e.updatedAt, _dirty: 1 })
    }
    if (data.settings) {
      const cur = (await db.kv.get(SETTINGS_KEY))?.value as Settings | undefined
      await db.kv.put({ key: SETTINGS_KEY, value: { ...cur, ...data.settings, onboarded: true }, updatedAt: t, _dirty: 1 })
    }
  })
  await useData.getState().reload()
  return data.entities.length
}

// ───────── Partage d'une branche (lecture seule) ─────────

export interface ShareSnapshot {
  app: 'orbite-share'
  v: 1
  rootId: string
  title: string
  createdAt: string
  entities: Entity[]
  edges: Edge[]
}

const PRIVATE_FIELDS: (keyof Entity)[] = ['comments', 'history', 'reminder', 'favorite', 'meta']

export function buildSnapshot(rootId: string): ShareSnapshot {
  const { entities, edges } = useData.getState()
  const root = entities[rootId]
  const ids = new Set([rootId, ...descendants(entities, rootId)])
  // si la racine est une Map, on prend tout son contenu
  if (root.type === 'map') for (const e of Object.values(entities)) if (e.mapId === rootId) ids.add(e.id)
  const out: Entity[] = []
  for (const id of ids) {
    const e = entities[id]
    if (!e || e.archived) continue
    let copy: Entity = { ...e }
    if (e.type === 'ref') {
      // la référence est "aplatie" : on n'expose que la cible, pas ses liens
      const r = resolve(entities, e)
      copy = { ...r, id: e.id, parentId: e.parentId, mapId: e.mapId, x: e.x, y: e.y, collapsed: e.collapsed }
    }
    for (const f of PRIVATE_FIELDS) delete (copy as any)[f]
    // on retire les liens qui pointent hors de la branche partagée
    copy.linkedIds = copy.linkedIds?.filter((l) => ids.has(l))
    copy.projectIds = copy.projectIds?.filter((l) => ids.has(l))
    copy.objectiveIds = copy.objectiveIds?.filter((l) => ids.has(l))
    if (id === rootId && root.type !== 'map') copy.parentId = null
    out.push(copy)
  }
  const outEdges = Object.values(edges).filter((d) => ids.has(d.source) && ids.has(d.target))
  return { app: 'orbite-share', v: 1, rootId, title: root.title, createdAt: new Date().toISOString(), entities: out, edges: outEdges }
}

async function compress(s: string) {
  const stream = new Blob([s]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  const buf = new Uint8Array(await new Response(stream).arrayBuffer())
  let bin = ''
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export async function decompress(b64: string) {
  const s = b64.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(s + '==='.slice((s.length + 3) % 4))
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return await new Response(stream).text()
}

export async function shareLink(rootId: string) {
  const snap = buildSnapshot(rootId)
  const code = await compress(JSON.stringify(snap))
  return { url: `${location.origin}/#share=${code}`, size: code.length, snap }
}

export function downloadSnapshot(snap: ShareSnapshot) {
  download(`orbite-partage-${snap.title.replace(/[^\p{L}\d]+/gu, '-').toLowerCase()}.json`, JSON.stringify(snap), 'application/json')
}
