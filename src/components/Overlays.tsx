import { useEffect, useState } from 'react'
import { useData, useUI, displayTitle, progressOf, relatedTasks, resolve, descendants } from '../lib/store'
import { shareLink, downloadSnapshot, type ShareSnapshot } from '../lib/backup'
import { createBlankMap, seedDemo } from '../lib/demo'
import { Icon, Modal, ProgressBar, TypeGlyph } from './ui'
import { TaskRow } from './TaskRow'
import { TopThree } from './Priorities'
import { QuoteLine } from './Quote'

export function Toast() {
  const t = useUI((s) => s.toast)
  if (!t) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[80] flex justify-center md:bottom-8">
      <div className="rise rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-bg shadow-xl">{t}</div>
    </div>
  )
}

// Choix lors d'un glisser-déposer entre sidebar et map
export function DropAsk() {
  const ask = useUI((s) => s.dropAsk)
  const ents = useData((s) => s.entities)
  if (!ask) return null
  const raw = ents[ask.entityId]
  if (!raw) return null
  const e = resolve(ents, raw)
  const close = () => useUI.getState().set({ dropAsk: null })
  const data = useData.getState()
  const ui = useUI.getState()
  const mapId = data.settings.activeMapId
  const opts: { label: string; hint: string; act: () => void }[] = []
  if (ask.target === 'map' && mapId && ask.pos) {
    opts.push({ label: 'Créer une référence', hint: 'L’élément apparaît sur la map, sans être dupliqué', act: () => { data.addRef(e.id, null, mapId, { x: Math.round(ask.pos!.x), y: Math.round(ask.pos!.y) }); ui.notify('Référence ajoutée') } })
    opts.push({ label: 'Déplacer sur la map', hint: 'L’élément vit désormais sur cette map', act: () => { data.update(e.id, { mapId, parentId: null, x: Math.round(ask.pos!.x), y: Math.round(ask.pos!.y), inbox: false }); ui.notify('Déplacé sur la map') } })
  }
  if (ask.target === 'tasks') {
    if (e.type === 'task') opts.push({ label: 'Prévoir pour aujourd’hui', hint: 'La tâche passe dans « Aujourd’hui »', act: () => data.update(e.id, { date: new Date().toLocaleDateString('sv-SE'), inbox: false }) })
    else {
      opts.push({ label: 'Créer une tâche liée', hint: `Nouvelle tâche reliée à « ${e.title} »`, act: () => { const t = data.create({ type: 'task', title: e.title, linkedIds: [e.id], projectIds: ['project', 'subproject'].includes(e.type) ? [e.id] : undefined, date: new Date().toLocaleDateString('sv-SE') }); data.link(e.id, t.id); ui.notify('Tâche liée créée') } })
      opts.push({ label: 'Convertir en tâche', hint: 'L’élément devient une tâche (reste sur la map)', act: () => { data.update(e.id, { type: 'task', status: 'todo' }); ui.notify('Converti en tâche') } })
    }
  }
  if (ask.target === 'notes') {
    opts.push({ label: 'Créer une note liée', hint: `Nouvelle note reliée à « ${e.title} »`, act: () => { const n = data.create({ type: 'note', title: e.title, description: e.description, linkedIds: [e.id] }); data.link(e.id, n.id); ui.open(n.id) } })
    if (e.type !== 'note') opts.push({ label: 'Convertir en note', hint: 'L’élément devient une note', act: () => data.update(e.id, { type: 'note' }) })
  }
  return (
    <Modal open onClose={close} title={`« ${displayTitle(ents, raw)} »`}>
      <div className="space-y-1.5 px-4 pb-4">
        {opts.map((o) => (
          <button key={o.label} onClick={() => { o.act(); close() }} className="w-full rounded-2xl border border-line/70 px-4 py-3 text-left transition hover:border-accent/50 hover:bg-accent/5">
            <div className="text-sm font-medium">{o.label}</div>
            <div className="text-xs text-mute">{o.hint}</div>
          </button>
        ))}
      </div>
    </Modal>
  )
}

