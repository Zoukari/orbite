import { useMemo, useState, type ReactNode } from 'react'
import { useData, useUI, progressOf, relationCounts, displayTitle, pathLabel, resolve } from '../lib/store'
import { HORIZONS, horizonOf, fmtDay, today } from '../lib/dates'
import { parseCapture } from '../lib/parser'
import { exportTasksCsv } from '../lib/backup'
import { plainExcerpt } from '../lib/markdown'
import { TYPE_META } from '../lib/meta'
import { TaskRow } from '../components/TaskRow'
import { Empty, Icon, ProgressBar, StatusPill, TypeGlyph, Segmented } from '../components/ui'
import type { Entity, EntityType } from '../lib/types'

export function Page({ title, sub, actions, children }: { title: string; sub?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 pb-28 pt-6 md:px-8 md:pb-12 md:pt-10">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3 px-1">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
            {sub && <div className="mt-1 text-sm text-mute">{sub}</div>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
        {children}
      </div>
    </div>
  )
}

// ───────── Tâches : panneau dédié, organisé par horizon temporel ─────────
export function TasksView() {
  const ents = useData((s) => s.entities)
  const [showDone, setShowDone] = useState(false)
  const [project, setProject] = useState('')
  const [text, setText] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ someday: true, long: true })
  const projects = Object.values(ents).filter((e) => ['project', 'subproject', 'objective'].includes(e.type) && !e.archived)
  const groups = useMemo(() => {
    const g: Record<string, Entity[]> = {}
    for (const t of Object.values(ents)) {
      if (t.type !== 'task' || t.archived) continue
      if (project && !(t.projectIds?.includes(project) || t.objectiveIds?.includes(project) || t.parentId === project || t.linkedIds?.includes(project))) continue
      ;(g[horizonOf(t)] ||= []).push(t)
    }
    for (const k in g) g[k].sort((a, b) => (a.date || '9').localeCompare(b.date || '9') || (b.priority ?? 0) - (a.priority ?? 0))
    g.done?.sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''))
    return g
  }, [ents, project])
  const parsed = text ? parseCapture(text, Object.values(ents)) : null
  const add = (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!parsed?.title) return
    useData.getState().create({ type: 'task', title: parsed.title, date: parsed.date ?? null, time: parsed.time ?? null, priority: parsed.priority, projectIds: parsed.projectId ? [parsed.projectId] : project ? [project] : undefined, tags: parsed.tags.length ? parsed.tags : undefined, inbox: !parsed.date && !parsed.projectId && !project })
    setText('')
  }
  return (
    <Page
      title="Tâches"
      sub={`${Object.values(groups).flat().filter((t) => !t.done).length} ouvertes`}
      actions={
        <>
          <select className="input !w-auto !py-1.5 text-xs" value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="">Tous les projets</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          <button className="btn-soft text-xs" onClick={exportTasksCsv} title="Exporter CSV">CSV</button>
        </>
      }
    >
      <form onSubmit={add} className="card mb-5 flex items-center gap-2 px-3 py-2" data-dropzone="tasks">
        <Icon name="plus" className="h-4 w-4 text-mute" />
        <input className="flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-mute/70" placeholder="Nouvelle tâche… « vendredi relancer KLIK priorité haute »" value={text} onChange={(e) => setText(e.target.value)} />
        {parsed && (parsed.date || parsed.projectTitle) && <span className="hidden text-[11px] text-accent md:inline">{[parsed.date && fmtDay(parsed.date), parsed.projectTitle].filter(Boolean).join(' · ')}</span>}
      </form>
      <div className="space-y-4">
        {HORIZONS.map((h) => {
          const list = groups[h.key] || []
          if (!list.length && h.key !== 'today') return null
          const isCol = collapsed[h.key]
          return (
            <section key={h.key} className="card p-2">
              <button className="flex w-full items-center gap-2 px-2 py-1.5" onClick={() => setCollapsed({ ...collapsed, [h.key]: !isCol })}>
                <Icon name="chevron" className={`h-3.5 w-3.5 text-mute transition ${isCol ? '' : 'rotate-90'}`} />
                <span className={`font-display text-sm font-semibold ${h.key === 'overdue' ? 'text-[#ff8a8a]' : ''}`}>{h.label}</span>
                {h.hint && <span className="text-[11px] text-mute">{h.hint}</span>}
                <span className="ml-auto font-mono text-xs text-mute">{list.length}</span>
              </button>
              {!isCol && (list.length ? list.map((t) => <TaskRow key={t.id} t={t} />) : <div className="px-3 py-3 text-sm text-mute">Rien de prévu.</div>)}
            </section>
          )
        })}
        <button className="px-2 text-xs text-mute hover:text-ink" onClick={() => setShowDone(!showDone)}>{showDone ? 'Masquer' : 'Afficher'} les tâches terminées ({groups.done?.length || 0})</button>
        {showDone && <section className="card p-2">{(groups.done || []).slice(0, 100).map((t) => <TaskRow key={t.id} t={t} compact />)}</section>}
      </div>
    </Page>
  )
}

