import { useMemo, useState, type ReactNode } from 'react'
import { useData, useUI, progressOf, placeChild, ancestors } from '../lib/store'
import { fmtDay } from '../lib/dates'
import { TYPE_META } from '../lib/meta'
import { TaskRow } from './TaskRow'
import { Icon, ProgressBar } from './ui'
import type { Entity, EntityType } from '../lib/types'

// ─────────────────────────────────────────────────────────────
// Hiérarchie : Projet → Sous-projet → Vision → Objectif → Jalon → Tâche
// Chaque élément est rangé sous son « parent de plan » : le parent direct
// s'il fait partie du plan, sinon le premier lien (objectif / projet).
// ─────────────────────────────────────────────────────────────

export const PLAN_TYPES: EntityType[] = ['category', 'project', 'subproject', 'vision', 'objective', 'milestone', 'task']
// le centre d'une map (vision sans parent, ex. « Zouk's Life ») n'est pas une vraie vision du plan
export const isMapCenter = (e: Entity) => e.type === 'vision' && !e.parentId && !!e.mapId
export const isPlan = (e?: Entity) => !!e && PLAN_TYPES.includes(e.type) && !e.archived && !isMapCenter(e)
const CONTAINERS: EntityType[] = ['category', 'project', 'subproject']
const ORDER: Record<string, number> = { category: 0, project: 1, subproject: 2, vision: 3, objective: 4, milestone: 5, task: 6 }

export function planParent(ents: Record<string, Entity>, e: Entity): Entity | null {
  if (e.parentId && isPlan(ents[e.parentId])) return ents[e.parentId]
  // parent direct hors plan (ex. catégorie de la map supprimée) : on remonte
  if (e.parentId) { const up = ancestors(ents, e.id).reverse().find(isPlan); if (up) return up }
  for (const id of [...(e.objectiveIds || []), ...(e.projectIds || [])]) if (isPlan(ents[id]) && ents[id].id !== e.id) return ents[id]
  return null
}

function useTree(showDone: boolean) {
  const ents = useData((s) => s.entities)
  return useMemo(() => {
    const kids = new Map<string, Entity[]>()
    const roots: Entity[] = []
    for (const e of Object.values(ents)) {
      if (!isPlan(e)) continue
      if (e.type === 'task' && e.done && !showDone) continue
      const p = planParent(ents, e)
      if (p) { const a = kids.get(p.id) || []; a.push(e); kids.set(p.id, a) }
      else roots.push(e)
    }
    const sort = (a: Entity, b: Entity) =>
      (ORDER[a.type] ?? 9) - (ORDER[b.type] ?? 9) ||
      (a.type === 'task' ? Number(!!a.done) - Number(!!b.done) || (a.date || '9').localeCompare(b.date || '9') : 0) ||
      (a.type === 'milestone' ? (a.done ? '0' + (a.doneAt || '') : a.date || '9').localeCompare(b.done ? '0' + (b.doneAt || '') : b.date || '9') : 0) ||
      (a.y ?? 0) - (b.y ?? 0)
    for (const a of kids.values()) a.sort(sort)
    const top = roots.filter((r) => r.type !== 'task' && r.type !== 'milestone').sort(sort)
    const loose = roots.filter((r) => r.type === 'task' || r.type === 'milestone').sort(sort)
    return { kids, top, loose }
  }, [ents, showDone])
}

function useOpen(key: string, def = true) {
  const k = 'orbite.open.' + key
  const [open, setOpen] = useState(() => { try { const v = localStorage.getItem(k); return v == null ? def : v !== '0' } catch { return def } })
  const toggle = () => { setOpen(!open); try { localStorage.setItem(k, open ? '0' : '1') } catch {} }
  return [open, toggle] as const
}

function addChild(parent: Entity | null, type: EntityType, title: string) {
  const s = useData.getState()
  if (!parent) return s.create({ type, title, status: CONTAINERS.includes(type) ? 'todo' : undefined })
  const pos = parent.mapId ? placeChild(s.entities, parent) : {}
  return s.create({ type, title, parentId: parent.id, mapId: parent.mapId ?? null, ...pos })
}

const ADDS: Partial<Record<EntityType, EntityType[]>> = {
  category: ['project', 'subproject', 'vision', 'objective'],
  project: ['subproject', 'vision', 'objective', 'task'],
  subproject: ['vision', 'objective', 'task'],
  vision: ['objective'],
  objective: ['milestone', 'task'],
  milestone: ['task']
}
const LABEL: Partial<Record<EntityType, string>> = { project: 'Projet', subproject: 'Sous-projet', vision: 'Vision', objective: 'Objectif', milestone: 'Jalon', task: 'Tâche' }

