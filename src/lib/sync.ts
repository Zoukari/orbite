import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import { db, SETTINGS_KEY } from './db'
import { onLocalChange, useData } from './store'
import { create } from 'zustand'

// ─────────────────────────────────────────────────────────────
// Sync "local-first" : IndexedDB reste la vérité de l'app, Supabase
// sert de sauvegarde cloud + synchro entre appareils (iPhone ↔ PC).
// Stratégie : last-write-wins par `updated_at`. Tables préfixées lm_
// pour cohabiter sans risque avec ZATHLETE dans le même projet.
// ─────────────────────────────────────────────────────────────

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase: SupabaseClient | null = URL && KEY ? createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'orbite.auth' } }) : null

type SyncStatus = 'off' | 'idle' | 'syncing' | 'error' | 'offline'
export const useSync = create<{ session: Session | null; checked: boolean; status: SyncStatus; error?: string; set: (p: any) => void }>((set) => ({
  session: null,
  checked: !URL || !KEY,
  status: supabase ? 'idle' : 'off',
  set
}))

const PULL_KEY = 'orbite.lastPull'
let timer: ReturnType<typeof setTimeout> | null = null
let running = false

export function scheduleSync(delay = 1500) {
  if (!supabase || !useSync.getState().session) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void syncNow(), delay)
}

export async function syncNow(): Promise<boolean> {
  const sb = supabase
  const session = useSync.getState().session
  if (!sb || !session || running) return false
  if (!navigator.onLine) {
    useSync.getState().set({ status: 'offline' })
    return false
  }
  running = true
  useSync.getState().set({ status: 'syncing', error: undefined })
  try {
    const uid = session.user.id
    // 1) PUSH des modifications locales
    const dirtyE = await db.entities.where('_dirty').equals(1).toArray()
    const dirtyD = await db.edges.where('_dirty').equals(1).toArray()
    const dirtyK = await db.kv.where('_dirty').equals(1).toArray()
    for (const chunk of chunks(dirtyE, 400)) {
      const { error } = await sb.from('lm_entities').upsert(
        chunk.map(({ _dirty, ...e }) => ({
          id: e.id, user_id: uid, type: e.type, title: e.title ?? '', map_id: e.mapId ?? null, parent_id: e.parentId ?? null,
          deleted: !!e.deleted, updated_at: e.updatedAt, doc: e
        }))
      )
      if (error) throw error
    }
    for (const chunk of chunks(dirtyD, 400)) {
      const { error } = await sb.from('lm_edges').upsert(
        chunk.map(({ _dirty, ...e }) => ({ id: e.id, user_id: uid, map_id: e.mapId, deleted: !!e.deleted, updated_at: e.updatedAt, doc: e }))
      )
      if (error) throw error
    }
    for (const k of dirtyK) {
      const { error } = await sb.from('lm_kv').upsert({ user_id: uid, key: k.key, doc: k.value, updated_at: k.updatedAt })
      if (error) throw error
    }
    // on marque "propre" seulement ce qui n'a pas rebougé pendant le push
    await db.transaction('rw', db.entities, db.edges, db.kv, async () => {
      for (const e of dirtyE) { const cur = await db.entities.get(e.id); if (cur && cur.updatedAt === e.updatedAt) await db.entities.update(e.id, { _dirty: 0 }) }
      for (const e of dirtyD) { const cur = await db.edges.get(e.id); if (cur && cur.updatedAt === e.updatedAt) await db.edges.update(e.id, { _dirty: 0 }) }
      for (const k of dirtyK) { const cur = await db.kv.get(k.key); if (cur && cur.updatedAt === k.updatedAt) await db.kv.update(k.key, { _dirty: 0 }) }
    })

    // 2) PULL de ce qui a changé ailleurs
    const since = localStorage.getItem(PULL_KEY + uid) || '1970-01-01T00:00:00Z'
    let maxSeen = since
    let changed = false
    const pullTable = async (table: 'lm_entities' | 'lm_edges', local: typeof db.entities | typeof db.edges) => {
      let from = 0
      for (;;) {
        const { data, error } = await sb.from(table).select('doc, synced_at').gt('synced_at', since).order('synced_at').range(from, from + 999)
        if (error) throw error
        if (!data?.length) break
        await db.transaction('rw', local, async () => {
          for (const row of data) {
            const remote = row.doc as any
            const cur = await (local as any).get(remote.id)
            // last-write-wins : la version distante gagne si la locale n'a pas de modif plus récente
            if (!cur || !cur._dirty || cur.updatedAt < remote.updatedAt) {
              await (local as any).put({ ...remote, _dirty: 0 })
              changed = true
            }
            if (row.synced_at > maxSeen) maxSeen = row.synced_at
          }
        })
        if (data.length < 1000) break
        from += 1000
      }
    }
    await pullTable('lm_entities', db.entities)
    await pullTable('lm_edges', db.edges)
    const { data: kv, error: kvErr } = await sb.from('lm_kv').select('key, doc, updated_at').eq('key', SETTINGS_KEY)
    if (kvErr) throw kvErr
    if (kv?.[0]) {
      const cur = await db.kv.get(SETTINGS_KEY)
      if (!cur || (!cur._dirty && cur.updatedAt < kv[0].updated_at)) {
        const local = (cur?.value as any) || {}
        // l'onglet actif et la sauvegarde locale restent propres à l'appareil
        await db.kv.put({ key: SETTINGS_KEY, value: { ...kv[0].doc, activeMapId: local.activeMapId ?? kv[0].doc.activeMapId }, updatedAt: kv[0].updated_at, _dirty: 0 })
        changed = true
      }
    }
    localStorage.setItem(PULL_KEY + uid, maxSeen)
    if (changed) await useData.getState().reload()
    useSync.getState().set({ status: 'idle' })
    const s = useData.getState()
    // lastSyncAt est local à l'appareil : on évite de re-déclencher un push
    const cur = await db.kv.get(SETTINGS_KEY)
    const nextSettings = { ...s.settings, lastSyncAt: new Date().toISOString() }
    useData.setState({ settings: nextSettings })
    if (cur) await db.kv.put({ ...cur, value: nextSettings })
    return true
  } catch (e: any) {
    console.error('[sync]', e)
    useSync.getState().set({ status: 'error', error: e?.message || String(e) })
    return false
  } finally {
    running = false
  }
}

