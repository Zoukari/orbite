import { useMemo, useState } from 'react'
import { useData, useUI, relatedTasks, ancestors, progressOf, placeChild } from '../lib/store'
import { TaskRow } from './TaskRow'
import { Icon, ProgressBar, TypeGlyph } from './ui'
import type { Entity } from '../lib/types'

// Projet → Objectifs → Tâches. Une seule hiérarchie, réutilisée
// dans la page Tâches et dans la sidebar droite de la Map.

interface Group { obj: Entity; tasks: Entity[] }
interface Block { project: Entity | null; groups: Group[]; direct: Entity[] }

const isProject = (e: Entity) => e.type === 'project'
const isGroup = (e: Entity) => e.type === 'objective' || e.type === 'subproject'

function projectOf(ents: Record<string, Entity>, e: Entity): string | null {
  const anc = ancestors(ents, e.id).reverse().find(isProject)
  if (anc) return anc.id
  const p = e.projectIds?.find((id) => ents[id] && isProject(ents[id]))
  if (p) return p
  const viaSub = e.projectIds?.map((id) => ents[id]).find((x) => x?.type === 'subproject')
  return viaSub ? projectOf(ents, viaSub) : null
}

export function useProjectBlocks(showDone: boolean) {
  const ents = useData((s) => s.entities)
  return useMemo(() => {
    const all = Object.values(ents).filter((e) => !e.archived)
    const blocks = new Map<string, Block>()
    const loose: Block = { project: null, groups: [], direct: [] }
    for (const p of all.filter(isProject)) blocks.set(p.id, { project: p, groups: [], direct: [] })
    const claimed = new Set<string>()
    const keep = (t: Entity) => showDone || !t.done
    // les groupes les plus profonds réclament leurs tâches en premier : pas de doublon
    const groups = all.filter(isGroup).map((g) => ({ g, depth: ancestors(ents, g.id).length })).sort((a, b) => b.depth - a.depth)
    const built: { pid: string | null; grp: Group; depth: number }[] = []
    for (const { g, depth } of groups) {
      const tasks = relatedTasks(ents, g.id).filter((t) => keep(t) && !claimed.has(t.id))
      tasks.forEach((t) => claimed.add(t.id))
      // un sous-projet vide qui ne sert que de dossier n'est pas affiché
      if (g.type === 'subproject' && !tasks.length && all.some((x) => isGroup(x) && x.parentId === g.id)) continue
      built.push({ pid: projectOf(ents, g), grp: { obj: g, tasks }, depth })
    }
    built.sort((a, b) => a.depth - b.depth || (a.grp.obj.y ?? 0) - (b.grp.obj.y ?? 0))
    for (const x of built) (x.pid && blocks.get(x.pid) ? blocks.get(x.pid)! : loose).groups.push(x.grp)
    for (const b of blocks.values()) {
      b.direct = relatedTasks(ents, b.project!.id).filter((t) => !claimed.has(t.id) && keep(t))
      b.direct.forEach((t) => claimed.add(t.id))
    }
    loose.direct = all.filter((t) => t.type === 'task' && !claimed.has(t.id) && keep(t))
    const sortT = (a: Entity, b: Entity) => Number(!!a.done) - Number(!!b.done) || (a.date || '9').localeCompare(b.date || '9') || (b.priority ?? 0) - (a.priority ?? 0)
    const list = [...blocks.values(), loose]
    for (const b of list) { b.direct.sort(sortT); b.groups.forEach((g) => g.tasks.sort(sortT)) }
    const order = ['doing', 'blocked', 'waiting', 'todo', 'backlog', 'done']
    list.sort((a, b) => (a.project ? order.indexOf(a.project.status || 'todo') : 99) - (b.project ? order.indexOf(b.project.status || 'todo') : 99))
    return list.filter((b) => b.project || b.groups.length || b.direct.length)
  }, [ents, showDone])
}

export function ProjectTree({ compact, showDone = false }: { compact?: boolean; showDone?: boolean }) {
  const blocks = useProjectBlocks(showDone)
  const [newProject, setNewProject] = useState('')
  return (
    <div className="space-y-2.5">
      {blocks.map((b) => <ProjectBlock key={b.project?.id ?? 'loose'} b={b} compact={compact} />)}
      <form className="flex items-center gap-2 rounded-2xl border border-dashed border-line/70 px-3 py-2" onSubmit={(e) => { e.preventDefault(); if (!newProject.trim()) return; useData.getState().create({ type: 'project', title: newProject.trim(), status: 'todo' }); setNewProject('') }}>
        <Icon name="plus" className="h-4 w-4 text-mute" />
        <input className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-mute/70" placeholder="Nouveau projet" value={newProject} onChange={(e) => setNewProject(e.target.value)} />
      </form>
    </div>
  )
}