type Tree = ReturnType<typeof useTree>
type Ctx = { tree: Tree; compact?: boolean; showDone: boolean }

export function ProjectTree({ compact, showDone = false }: { compact?: boolean; showDone?: boolean }) {
  const tree = useTree(showDone)
  const ctx: Ctx = { tree, compact, showDone }
  const [txt, setTxt] = useState('')
  return (
    <div className="space-y-3">
      {tree.top.map((e) => <Node key={e.id} e={e} ctx={ctx} depth={0} />)}
      {tree.loose.length > 0 && (
        <div className="card px-1.5 py-1.5">
          <div className="px-2.5 py-1.5 text-[12px] font-medium text-mute">À classer</div>
          {tree.loose.map((e) => <Node key={e.id} e={e} ctx={ctx} depth={1} />)}
        </div>
      )}
      <form className="flex items-center gap-2 rounded-2xl border border-dashed border-line/70 px-3 py-2" onSubmit={(e) => { e.preventDefault(); if (!txt.trim()) return; addChild(null, 'project', txt.trim()); setTxt('') }}>
        <Icon name="plus" className="h-4 w-4 text-mute" />
        <input className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-mute/70" placeholder="Nouveau projet (ex. Vie personnelle)" value={txt} onChange={(e) => setTxt(e.target.value)} />
      </form>
    </div>
  )
}

function Node({ e, ctx, depth }: { e: Entity; ctx: Ctx; depth: number }) {
  if (e.type === 'task') return <TaskRow t={e} compact={ctx.compact} hideProject />
  if (e.type === 'milestone') return <MilestoneNode m={e} ctx={ctx} />
  if (e.type === 'objective') return <ObjectiveNode o={e} ctx={ctx} />
  if (e.type === 'vision') return <VisionNode v={e} ctx={ctx} />
  return <ContainerNode c={e} ctx={ctx} depth={depth} />
}

function Children({ e, ctx, depth }: { e: Entity; ctx: Ctx; depth: number }) {
  const list = ctx.tree.kids.get(e.id) || []
  return <>{list.map((k) => <Node key={k.id} e={k} ctx={ctx} depth={depth + 1} />)}</>
}

function AddBar({ parent }: { parent: Entity }) {
  const types = ADDS[parent.type] || []
  const [adding, setAdding] = useState<EntityType | null>(null)
  const [txt, setTxt] = useState('')
  if (!types.length) return null
  if (adding)
    return (
      <form className="flex items-center gap-2 rounded-xl border border-dashed border-line/70 px-3 py-1.5" onSubmit={(ev) => { ev.preventDefault(); if (!txt.trim()) return; addChild(parent, adding, txt.trim()); setTxt('') }}>
        <span className="w-4 text-center text-[12px]" style={{ color: TYPE_META[adding].tint }}>{TYPE_META[adding].glyph}</span>
        <input autoFocus className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-mute/70" placeholder={`Nouveau ${LABEL[adding]?.toLowerCase()}`} value={txt} onChange={(ev) => setTxt(ev.target.value)} onBlur={() => !txt && setAdding(null)} onKeyDown={(ev) => ev.key === 'Escape' && setAdding(null)} />
      </form>
    )
  return (
    <div className="flex flex-wrap gap-1 px-1 pt-0.5">
      {types.map((t) => (
        <button key={t} className="rounded-lg px-1.5 py-1 text-[11.5px] text-mute hover:bg-ink/5 hover:text-ink" onClick={() => setAdding(t)}>+ {LABEL[t]}</button>
      ))}
    </div>
  )
}

function Header({ e, open, toggle, size = 'md', right }: { e: Entity; open: boolean; toggle: () => void; size?: 'lg' | 'md' | 'sm'; right?: ReactNode }) {
  const color = e.color || TYPE_META[e.type].tint
  return (
    <div className={`flex items-center gap-2 ${size === 'lg' ? 'px-3.5 py-3' : 'px-2.5 py-2'}`} style={size === 'lg' ? { background: `linear-gradient(90deg, ${color}18, transparent 60%)` } : undefined}>
      <button onClick={toggle} className="text-mute"><Icon name="chevron" className={`h-3 w-3 transition ${open ? 'rotate-90' : ''}`} /></button>
      <span className={size === 'lg' ? 'text-[15px]' : 'text-[13px]'} style={{ color }}>{e.icon || TYPE_META[e.type].glyph}</span>
      <button className={`min-w-0 flex-1 truncate text-left ${size === 'lg' ? 'font-display text-[15px] font-semibold' : 'text-[13.5px] font-semibold'} ${e.done ? 'text-mute' : ''}`} onClick={() => useUI.getState().open(e.id)}>
        {e.title || 'Sans titre'}
      </button>
      {right}
    </div>
  )
}

