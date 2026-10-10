import { useMemo, useState, type ReactNode } from 'react'
import { useData, useUI, relatedTasks, ancestors, descendants, progressOf, placeChild } from '../lib/store'
import { fmtDay } from '../lib/dates'
import { TaskRow } from './TaskRow'
import { Icon, ProgressBar } from './ui'
import type { Entity } from '../lib/types'

// Hiérarchie unique : Catégorie → Projet → Objectif → Tâches & Jalons.
// Réutilisée dans la page « Projets » et dans la sidebar droite de la Map.

interface Group { obj: Entity | null; items: Entity[] } // obj null = « Sans objectif »
interface ProjectBlock { project: Entity; groups: Group[] }
interface Section { cat: Entity | null; projects: ProjectBlock[]; groups: Group[] }

const isProject = (e: Entity) => e.type === 'project'
const isGroup = (e: Entity) => e.type === 'objective' || e.type === 'subproject'
const isItem = (e: Entity) => e.type === 'task' || e.type === 'milestone'

function nearest(ents: Record<string, Entity>, e: Entity, pred: (x: Entity) => boolean, viaLinks = true): Entity | null {
  const anc = ancestors(ents, e.id).reverse().find(pred)
  if (anc) return anc
  if (!viaLinks) return null
  for (const id of [...(e.projectIds || []), ...(e.objectiveIds || [])]) {
    const x = ents[id]
    if (!x) continue
    if (pred(x)) return x
    const up = nearest(ents, x, pred, false)
    if (up) return up
  }
  return null
}

function itemsOf(ents: Record<string, Entity>, id: string) {
  const ms = descendants(ents, id).map((d) => ents[d]).filter((x) => x?.type === 'milestone')
  const linked = Object.values(ents).filter((x) => x.type === 'milestone' && (x.projectIds?.includes(id) || x.objectiveIds?.includes(id) || x.linkedIds?.includes(id)))
  return [...relatedTasks(ents, id), ...ms, ...linked]
}

export function usePlan(showDone: boolean) {
  const ents = useData((s) => s.entities)
  return useMemo(() => {
    const all = Object.values(ents).filter((e) => !e.archived)
    const keep = (t: Entity) => showDone || !t.done
    const claimed = new Set<string>()
    const sortItems = (a: Entity, b: Entity) => Number(!!a.done) - Number(!!b.done) || Number(a.type === 'milestone') - Number(b.type === 'milestone') || (a.date || '9').localeCompare(b.date || '9') || (b.priority ?? 0) - (a.priority ?? 0)
    const take = (list: Entity[]) => {
      const out: Entity[] = []
      for (const t of list) if (keep(t) && !claimed.has(t.id)) { claimed.add(t.id); out.push(t) }
      return out.sort(sortItems)
    }

    // objectifs : les plus profonds d'abord, chacun garde ses tâches
    const groupEnts = all.filter(isGroup).map((g) => ({ g, d: ancestors(ents, g.id).length })).sort((a, b) => b.d - a.d)
    const groups = new Map<string, Group>()
    for (const { g } of groupEnts) {
      const items = take(itemsOf(ents, g.id).filter(isItem))
      // un sous-projet qui ne sert que de dossier (il contient des objectifs) n'est pas affiché vide
      if (g.type === 'subproject' && !items.length && all.some((x) => isGroup(x) && x.parentId === g.id)) continue
      groups.set(g.id, { obj: g, items })
    }

    const sections = new Map<string, Section>()
    const other: Section = { cat: null, projects: [], groups: [] }
    const sectionOf = (e: Entity) => {
      const cat = nearest(ents, e, (x) => x.type === 'category')
      if (!cat) return other
      if (!sections.has(cat.id)) sections.set(cat.id, { cat, projects: [], groups: [] })
      return sections.get(cat.id)!
    }

    const projects = new Map<string, ProjectBlock>()
    for (const p of all.filter(isProject)) {
      const b: ProjectBlock = { project: p, groups: [] }
      projects.set(p.id, b)
      sectionOf(p).projects.push(b)
    }
    const posY = (g: Group) => g.obj?.y ?? 0
    for (const g of groups.values()) {
      const proj = nearest(ents, g.obj!, isProject)
      if (proj && projects.has(proj.id)) projects.get(proj.id)!.groups.push(g)
      else sectionOf(g.obj!).groups.push(g)
    }
    // tâches du projet hors objectif → section « Sans objectif » DANS le projet
    for (const b of projects.values()) {
      b.groups.sort((a, c) => posY(a) - posY(c))
      const rest = take(itemsOf(ents, b.project.id).filter(isItem))
      if (rest.length) b.groups.push({ obj: null, items: rest })
    }
    // le reste : rattaché à une catégorie ou « À classer »
    const loose = all.filter((t) => isItem(t) && !claimed.has(t.id) && keep(t))
    const byCat = new Map<Section, Entity[]>()
    for (const t of loose) {
      const s = sectionOf(t)
      byCat.set(s, [...(byCat.get(s) || []), t])
    }
    for (const [s, items] of byCat) s.groups.push({ obj: null, items: items.sort(sortItems) })

    const order = ['doing', 'blocked', 'waiting', 'todo', 'backlog', 'done']
    const list = [...sections.values()].sort((a, b) => (a.cat?.y ?? 0) - (b.cat?.y ?? 0))
    for (const s of [...list, other]) s.projects.sort((a, b) => order.indexOf(a.project.status || 'todo') - order.indexOf(b.project.status || 'todo'))
    return [...list, other].filter((s) => s.projects.length || s.groups.length)
  }, [ents, showDone])
}