export function ShareDialog() {
  const id = useUI((s) => s.share)
  const e = useData((s) => (id ? s.entities[id] : undefined))
  const [res, setRes] = useState<{ url: string; size: number; snap: ShareSnapshot } | null>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    setRes(null)
    setCopied(false)
    if (id) shareLink(id).then(setRes).catch(() => setRes(null))
  }, [id])
  if (!id || !e) return null
  const close = () => useUI.getState().set({ share: null })
  const tooLong = (res?.url.length ?? 0) > 60000
  return (
    <Modal open onClose={close} title="Partager en lecture seule">
      <div className="space-y-4 px-5 pb-5">
        <div className="rounded-2xl bg-ink/[0.04] p-3 text-[12.5px] text-mute">
          Seul <b className="text-ink">« {e.title} »</b> et ses {res ? res.snap.entities.length - 1 : '…'} élément(s) enfants sont inclus. Commentaires, historique et le reste de tes données ne sont jamais partagés. Le lien contient l’instantané compressé : rien n’est envoyé sur un serveur.
        </div>
        {res && !tooLong && (
          <div>
            <div className="label">Lien</div>
            <div className="flex gap-2">
              <input readOnly className="input font-mono text-[11px]" value={res.url} onFocus={(ev) => ev.target.select()} />
              <button className="btn-accent shrink-0" onClick={async () => { try { if (navigator.share && /Mobi/.test(navigator.userAgent)) await navigator.share({ title: e.title, url: res.url }); else { await navigator.clipboard.writeText(res.url); setCopied(true) } } catch {} }}>
                {copied ? 'Copié ✓' : 'Copier'}
              </button>
            </div>
            <div className="mt-1 text-[11px] text-mute">{Math.round(res.url.length / 1000)} k caractères</div>
          </div>
        )}
        {tooLong && <div className="text-xs text-[#f2b45a]">Branche trop grande pour un lien. Utilise le fichier ci-dessous (ouvrable dans Orbite › Réglages › Ouvrir un partage).</div>}
        <div className="flex gap-2">
          {res && <button className="btn-soft" onClick={() => downloadSnapshot(res.snap)}><Icon name="share" className="h-4 w-4" /> Télécharger (.json)</button>}
          {res && !tooLong && <a className="btn-ghost" href={res.url} target="_blank" rel="noreferrer">Aperçu ↗</a>}
        </div>
      </div>
    </Modal>
  )
}