function ContainerNode({ c, ctx, depth }: { c: Entity; ctx: Ctx; depth: number }) {
  const ents = useData((s) => s.entities)
  const [open, toggle] = useOpen(c.id)
  const color = c.color || TYPE_META[c.type].tint
  const prog = progressOf(ents, c)
  const nested = depth > 0
  return (
    <div className={nested ? 'overflow-hidden rounded-xl border border-line/60 bg-surface/50' : 'card overflow-hidden'}>
      <Header e={c} open={open} toggle={toggle} size={nested ? 'md' : 'lg'} right={
        <>
          {!nested && <span className="rounded-md bg-ink/[0.06] px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider text-mute">{c.type === 'subproject' ? 'Sous-projet' : 'Projet'}</span>}
          {prog != null && !ctx.compact && <span className="w-20"><ProgressBar value={prog} color={color} slim showLabel={false} /></span>}
          <button className="text-mute hover:text-ink" title="Ranger ailleurs" onClick={() => useUI.getState().set({ addTo: { sourceId: c.id, mode: 'move' } })}><Icon name="move" className="h-3.5 w-3.5" /></button>
        </>
      } />
      {open && (
        <div className="space-y-1.5 px-2 pb-2">
          <Children e={c} ctx={ctx} depth={depth} />
          <AddBar parent={c} />
        </div>
      )}
    </div>
  )
}

function VisionNode({ v, ctx }: { v: Entity; ctx: Ctx }) {
  const ents = useData((s) => s.entities)
  const [open, toggle] = useOpen(v.id)
  const prog = progressOf(ents, v) ?? 0
  return (
    <div className="rounded-xl border border-[#f4d58d]/25 bg-[#f4d58d]/[0.04]">
      <Header e={v} open={open} toggle={toggle} right={
        <>
          {v.done ? <span className="text-[10.5px] font-medium text-[#f4d58d]">✦ atteinte</span> : <span className="w-16"><ProgressBar value={prog} color="#f4d58d" slim showLabel={false} /></span>}
          <span className="w-8 text-right font-mono text-[10.5px] text-mute">{prog}%</span>
        </>
      } />
      {open && (
        <div className="space-y-1.5 px-2 pb-2">
          <Children e={v} ctx={ctx} depth={3} />
          <AddBar parent={v} />
        </div>
      )}
    </div>
  )
}

function ObjectiveNode({ o, ctx }: { o: Entity; ctx: Ctx }) {
  const ents = useData((s) => s.entities)
  const [open, toggle] = useOpen(o.id)
  const color = o.color || '#6fe0b8'
  const prog = progressOf(ents, o) ?? 0
  const ms = (ctx.tree.kids.get(o.id) || []).filter((k) => k.type === 'milestone')
  return (
    <div className="rounded-xl border border-line/50 bg-raised/40" style={{ borderLeft: `3px solid ${color}88` }}>
      <Header e={o} open={open} toggle={toggle} right={
        <>
          {o.deadline && !ctx.compact && <span className="text-[10.5px] text-mute">⚑ {fmtDay(o.deadline)}</span>}
          {ms.length > 0 && <span className="text-[10.5px] text-mute">◆ {ms.filter((m) => m.done).length}/{ms.length}</span>}
          <span className="w-14"><ProgressBar value={prog} color={color} slim showLabel={false} /></span>
          <span className="w-8 text-right font-mono text-[10.5px] text-mute">{prog}%</span>
        </>
      } />
      {open && (
        <div className="ml-4 space-y-0.5 border-l border-line/60 pb-1.5 pl-1.5">
          <Children e={o} ctx={ctx} depth={4} />
          <AddBar parent={o} />
        </div>
      )}
    </div>
  )
}