function useOpen(key: string, def = true) {
  const k = 'orbite.open.' + key
  const [open, setOpen] = useState(() => { try { const v = localStorage.getItem(k); return v == null ? def : v !== '0' } catch { return def } })
  const toggle = () => { setOpen(!open); try { localStorage.setItem(k, open ? '0' : '1') } catch {} }
  return [open, toggle] as const
}

export function ProjectTree({ compact, showDone = false }: { compact?: boolean; showDone?: boolean }) {
  const sections = usePlan(showDone)
  const [newProject, setNewProject] = useState('')
  return (
    <div className="space-y-6">
      {sections.map((s) => <SectionView key={s.cat?.id ?? 'other'} s={s} compact={compact} />)}
      <form className="flex items-center gap-2 rounded-2xl border border-dashed border-line/70 px-3 py-2" onSubmit={(e) => { e.preventDefault(); if (!newProject.trim()) return; useData.getState().create({ type: 'project', title: newProject.trim(), status: 'todo' }); setNewProject('') }}>
        <Icon name="plus" className="h-4 w-4 text-mute" />
        <input className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-mute/70" placeholder="Nouveau projet" value={newProject} onChange={(e) => setNewProject(e.target.value)} />
      </form>
    </div>
  )
}

function SectionView({ s, compact }: { s: Section; compact?: boolean }) {
  const [open, toggle] = useOpen('cat.' + (s.cat?.id ?? 'other'))
  const cat = s.cat
  return (
    <section>
      <button onClick={toggle} className="mb-2 flex w-full items-center gap-2 px-1 text-left">
        <Icon name="chevron" className={`h-3 w-3 text-mute transition ${open ? 'rotate-90' : ''}`} />
        {cat && <span style={{ color: cat.color }}>{cat.icon || '◇'}</span>}
        <span className="font-display text-[12px] font-semibold uppercase tracking-[0.14em] text-mute">{cat ? cat.title : 'À classer'}</span>
        <span className="h-px flex-1 bg-line/60" />
      </button>
      {open && (
        <div className="space-y-2.5">
          {s.projects.map((b) => <ProjectCard key={b.project.id} b={b} compact={compact} />)}
          {s.groups.map((g, i) => (
            <div key={g.obj?.id ?? 'loose' + i} className="card px-1.5 py-1.5">
              <GroupView g={g} project={null} compact={compact} />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function ProjectCard({ b, compact }: { b: ProjectBlock; compact?: boolean }) {
  const ents = useData((s) => s.entities)
  const p = b.project
  const [open, toggle] = useOpen(p.id)
  const [adding, setAdding] = useState(false)
  const [txt, setTxt] = useState('')
  const color = p.color || '#7aa7ff'
  const prog = progressOf(ents, p)
  const left = b.groups.reduce((n, g) => n + g.items.filter((t) => !t.done && t.type === 'task').length, 0)
  const addObjective = (e: React.FormEvent) => {
    e.preventDefault()
    if (!txt.trim()) return
    const s = useData.getState()
    const pos = p.mapId ? placeChild(s.entities, p) : {}
    s.create({ type: 'objective', title: txt.trim(), parentId: p.id, mapId: p.mapId ?? null, ...pos })
    setTxt('')
  }
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2.5 px-3.5 py-3" style={{ background: `linear-gradient(90deg, ${color}14, transparent 60%)` }}>
        <button onClick={toggle} className="text-mute"><Icon name="chevron" className={`h-3.5 w-3.5 transition ${open ? 'rotate-90' : ''}`} /></button>
        <span className="text-[15px]" style={{ color }}>{p.icon || '▣'}</span>
        <button className="min-w-0 flex-1 truncate text-left font-display text-[15px] font-semibold" onClick={() => useUI.getState().open(p.id)}>{p.title}</button>
        {prog != null && !compact && <span className="w-24"><ProgressBar value={prog} color={color} slim /></span>}
        <span className="rounded-full bg-ink/[0.06] px-2 py-0.5 font-mono text-[10.5px] text-mute">{left}</span>
      </div>
      {open && (
        <div className="space-y-1.5 px-2 pb-2">
          {b.groups.map((g) => <GroupView key={g.obj?.id ?? 'none'} g={g} project={p} compact={compact} nested />)}
          {adding ? (
            <form onSubmit={addObjective} className="flex items-center gap-2 rounded-xl border border-dashed border-line/70 px-3 py-2">
              <span className="text-[12px] text-[#6fe0b8]">◉</span>
              <input autoFocus className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-mute/70" placeholder="Nouvel objectif" value={txt} onChange={(e) => setTxt(e.target.value)} onBlur={() => !txt && setAdding(false)} onKeyDown={(e) => e.key === 'Escape' && setAdding(false)} />
            </form>
          ) : (
            <button className="w-full rounded-xl border border-dashed border-line/60 px-3 py-1.5 text-left text-[12px] text-mute hover:border-accent/50 hover:text-ink" onClick={() => setAdding(true)}>+ Objectif</button>
          )}
        </div>
      )}
    </div>
  )
}

function GroupView({ g, project, compact, nested }: { g: Group; project: Entity | null; compact?: boolean; nested?: boolean }) {
  const ents = useData((s) => s.entities)
  const o = g.obj
  const [open, toggle] = useOpen(o?.id ?? 'none.' + (project?.id ?? 'x'))
  const [adding, setAdding] = useState<null | 'task' | 'milestone'>(null)
  const [txt, setTxt] = useState('')
  const color = o?.color || (o?.type === 'subproject' ? '#86b7ff' : '#6fe0b8')
  const prog = o ? progressOf(ents, o) ?? 0 : null
  const left = g.items.filter((t) => !t.done && t.type === 'task').length
  const add = (e: React.FormEvent) => {
    e.preventDefault()
    if (!txt.trim() || !adding) return
    const s = useData.getState()
    const links = {
      objectiveIds: o?.type === 'objective' ? [o.id] : undefined,
      projectIds: [...(project ? [project.id] : []), ...(o?.type === 'subproject' ? [o.id] : [])]
    }
    if (adding === 'milestone' && (o || project)) {
      const parent = o || project!
      const pos = parent.mapId ? placeChild(s.entities, parent) : {}
      s.create({ type: 'milestone', title: txt.trim(), parentId: parent.id, mapId: parent.mapId ?? null, ...pos })
    } else s.create({ type: adding === 'milestone' ? 'milestone' : 'task', title: txt.trim(), ...links })
    setTxt('')
  }
  const header: ReactNode = o ? (
    <div className="flex items-center gap-2 px-2.5 py-2">
      <button onClick={toggle} className="text-mute"><Icon name="chevron" className={`h-3 w-3 transition ${open ? 'rotate-90' : ''}`} /></button>
      <span className="text-[12px]" style={{ color }}>{o.icon || (o.type === 'objective' ? '◉' : '▢')}</span>
      <button className="min-w-0 flex-1 truncate text-left text-[13.5px] font-semibold" onClick={() => useUI.getState().open(o.id)}>{o.title}</button>
      {o.deadline && !compact && <span className="text-[10.5px] text-mute">⚑ {fmtDay(o.deadline)}</span>}
      <span className="w-14"><ProgressBar value={prog} color={color} slim showLabel={false} /></span>
      <span className="w-5 text-right font-mono text-[10.5px] text-mute">{left}</span>
    </div>
  ) : (
    <div className="flex items-center gap-2 px-2.5 py-2">
      <button onClick={toggle} className="text-mute"><Icon name="chevron" className={`h-3 w-3 transition ${open ? 'rotate-90' : ''}`} /></button>
      <span className="flex-1 text-[12px] font-medium text-mute">{project ? 'Sans objectif' : 'Tâches à classer'}</span>
      <span className="w-5 text-right font-mono text-[10.5px] text-mute">{left}</span>
    </div>
  )
  return (
    <div className={nested ? 'relative rounded-xl border border-line/50 bg-raised/40' : ''} style={nested && o ? { borderLeft: `3px solid ${color}88` } : undefined}>
      {header}
      {open && (
        <div className="ml-4 border-l border-line/60 pb-1.5 pl-1.5">
          {g.items.map((t) => (t.type === 'milestone' ? <MilestoneRow key={t.id} m={t} /> : <TaskRow key={t.id} t={t} compact={compact} hideProject />))}
          {!g.items.length && !adding && <div className="px-2 py-1 text-[12px] text-mute/70">Aucune tâche</div>}
          {adding ? (
            <form className="flex items-center gap-2 px-2 py-1.5" onSubmit={add}>
              <span className="w-4 text-center text-[12px] text-mute">{adding === 'milestone' ? '◆' : '○'}</span>
              <input autoFocus className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-mute/70" placeholder={adding === 'milestone' ? 'Nouveau jalon' : 'Nouvelle tâche'} value={txt} onChange={(e) => setTxt(e.target.value)} onBlur={() => !txt && setAdding(null)} onKeyDown={(e) => e.key === 'Escape' && setAdding(null)} />
            </form>
          ) : (
            <div className="flex gap-1 px-1">
              <button className="rounded-lg px-1.5 py-1 text-[11.5px] text-mute hover:bg-ink/5 hover:text-ink" onClick={() => setAdding('task')}>+ Tâche</button>
              {(o || project) && <button className="rounded-lg px-1.5 py-1 text-[11.5px] text-mute hover:bg-ink/5 hover:text-ink" onClick={() => setAdding('milestone')}>+ Jalon</button>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MilestoneRow({ m }: { m: Entity }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-ink/[0.04]">
      <button
        className="ml-[3px] h-3 w-3 shrink-0 rotate-45 rounded-[2px] border-[1.5px] border-[#f4d58d] transition hover:scale-110"
        style={{ background: m.done ? '#f4d58d' : 'transparent' }}
        onClick={() => useData.getState().update(m.id, { done: !m.done, status: m.done ? 'todo' : 'done', doneAt: m.done ? null : new Date().toISOString() })}
        title="Atteint"
      />
      <button className={`min-w-0 flex-1 truncate text-left text-[13.5px] ${m.done ? 'text-mute' : ''}`} onClick={() => useUI.getState().open(m.id)}>{m.title}</button>
      {m.date && <span className="text-[11px] text-mute">{fmtDay(m.date)}</span>}
    </div>
  )
}