function ProjectBlock({ b, compact }: { b: Block; compact?: boolean }) {
  const ents = useData((s) => s.entities)
  const key = 'orbite.open.' + (b.project?.id ?? 'loose')
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(key) !== '0' } catch { return true } })
  const toggle = () => { setOpen(!open); try { localStorage.setItem(key, open ? '0' : '1') } catch {} }
  const [adding, setAdding] = useState<null | 'objective' | 'task'>(null)
  const [txt, setTxt] = useState('')
  const p = b.project
  const openCount = b.direct.filter((t) => !t.done).length + b.groups.reduce((s, g) => s + g.tasks.filter((t) => !t.done).length, 0)
  const prog = p ? progressOf(ents, p) : null
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const t = txt.trim()
    if (!t) return
    const s = useData.getState()
    if (adding === 'objective') {
      const pos = p?.mapId ? placeChild(s.entities, p) : {}
      s.create({ type: 'objective', title: t, parentId: p?.id ?? null, mapId: p?.mapId ?? null, projectIds: p ? [p.id] : undefined, ...pos })
    } else s.create({ type: 'task', title: t, projectIds: p ? [p.id] : undefined })
    setTxt('')
  }
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button onClick={toggle} className="text-mute"><Icon name="chevron" className={`h-3.5 w-3.5 transition ${open ? 'rotate-90' : ''}`} /></button>
        {p ? <TypeGlyph e={p} size="sm" /> : <span className="flex h-5 w-5 items-center justify-center text-mute">○</span>}
        <button className="min-w-0 flex-1 truncate text-left text-[14px] font-semibold" onClick={() => (p ? useUI.getState().open(p.id) : toggle())}>{p ? p.title : 'Sans projet'}</button>
        {prog != null && !compact && <span className="w-20"><ProgressBar value={prog} color={p?.color} slim showLabel={false} /></span>}
        <span className="font-mono text-[11px] text-mute">{openCount}</span>
      </div>
      {open && (
        <div className="border-t border-line/50 px-1.5 pb-1.5 pt-1">
          {b.groups.map((g) => <ObjectiveGroup key={g.obj.id} g={g} project={p} compact={compact} />)}
          {b.direct.length > 0 && (
            <div className={b.groups.length ? 'mt-1' : ''}>
              {b.groups.length > 0 && <div className="px-2 pb-0.5 pt-1.5 text-[10.5px] font-medium uppercase tracking-[0.1em] text-mute/80">Autres tâches</div>}
              {b.direct.map((t) => <TaskRow key={t.id} t={t} compact={compact} />)}
            </div>
          )}
          {adding ? (
            <form onSubmit={submit} className="flex items-center gap-2 px-2 py-1.5">
              <span className="w-4 text-center text-[13px]" style={{ color: adding === 'objective' ? '#6fe0b8' : undefined }}>{adding === 'objective' ? '◉' : '○'}</span>
              <input autoFocus className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-mute/70" placeholder={adding === 'objective' ? 'Nouvel objectif' : 'Nouvelle tâche'} value={txt} onChange={(e) => setTxt(e.target.value)} onBlur={() => !txt && setAdding(null)} onKeyDown={(e) => e.key === 'Escape' && setAdding(null)} />
            </form>
          ) : (
            <div className="flex gap-1 px-1 pt-0.5">
              <button className="rounded-lg px-2 py-1 text-[11.5px] text-mute hover:bg-ink/5 hover:text-ink" onClick={() => setAdding('task')}>+ Tâche</button>
              <button className="rounded-lg px-2 py-1 text-[11.5px] text-mute hover:bg-ink/5 hover:text-ink" onClick={() => setAdding('objective')}>+ Objectif</button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function ObjectiveGroup({ g, project, compact }: { g: Group; project: Entity | null; compact?: boolean }) {
  const ents = useData((s) => s.entities)
  const [txt, setTxt] = useState('')
  const [adding, setAdding] = useState(false)
  const key = 'orbite.open.' + g.obj.id
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(key) !== '0' } catch { return true } })
  const toggle = () => { setOpen(!open); try { localStorage.setItem(key, open ? '0' : '1') } catch {} }
  const prog = progressOf(ents, g.obj) ?? 0
  const left = g.tasks.filter((t) => !t.done).length
  return (
    <div className="mt-1 rounded-xl bg-ink/[0.025]">
      <div className="flex items-center gap-2 px-2 py-1.5">
        <button onClick={toggle} className="text-mute"><Icon name="chevron" className={`h-3 w-3 transition ${open ? 'rotate-90' : ''}`} /></button>
        <span className="text-[12px]" style={{ color: g.obj.color || (g.obj.type === 'objective' ? '#6fe0b8' : '#86b7ff') }}>{g.obj.icon || (g.obj.type === 'objective' ? '◉' : '▢')}</span>
        <button className="min-w-0 flex-1 truncate text-left text-[13px] font-medium" onClick={() => useUI.getState().open(g.obj.id)}>{g.obj.title}</button>
        <span className="w-14"><ProgressBar value={prog} color={g.obj.color || '#6fe0b8'} slim showLabel={false} /></span>
        <span className="w-6 text-right font-mono text-[10.5px] text-mute">{left}</span>
      </div>
      {open && (
        <div className="pb-1 pl-3">
          {g.tasks.map((t) => <TaskRow key={t.id} t={t} compact={compact} />)}
          {adding ? (
            <form className="flex items-center gap-2 px-2 py-1" onSubmit={(e) => { e.preventDefault(); if (!txt.trim()) return; useData.getState().create({ type: 'task', title: txt.trim(), objectiveIds: g.obj.type === 'objective' ? [g.obj.id] : undefined, projectIds: [...(project ? [project.id] : []), ...(g.obj.type === 'subproject' ? [g.obj.id] : [])] }); setTxt('') }}>
              <span className="w-4 text-center text-[12px] text-mute">○</span>
              <input autoFocus className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-mute/70" placeholder="Nouvelle tâche" value={txt} onChange={(e) => setTxt(e.target.value)} onBlur={() => !txt && setAdding(false)} onKeyDown={(e) => e.key === 'Escape' && setAdding(false)} />
            </form>
          ) : (
            <button className="px-2 py-1 text-[11.5px] text-mute hover:text-ink" onClick={() => setAdding(true)}>+ Tâche</button>
          )}
        </div>
      )}
    </div>
  )
}