function MilestoneNode({ m, ctx }: { m: Entity; ctx: Ctx }) {
  const ents = useData((s) => s.entities)
  const tasks = ctx.tree.kids.get(m.id) || []
  const [open, toggle] = useOpen(m.id, !m.done)
  const prog = progressOf(ents, m) ?? 0
  const toggleDone = () => useData.getState().update(m.id, { done: !m.done, status: m.done ? 'todo' : 'done', doneAt: m.done ? null : new Date().toISOString() }, { action: m.done ? 'reopened' : 'done' })
  return (
    <div className={`rounded-lg ${m.done ? 'bg-[#f4d58d]/[0.05]' : ''}`}>
      <div className="flex items-center gap-2 px-2 py-1.5">
        <button onClick={toggle} className={`text-mute ${tasks.length || !m.done ? '' : 'invisible'}`}><Icon name="chevron" className={`h-3 w-3 transition ${open ? 'rotate-90' : ''}`} /></button>
        <button className="h-3 w-3 shrink-0 rotate-45 rounded-[2px] border-[1.5px] border-[#f4d58d] transition hover:scale-110" style={{ background: m.done ? '#f4d58d' : 'transparent', boxShadow: m.done ? '0 0 10px #f4d58d88' : undefined }} onClick={toggleDone} title={m.done ? 'Jalon atteint' : 'Marquer comme atteint'} />
        <button className={`min-w-0 flex-1 truncate text-left text-[13.5px] font-medium ${m.done ? 'text-[#f4d58d]' : ''}`} onClick={() => useUI.getState().open(m.id)}>{m.title}</button>
        {m.done ? <span className="text-[10.5px] text-[#f4d58d]">atteint{m.doneAt ? ` · ${fmtDay(m.doneAt.slice(0, 10))}` : ''}</span> : (
          <>
            {m.date && <span className="text-[10.5px] text-mute">{fmtDay(m.date)}</span>}
            {tasks.length > 0 && <span className="w-10"><ProgressBar value={prog} color="#f4d58d" slim showLabel={false} /></span>}
          </>
        )}
      </div>
      {open && (
        <div className="ml-6 border-l border-dashed border-[#f4d58d]/30 pl-1.5">
          {tasks.map((t) => <TaskRow key={t.id} t={t} compact={ctx.compact} hideProject />)}
          {!m.done && <AddBar parent={m} />}
        </div>
      )}
    </div>
  )
}

// ───────── Ce qui est déjà accompli ─────────
export function DoneList() {
  const ents = useData((s) => s.entities)
  const [kind, setKind] = useState<'all' | 'vision' | 'objective' | 'milestone' | 'task'>('all')
  const done = Object.values(ents)
    .filter((e) => e.done && !e.archived && ['vision', 'objective', 'milestone', 'task', 'project', 'subproject'].includes(e.type))
    .filter((e) => kind === 'all' || e.type === kind)
    .sort((a, b) => (b.doneAt || b.updatedAt).localeCompare(a.doneAt || a.updatedAt))
  const count = (t: string) => Object.values(ents).filter((e) => e.done && !e.archived && e.type === t).length
  const pathOf = (e: Entity) => { const out: string[] = []; let p = planParent(ents, e); const seen = new Set<string>(); while (p && !seen.has(p.id)) { seen.add(p.id); out.unshift(p.title); p = planParent(ents, p) } return out.join(' › ') }
  return (
    <div>
      <div className="mb-4 grid grid-cols-4 gap-2">
        {([['vision', 'Visions', '#f4d58d'], ['objective', 'Objectifs', '#6fe0b8'], ['milestone', 'Jalons', '#f4d58d'], ['task', 'Tâches', '#8ea2ff']] as const).map(([k, l, c]) => (
          <button key={k} onClick={() => setKind(kind === k ? 'all' : k)} className={`rounded-2xl border p-3 text-left transition ${kind === k ? 'border-accent/60 bg-accent/10' : 'border-line/70 bg-surface hover:bg-ink/[0.03]'}`}>
            <div className="font-display text-2xl font-semibold" style={{ color: c }}>{count(k)}</div>
            <div className="text-[11px] text-mute">{l} terminé{k === 'vision' ? 'es' : 's'}</div>
          </button>
        ))}
      </div>
      <div className="card p-1.5">
        {done.map((e) => (
          <button key={e.id} onClick={() => useUI.getState().open(e.id)} className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-ink/[0.04]">
            <span className="w-5 text-center" style={{ color: e.type === 'task' ? '#6fe0b8' : e.color || TYPE_META[e.type].tint }}>{e.type === 'task' ? '✓' : e.icon || TYPE_META[e.type].glyph}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px]">{e.title}</span>
              <span className="block truncate text-[11px] text-mute">{TYPE_META[e.type].label}{pathOf(e) ? ` · ${pathOf(e)}` : ''}</span>
            </span>
            <span className="shrink-0 text-[11px] text-mute">{e.doneAt ? fmtDay(e.doneAt.slice(0, 10)) : ''}</span>
          </button>
        ))}
        {!done.length && <div className="px-3 py-8 text-center text-sm text-mute">Rien de terminé pour l’instant.</div>}
      </div>
    </div>
  )
}