// Mode Focus : un objectif, ses tâches, les 3 priorités. Le reste se tait.
export function FocusOverlay() {
  const focusId = useUI((s) => s.focusId)
  const ents = useData((s) => s.entities)
  if (!focusId) return null
  const close = () => useUI.getState().set({ focusId: null })
  if (focusId === '__pick') {
    const list = Object.values(ents).filter((e) => ['objective', 'project', 'subproject'].includes(e.type) && !e.archived && e.status !== 'done')
    return (
      <Modal open onClose={close} title="Mode Focus — sur quoi ?">
        <div className="px-3 pb-4">
          {list.sort((a, b) => (a.type === 'objective' ? -1 : 1) - (b.type === 'objective' ? -1 : 1)).map((o) => (
            <button key={o.id} onClick={() => useUI.getState().set({ focusId: o.id })} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-ink/5">
              <TypeGlyph e={o} size="sm" /><span className="flex-1 truncate text-sm">{o.title}</span>
              <span className="font-mono text-[11px] text-mute">{progressOf(ents, o) ?? 0}%</span>
            </button>
          ))}
          {!list.length && <div className="py-6 text-center text-sm text-mute">Crée d’abord un objectif ou un projet.</div>}
        </div>
      </Modal>
    )
  }
  const o = ents[focusId]
  if (!o) return null
  const tasks = relatedTasks(ents, o.id).sort((a, b) => Number(a.done) - Number(b.done) || (b.priority ?? 0) - (a.priority ?? 0))
  const p = progressOf(ents, o) ?? 0
  return (
    <div className="fade fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-bg/70 px-4 pb-24 pt-[8vh] backdrop-blur-xl md:pb-10">
      <div className="rise w-full max-w-xl">
        <div className="mb-8 flex items-center justify-between">
          <span className="section-title">Mode Focus</span>
          <button className="btn-soft text-xs" onClick={close}>Quitter <Icon name="close" className="h-3.5 w-3.5" /></button>
        </div>
        <div className="mb-2 text-sm text-mute">{o.type === 'objective' ? 'Objectif' : 'Projet'}</div>
        <h1 className="font-display text-3xl font-semibold leading-tight md:text-4xl">{o.title}</h1>
        {o.description && <p className="mt-2 text-sm text-mute">{o.description.split('\n')[0]}</p>}
        <div className="mt-6">
          <div className="mb-2 flex items-end justify-between"><span className="text-xs text-mute">Progression</span><span className="font-display text-2xl font-semibold tabular-nums">{p}%</span></div>
          <ProgressBar value={p} color={o.color} showLabel={false} />
        </div>
        <div className="mt-8"><TopThree large /></div>
        <div className="mt-8">
          <div className="section-title mb-2">Tâches liées · {tasks.filter((t) => !t.done).length} restantes</div>
          <div className="rounded-2xl border border-line/60 bg-surface/60 p-1">
            {tasks.map((t) => <TaskRow key={t.id} t={t} />)}
            {!tasks.length && <div className="px-3 py-6 text-center text-sm text-mute">Aucune tâche liée. Ajoute-en depuis la fiche.</div>}
          </div>
        </div>
        <div className="mt-8"><QuoteLine /></div>
      </div>
    </div>
  )
}

export function Onboarding() {
  const [name, setName] = useState('Ma vie')
  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden px-6">
      <div className="space"><div className="stars" /></div>
      <div className="rise relative w-full max-w-md text-center">
        <div className="mx-auto mb-8 h-16 w-16"><img src="/icons/icon-192.png" alt="" className="h-16 w-16 rounded-2xl" /></div>
        <h1 className="font-display text-4xl font-semibold tracking-tight">Bienvenue.</h1>
        <p className="mx-auto mt-3 max-w-sm text-[15px] text-mute">Ta vie, vue de l’extérieur : d’où tu viens, où tu en es, ce que tu dois faire, où tu vas.</p>
        <div className="mt-10 space-y-3">
          <div className="card flex items-center gap-2 p-2">
            <input className="flex-1 bg-transparent px-3 text-sm outline-none" value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn-primary" onClick={() => createBlankMap(name.trim() || 'Ma vie')}>Créer ma première Map</button>
          </div>
          <button className="btn-ghost w-full py-3 text-sm" onClick={() => seedDemo()}>Utiliser une structure exemple <span className="text-mute">(supprimable)</span></button>
        </div>
      </div>
    </div>
  )
}

export function useReminders() {
  // Rappels locaux : vérifiés chaque minute tant que l’app est ouverte
  useEffect(() => {
    const check = () => {
      if (!('Notification' in window) || Notification.permission !== 'granted') return
      const now = Date.now()
      const s = useData.getState()
      for (const e of Object.values(s.entities)) {
        if (!e.reminder || e.done) continue
        const at = new Date(e.reminder).getTime()
        if (at <= now && at > now - 6 * 60_000) {
          const key = `orbite.rem.${e.id}.${e.reminder}`
          if (localStorage.getItem(key)) continue
          localStorage.setItem(key, '1')
          new Notification(e.title, { body: 'Rappel Orbite', icon: '/icons/icon-192.png' })
        }
      }
    }
    check()
    const t = setInterval(check, 60_000)
    return () => clearInterval(t)
  }, [])
}

export { descendants }