// ───────── Inbox / Brain dump ─────────
export function InboxView() {
  const ents = useData((s) => s.entities)
  const items = Object.values(ents).filter((e) => e.inbox && !e.archived && !e.done).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const [text, setText] = useState('')
  const data = useData.getState()
  const ui = useUI.getState()
  return (
    <Page title="Inbox" sub="Capture d’abord, organise ensuite.">
      <form className="card mb-5 flex items-center gap-2 px-3 py-2" onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; data.create({ type: 'idea', title: text.trim(), inbox: true }); setText('') }}>
        <Icon name="bolt" className="h-4 w-4 text-mute" />
        <input autoFocus className="flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-mute/70" placeholder="Une pensée, une idée, un truc à ne pas oublier…" value={text} onChange={(e) => setText(e.target.value)} />
      </form>
      {!items.length ? <Empty title="Inbox vide" hint="Tout est rangé. Utilise « Capture rapide » n’importe où." /> : (
        <div className="space-y-2">
          {items.map((e) => (
            <div key={e.id} className="card group flex flex-wrap items-center gap-2 px-3 py-2.5">
              <TypeGlyph e={e} size="sm" />
              <button className="min-w-0 flex-1 truncate text-left text-sm" onClick={() => ui.open(e.id)}>{e.title}</button>
              <div className="flex flex-wrap gap-1">
                <select className="chip bg-transparent !py-1" value={e.type} onChange={(ev) => data.update(e.id, { type: ev.target.value as EntityType })}>
                  {(['task', 'idea', 'note', 'project', 'objective', 'person', 'link'] as EntityType[]).map((t) => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
                </select>
                {e.type === 'task' && <button className="chip !py-1 hover:!text-ink" onClick={() => data.update(e.id, { date: today(), inbox: false })}>Aujourd’hui</button>}
                <button className="chip !py-1 hover:!text-ink" onClick={() => ui.set({ addTo: { sourceId: e.id, mode: 'move' } })}>Ranger dans…</button>
                <button className="chip !py-1 hover:!text-ink" onClick={() => ui.set({ addTo: { sourceId: e.id, mode: 'link' } })}>Ajouter à…</button>
                <button className="chip !py-1 hover:!text-ink" onClick={() => data.update(e.id, { inbox: false })} title="Marquer comme traité">✓</button>
                <button className="chip !py-1 hover:!text-[#ff7a7a]" onClick={() => data.remove(e.id)}>×</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Page>
  )
}

// ───────── Notes ─────────
const NOTE_TYPES: { t: EntityType; label: string; desc?: string }[] = [
  { t: 'text', label: 'Note courte' }, { t: 'note', label: 'Note longue' }, { t: 'checklist', label: 'Checklist' }, { t: 'idea', label: 'Idée' }, { t: 'document', label: 'Document lié' }
]
export function NotesView() {
  const ents = useData((s) => s.entities)
  const [filter, setFilter] = useState('')
  const [kind, setKind] = useState<'all' | EntityType>('all')
  const notes = Object.values(ents)
    .filter((e) => ['note', 'idea', 'text', 'checklist', 'document', 'link'].includes(e.type) && !e.archived)
    .filter((e) => kind === 'all' || e.type === kind)
    .filter((e) => !filter || e.projectIds?.includes(filter) || e.linkedIds?.includes(filter) || e.parentId === filter)
    .sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite) || b.updatedAt.localeCompare(a.updatedAt))
  const projects = Object.values(ents).filter((e) => ['project', 'subproject', 'objective', 'category'].includes(e.type) && !e.archived)
  const make = (t: EntityType) => {
    const n = useData.getState().create({ type: t, title: '', projectIds: filter ? [filter] : undefined, checklist: t === 'checklist' ? [] : undefined })
    useUI.getState().open(n.id)
  }
  return (
    <Page title="Notes" actions={<select className="input !w-auto !py-1.5 text-xs" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">Toutes</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select>}>
      <div className="mb-4 flex flex-wrap gap-1.5" data-dropzone="notes">
        {NOTE_TYPES.map((n) => <button key={n.t} className="btn-soft text-xs" onClick={() => make(n.t)}><span style={{ color: TYPE_META[n.t].tint }}>{TYPE_META[n.t].glyph}</span>{n.label}</button>)}
      </div>
      <div className="mb-4"><Segmented value={kind} onChange={setKind} options={[{ value: 'all', label: 'Tout' }, { value: 'note', label: 'Notes' }, { value: 'idea', label: 'Idées' }, { value: 'checklist', label: 'Checklists' }, { value: 'document', label: 'Docs' }]} /></div>
      {!notes.length ? <Empty title="Aucune note" hint="Crée une note, ou envoie un élément de la map vers les Notes." /> : (
        <div className="columns-1 gap-3 sm:columns-2 lg:columns-3">
          {notes.map((n) => {
            const links = [...(n.projectIds || []), ...(n.linkedIds || [])].map((l) => ents[l]).filter(Boolean).slice(0, 3)
            return (
              <button key={n.id} draggable onDragStart={(e) => e.dataTransfer.setData('application/orbite', n.id)} onClick={() => useUI.getState().open(n.id)} className="card mb-3 block w-full break-inside-avoid p-4 text-left transition hover:border-accent/40">
                <div className="mb-1 flex items-center gap-2 text-[11px] text-mute"><span style={{ color: TYPE_META[n.type].tint }}>{TYPE_META[n.type].glyph}</span>{TYPE_META[n.type].label}{n.favorite && <span className="text-[#f2b45a]">★</span>}{n.mapId && <span title="Présente sur une map">◎</span>}</div>
                <div className="font-medium leading-snug">{n.title || 'Sans titre'}</div>
                {n.description && <div className="mt-1.5 line-clamp-4 text-[13px] text-mute">{plainExcerpt(n.description, 220)}</div>}
                {n.checklist?.length ? <div className="mt-2 text-[12px] text-mute">☑ {n.checklist.filter((c) => c.done).length}/{n.checklist.length}</div> : null}
                {links.length > 0 && <div className="mt-2.5 flex flex-wrap gap-1">{links.map((l) => <span key={l.id} className="chip !text-[10.5px]" style={{ color: l.color }}>{l.icon || TYPE_META[l.type].glyph} {l.title}</span>)}</div>}
                <div className="mt-2 text-[10.5px] text-mute/70">{fmtDay(n.updatedAt.slice(0, 10))}</div>
              </button>
            )
          })}
        </div>
      )}
    </Page>
  )
}

// ───────── Projets ─────────
export function ProjectsView() {
  const ents = useData((s) => s.entities)
  const [showArchived, setShowArchived] = useState(false)
  const list = Object.values(ents).filter((e) => (e.type === 'project' || e.type === 'subproject') && !!e.archived === showArchived)
  const statuses = useData((s) => s.settings.statuses)
  const order = (s?: string) => { const i = statuses.findIndex((x) => x.id === s); return i < 0 ? 99 : ['doing', 'blocked', 'waiting', 'todo', 'backlog', 'done'].indexOf(s!) }
  const tops = list.filter((p) => p.type === 'project').sort((a, b) => order(a.status) - order(b.status))
  const subsOf = (id: string) => list.filter((p) => p.type === 'subproject' && (p.parentId === id))
  const orphanSubs = list.filter((p) => p.type === 'subproject' && !tops.some((t) => t.id === p.parentId))
  return (
    <Page title="Projets" actions={<>
      <button className="btn-soft text-xs" onClick={() => setShowArchived(!showArchived)}>{showArchived ? 'Actifs' : 'Archivés'}</button>
      <button className="btn-primary text-xs" onClick={() => { const p = useData.getState().create({ type: 'project', title: 'Nouveau projet' }); useUI.getState().open(p.id) }}><Icon name="plus" className="h-4 w-4" />Projet</button>
    </>}>
      {!tops.length && !orphanSubs.length ? <Empty title="Aucun projet" /> : (
        <div className="grid gap-3 md:grid-cols-2">
          {[...tops, ...orphanSubs].map((p) => <ProjectCard key={p.id} p={p} subs={subsOf(p.id)} />)}
        </div>
      )}
    </Page>
  )
}

function ProjectCard({ p, subs }: { p: Entity; subs: Entity[] }) {
  const ents = useData((s) => s.entities)
  const c = relationCounts(ents, p.id)
  const prog = progressOf(ents, p)
  return (
    <div className="card p-4">
      <button className="w-full text-left" onClick={() => useUI.getState().open(p.id)}>
        <div className="flex items-start gap-3">
          <TypeGlyph e={p} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-[15px] font-semibold">{p.title}</div>
            <div className="mt-0.5 flex items-center gap-2"><StatusPill status={p.status} />{p.deadline && <span className="text-[11px] text-mute">⚑ {fmtDay(p.deadline)}</span>}</div>
          </div>
        </div>
        <div className="mt-3"><ProgressBar value={prog ?? 0} color={p.color} /></div>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-mute">
          <span><b className="text-ink">{c.tasks}</b> tâches</span><span><b className="text-ink">{c.objectives}</b> objectifs</span><span><b className="text-ink">{c.notes}</b> notes</span><span><b className="text-ink">{c.documents}</b> docs</span><span><b className="text-ink">{c.milestones}</b> jalons</span>
        </div>
      </button>
      {subs.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-line/60 pt-2">
          {subs.map((s) => (
            <button key={s.id} className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-[13px] hover:bg-ink/5" onClick={() => useUI.getState().open(s.id)}>
              <span className="text-mute">↳</span><span className="flex-1 truncate">{s.title}</span><span className="w-24"><ProgressBar value={progressOf(ents, s) ?? 0} color={p.color} slim showLabel={false} /></span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ───────── Objectifs ─────────
export function ObjectivesView() {
  const ents = useData((s) => s.entities)
  const list = Object.values(ents).filter((e) => e.type === 'objective' && !e.archived).sort((a, b) => (a.deadline || '9').localeCompare(b.deadline || '9'))
  const milestones = Object.values(ents).filter((e) => e.type === 'milestone' && !e.archived).sort((a, b) => (a.date || '9').localeCompare(b.date || '9'))
  const bar = (p: number) => '█'.repeat(Math.round(p / 10)) + '░'.repeat(10 - Math.round(p / 10))
  return (
    <Page title="Objectifs" sub="Vision → objectif → projet → tâches. Sans structure imposée." actions={<button className="btn-primary text-xs" onClick={() => { const o = useData.getState().create({ type: 'objective', title: 'Nouvel objectif' }); useUI.getState().open(o.id) }}><Icon name="plus" className="h-4 w-4" />Objectif</button>}>
      <div className="space-y-2">
        {list.map((o) => {
          const p = progressOf(ents, o) ?? 0
          const c = relationCounts(ents, o.id)
          return (
            <button key={o.id} className="card block w-full p-4 text-left transition hover:border-accent/40" onClick={() => useUI.getState().open(o.id)}>
              <div className="flex items-center gap-3">
                <TypeGlyph e={o} />
                <div className="min-w-0 flex-1"><div className="truncate font-medium">{o.title}</div><div className="text-[11.5px] text-mute">{c.projects} projets · {c.tasks} tâches{o.deadline ? ` · ⚑ ${fmtDay(o.deadline)}` : ''}</div></div>
                <div className="hidden font-mono text-[13px] tracking-tight md:block" style={{ color: o.color || '#6fe0b8' }}>{bar(p)}</div>
                <div className="w-12 text-right font-display text-lg font-semibold tabular-nums">{p}%</div>
              </div>
              <div className="mt-2 md:hidden"><ProgressBar value={p} color={o.color || '#6fe0b8'} showLabel={false} /></div>
            </button>
          )
        })}
        {!list.length && <Empty title="Aucun objectif" />}
      </div>
      <div className="mt-8">
        <div className="section-title mb-2 px-1">Jalons</div>
        <div className="relative ml-3 border-l border-line pl-5">
          {milestones.map((m) => (
            <button key={m.id} className="relative block w-full py-2 text-left" onClick={() => useUI.getState().open(m.id)}>
              <span className={`absolute -left-[26px] top-3 h-2.5 w-2.5 rotate-45 rounded-[2px] border-[1.5px] border-[#f4d58d] ${m.done ? 'bg-[#f4d58d]' : 'bg-bg'}`} />
              <div className={`text-sm ${m.done ? '' : 'text-ink/80'}`}>{m.title}</div>
              <div className="text-[11px] text-mute">{m.date ? fmtDay(m.date) : 'sans date'}{m.done ? ' · atteint' : ''}</div>
            </button>
          ))}
          {!milestones.length && <div className="py-2 text-sm text-mute">Aucun jalon. « Entreprise créée », « Visa obtenu »…</div>}
        </div>
      </div>
    </Page>
  )
}

// ───────── Favoris ─────────
export function FavoritesView() {
  const ents = useData((s) => s.entities)
  const favs = Object.values(ents).filter((e) => e.favorite && !e.archived)
  const ui = useUI.getState()
  return (
    <Page title="Favoris">
      {!favs.length ? <Empty title="Aucun favori" hint="Étoile une map, un projet, une note ou une branche." /> : (
        <div className="grid gap-2 sm:grid-cols-2">
          {favs.map((f) => {
            const r = resolve(ents, f)
            return (
              <button key={f.id} className="card flex items-center gap-3 p-3 text-left hover:border-accent/40" onClick={() => { if (f.type === 'map') { useData.getState().setSettings({ activeMapId: f.id }); ui.go('map') } else ui.open(f.id) }}>
                <TypeGlyph e={r} />
                <div className="min-w-0"><div className="truncate text-sm font-medium">{displayTitle(ents, f)}</div><div className="truncate text-[11px] text-mute">{TYPE_META[r.type].label}{f.parentId ? ` · ${pathLabel(ents, f.id)}` : ''}</div></div>
              </button>
            )
          })}
        </div>
      )}
    </Page>
  )
}

// ───────── Maps ─────────
export function MapsView() {
  const ents = useData((s) => s.entities)
  const active = useData((s) => s.settings.activeMapId)
  const maps = Object.values(ents).filter((e) => e.type === 'map' && !e.archived)
  const [name, setName] = useState('')
  const create = () => {
    const s = useData.getState()
    const m = s.create({ type: 'map', title: name.trim() || 'Nouvelle map', icon: '◎' })
    s.create({ type: 'vision', title: (name.trim() || 'Nouvelle map').toUpperCase(), mapId: m.id, x: 0, y: 0 })
    s.setSettings({ activeMapId: m.id })
    setName('')
    useUI.getState().go('map')
  }
  return (
    <Page title="Maps" sub="Une grande map de ta vie, ou plusieurs maps liées entre elles.">
      <form className="card mb-5 flex gap-2 p-2" onSubmit={(e) => { e.preventDefault(); create() }}>
        <input className="flex-1 bg-transparent px-3 text-sm outline-none" placeholder="Nom de la nouvelle map" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn-primary text-xs">Créer</button>
      </form>
      <div className="grid gap-3 sm:grid-cols-2">
        {maps.map((m) => {
          const count = Object.values(ents).filter((e) => e.mapId === m.id).length
          const links = Object.values(ents).filter((e) => e.type === 'maplink' && (e.mapId === m.id || e.targetMapId === m.id))
          return (
            <div key={m.id} className={`card p-4 ${m.id === active ? 'border-accent/50' : ''}`}>
              <div className="flex items-center gap-3">
                <span className="text-2xl text-accent">{m.icon || '◎'}</span>
                <input className="min-w-0 flex-1 bg-transparent font-display text-[15px] font-semibold outline-none" defaultValue={m.title} onBlur={(e) => e.target.value.trim() && useData.getState().update(m.id, { title: e.target.value.trim() })} />
                <button className={`text-sm ${m.favorite ? 'text-[#f2b45a]' : 'text-mute'}`} onClick={() => useData.getState().update(m.id, { favorite: !m.favorite })}>{m.favorite ? '★' : '☆'}</button>
              </div>
              <div className="mt-1 text-xs text-mute">{count} éléments{links.length ? ` · ${links.length} lien(s) de map` : ''}</div>
              <div className="mt-3 flex gap-2">
                <button className="btn-soft text-xs" onClick={() => { useData.getState().setSettings({ activeMapId: m.id }); useUI.getState().go('map') }}>Ouvrir</button>
                <button className="btn-ghost text-xs" onClick={() => useUI.getState().set({ share: m.id })}>Partager</button>
                <button className="btn-ghost text-xs text-[#ff7a7a]" onClick={() => {
                  if (!confirm(`Supprimer la map « ${m.title} » et ses ${count} éléments ?`)) return
                  const s = useData.getState()
                  Object.values(s.entities).filter((e) => e.mapId === m.id).forEach((e) => useData.getState().entities[e.id] && useData.getState().remove(e.id))
                  s.remove(m.id)
                  const left = Object.values(useData.getState().entities).find((e) => e.type === 'map')
                  useData.getState().setSettings({ activeMapId: left?.id })
                }}>Supprimer</button>
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-4 px-1 text-xs text-mute">Pour lier deux maps : sur une map, double-clic sur le vide → « Lien de Map », puis choisis la map cible dans la fiche.</p>
    </Page>
  )
}