function chunks<T>(a: T[], n: number) {
  const out: T[][] = []
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n))
  return out
}

let syncStarted = false
export async function initSync() {
  if (!supabase || syncStarted) return
  syncStarted = true
  // demande au navigateur de ne jamais effacer les données de l'app (session incluse)
  try { await navigator.storage?.persist?.() } catch {}
  const { data } = await supabase.auth.getSession()
  useSync.getState().set({ session: data.session, checked: true })
  if (data.session?.user.email) rememberEmail(data.session.user.email)
  supabase.auth.onAuthStateChange((_evt, session) => {
    useSync.getState().set({ session })
    if (session?.user.email) rememberEmail(session.user.email)
    if (session) scheduleSync(200)
  })
  onLocalChange(() => scheduleSync())
  window.addEventListener('online', () => scheduleSync(300))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleSync(300)
  })
  setInterval(() => scheduleSync(0), 60_000)
  if (data.session) scheduleSync(300)
}

export async function signIn(email: string, password: string) {
  if (!supabase) throw new Error('Supabase non configuré')
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}
export async function signUp(email: string, password: string) {
  if (!supabase) throw new Error('Supabase non configuré')
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw error
  return !!data.session
}
export async function signOut() {
  await supabase?.auth.signOut()
}

// ───────── PIN ─────────
// Le PIN (6 chiffres) sert de mot de passe Supabase, avec un préfixe fixe
// (Supabase exige ≥ 6 caractères). L'e-mail est mémorisé sur l'appareil.
export const pinPassword = (pin: string) => `orbite-pin-${pin}`
export const OWNER_EMAIL = (import.meta.env.VITE_OWNER_EMAIL as string | undefined) || ''
export const rememberedEmail = () => { try { return localStorage.getItem('orbite.email') || OWNER_EMAIL } catch { return OWNER_EMAIL } }
export const rememberEmail = (e: string) => { try { localStorage.setItem('orbite.email', e) } catch {} }

export async function signInPin(email: string, pin: string) {
  await signIn(email, pinPassword(pin))
  rememberEmail(email)
}
export async function signUpPin(email: string, pin: string) {
  const ok = await signUp(email, pinPassword(pin))
  rememberEmail(email)
  return ok
}
export async function setPin(pin: string) {
  if (!supabase) throw new Error('Supabase non configuré')
  const { error } = await supabase.auth.updateUser({ password: pinPassword(pin) })
  if (error) throw error
}
