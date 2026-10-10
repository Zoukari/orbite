import { useMemo, useState } from 'react'
import { useData, useUI, pathLabel, displayTitle, descendants, ancestors, isNoteLike } from '../lib/store'
import { Icon, Modal, TypeGlyph } from './ui'
import type { Entity } from '../lib/types'

const CONTAINER = new Set(['map', 'vision', 'category', 'project', 'subproject', 'objective'])
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// « Ajouter à… » — choisir un emplacement sans retaper de nom :
// recherche, récents, favoris, suggestions (relations existantes), arborescence.
export function AddToModal() {
  const addTo = useUI((s) => s.addTo)
  const ents = useData((s) => s.entities)
  const recents = useData((s) => s.settings.recents)
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [onlyObjectives, setOnlyObjectives] = useState(false)

  const src = addTo ? ents[addTo.sourceId] : undefined
  const forbidden = useMemo(() => (src ? new Set([src.id, ...descendants(ents, src.id)]) : new Set<string>()), [src?.id, ents])

  const candidates = useMemo(() => {
    const kids = new Map<string, Entity[]>()
    const roots: Entity[] = []
    const all = Object.values(ents).filter((e) => !e.archived && (CONTAINER.has(e.type) || (e.type === 'ref' && CONTAINER.has(ents[e.refId!]?.type))) && !forbidden.has(e.id))
    const allSet = new Set(all.map((e) => e.id))
    for (const e of all) {
      if (e.type === 'map') { roots.push(e); continue }
      const parentKey = e.parentId && allSet.has(e.parentId) ? e.parentId : e.mapId && allSet.has(e.mapId) ? e.mapId : null
      if (!parentKey) continue
      const a = kids.get(parentKey) || []
      a.push(e)
      kids.set(parentKey, a)
    }
    return { all, kids, roots }
  }, [ents, forbidden])

  const suggestions = useMemo(() => {
    if (!src) return []
    const words = norm(src.title).split(/[^a-z0-9]+/).filter((w) => w.length > 3)
    const score = new Map<string, number>()
    const bump = (id: string, n: number) => { if (!forbidden.has(id) && ents[id] && CONTAINER.has(ents[id].type)) score.set(id, (score.get(id) || 0) + n) }
    for (const e of candidates.all) {
      const t = norm(e.title)
      for (const w of words) if (t.includes(w)) bump(e.id, 3)
    }
    // relations existantes : projets des éléments voisins
    for (const l of [...(src.linkedIds || []), ...(src.projectIds || []), ...(src.objectiveIds || [])]) bump(l, 4)
    if (src.parentId) for (const a of ancestors(ents, src.id)) bump(a.id, 1)
    for (const e of Object.values(ents)) {
      if (e.id === src.id) continue
      if (e.projectIds?.some((p) => src.projectIds?.includes(p))) e.projectIds?.forEach((p) => bump(p, 1))
    }
    return [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => ents[id])
  }, [src?.id, candidates])

  if (!addTo || !src) return null
  const close = () => { useUI.getState().set({ addTo: null }); setQ(''); setPicked(null); setOnlyObjectives(false) }
  const mode = addTo.mode
  const data = useData.getState()
  const ui = useUI.getState()
  const title = displayTitle(ents, src)

  const act = (kind: 'link' | 'ref' | 'move', targetId: string) => {
    const target = ents[targetId]
    if (!target) return
    if (addTo.onPick) { addTo.onPick(targetId); close(); return }
    if (kind === 'move') {
      if (target.type === 'map') data.moveUnder(src.id, null, target.id)
      else data.moveUnder(src.id, target.id)
      ui.notify(`Déplacé vers ${displayTitle(ents, target)}`)
    } else if (kind === 'ref') {
      const mapId = target.type === 'map' ? target.id : target.mapId
      if (!mapId) return
      const realId = src.type === 'ref' ? src.refId! : src.id
      data.addRef(realId, target.type === 'map' ? null : target.id, mapId, target.type === 'map' ? { x: 0, y: 0 } : undefined)
      data.link(realId, target.type === 'map' ? realId : target.id)
      ui.notify(`Référence ajoutée dans ${displayTitle(ents, target)}`)
    } else {
      data.link(src.type === 'ref' ? src.refId! : src.id, targetId)
      ui.notify(`Lié à ${displayTitle(ents, target)}`)
    }
    data.touchRecent(targetId)
    close()
  }

  const sendTo = (dest: 'tasks' | 'notes' | 'inbox') => {
    const real = src.type === 'ref' ? ents[src.refId!] : src
    const projectIds = [...ancestors(ents, real.id), real].filter((a) => a.type === 'project' || a.type === 'subproject').map((a) => a.id)
    if (dest === 'inbox') { data.update(real.id, { inbox: true }); ui.notify('Envoyé dans l’Inbox') }
    if (dest === 'tasks') {
      if (real.type === 'task') ui.notify('C’est déjà une tâche')
      else {
        const t = data.create({ type: 'task', title: real.title, linkedIds: [real.id], projectIds })
        data.link(real.id, t.id)
        ui.notify('Tâche liée créée')
      }
    }
    if (dest === 'notes') {
      if (isNoteLike(real)) ui.notify('C’est déjà une note')
      else {
        const n = data.create({ type: 'note', title: real.title, description: real.description, linkedIds: [real.id], projectIds })
        data.link(real.id, n.id)
        ui.notify('Note liée créée')
      }
    }
    close()
  }

  const Row = ({ e, depth = 0, path }: { e: Entity; depth?: number; path?: boolean }) => {
    const shown = e.type === 'ref' ? ents[e.refId!] : e
    const kids = candidates.kids.get(e.id) || []
    const isOpen = open[e.id] ?? (depth < 1)
    const isPicked = picked === e.id
    return (
      <div>
        <div className={`group flex items-center gap-1 rounded-xl pr-2 transition ${isPicked ? 'bg-accent/10' : 'hover:bg-ink/5'}`} style={{ paddingLeft: 6 + depth * 16 }}>
          <button className={`flex h-7 w-5 items-center justify-center text-mute ${kids.length ? '' : 'invisible'}`} onClick={() => setOpen({ ...open, [e.id]: !isOpen })}>
            <Icon name="chevron" className={`h-3.5 w-3.5 transition ${isOpen ? 'rotate-90' : ''}`} />
          </button>
          <button className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left" onClick={() => (mode === 'move' || addTo.onPick ? act('move', e.id) : setPicked(isPicked ? null : e.id))}>
            <TypeGlyph e={shown} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{displayTitle(ents, e)}</span>
              {path && <span className="block truncate text-[11px] text-mute">{e.type === 'map' ? 'Map' : [ents[e.mapId!]?.title, pathLabel(ents, e.id)].filter(Boolean).join(' › ')}</span>}
            </span>
          </button>
        </div>
        {isPicked && mode !== 'move' && !addTo.onPick && (
          <div className="fade mb-1 ml-8 mr-2 flex flex-wrap gap-1.5 py-1" style={{ marginLeft: 30 + depth * 16 }}>
            <button className="btn-accent !py-1.5 text-xs" onClick={() => act('link', e.id)}><Icon name="link" className="h-3.5 w-3.5" />Lier</button>
            <button className="btn-soft !py-1.5 text-xs" onClick={() => act('ref', e.id)} title="Apparaît dans la branche, sans dupliquer">⇢ Référence ici</button>
            <button className="btn-soft !py-1.5 text-xs" onClick={() => act('move', e.id)}><Icon name="move" className="h-3.5 w-3.5" />Déplacer ici</button>
          </div>
        )}
        {!path && isOpen && kids.sort((a, b) => (a.y ?? 0) - (b.y ?? 0)).map((k) => <Row key={k.id} e={k} depth={depth + 1} />)}
      </div>
    )
  }

  const nq = norm(q.trim())
  const results = nq ? candidates.all.filter((e) => norm(displayTitle(ents, e)).includes(nq)).slice(0, 30) : []
  const recentItems = recents.map((r) => ents[r]).filter((e) => e && CONTAINER.has(e.type) && !forbidden.has(e.id)).slice(0, 4)
  const favs = candidates.all.filter((e) => e.favorite).slice(0, 6)
  const objectives = candidates.all.filter((e) => e.type === 'objective')

  return (
    <Modal open onClose={close} wide title={<span>{mode === 'move' ? 'Déplacer vers…' : addTo.onPick ? 'Choisir l’emplacement' : 'Ajouter à…'} <span className="font-sans text-sm font-normal text-mute">« {title} »</span></span>}>
      <div className="px-4 pb-4">
        <div className="relative mb-3">
          <Icon name="search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" />
          <input autoFocus className="input !pl-9" placeholder="Rechercher un projet, une branche, une map…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        {mode === 'link' && !addTo.onPick && !nq && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            <button className="chip !px-3 !py-1.5 !text-xs hover:text-ink" onClick={() => sendTo('tasks')}>☐ Tâches</button>
            <button className="chip !px-3 !py-1.5 !text-xs hover:text-ink" onClick={() => sendTo('notes')}>≡ Notes</button>
            <button className="chip !px-3 !py-1.5 !text-xs hover:text-ink" onClick={() => setOnlyObjectives(!onlyObjectives)} style={onlyObjectives ? { color: 'rgb(var(--accent))', borderColor: 'rgb(var(--accent) / .5)' } : undefined}>◉ Objectifs</button>
            <button className="chip !px-3 !py-1.5 !text-xs hover:text-ink" onClick={() => sendTo('inbox')}>⌂ Inbox</button>
          </div>
        )}

        {nq ? (
          <div>{results.length ? results.map((e) => <Row key={e.id} e={e} path />) : <div className="py-6 text-center text-sm text-mute">Aucun emplacement trouvé.</div>}</div>
        ) : onlyObjectives ? (
          <div>{objectives.length ? objectives.map((e) => <Row key={e.id} e={e} path />) : <div className="py-6 text-center text-sm text-mute">Aucun objectif.</div>}</div>
        ) : (
          <div className="space-y-3">
            {suggestions.length > 0 && <Section title="Suggestions">{suggestions.map((e) => <Row key={e.id} e={e} path />)}</Section>}
            {recentItems.length > 0 && <Section title="Récents">{recentItems.map((e) => <Row key={e.id} e={e} path />)}</Section>}
            {favs.length > 0 && <Section title="Favoris">{favs.map((e) => <Row key={e.id} e={e} path />)}</Section>}
            <Section title="Arborescence">{candidates.roots.map((m) => <Row key={m.id} e={m} />)}</Section>
          </div>
        )}
      </div>
    </Modal>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="section-title mb-1 px-2">{title}</div>
      {children}
    </div>
  )
}
