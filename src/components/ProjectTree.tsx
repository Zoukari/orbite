import { useMemo, useState, type ReactNode } from 'react'
import { useData, useUI, relatedTasks, ancestors, descendants, progressOf, placeChild } from '../lib/store'
import { fmtDay } from '../lib/dates'
import { TaskRow } from './TaskRow'
import { Icon, ProgressBar } from './ui'
import type { Entity } from '../lib/types'

// Hiérarchie unique : Catégorie → Projet → Objectif → Tâches & Jalons.
// Réutilisée dans la page « Projets » et dans la sidebar droite de la Map.

interface Group { obj: Entity | null; items: Entity[] } // obj null = « Sans objectif »
// Un conteneur = projet ou catégorie. Ils peuvent s'imbriquer à l'infini
// (ex. Personnel → Canada → Logement) : on les affiche les uns dans les autres.
interface Card { e: Entity; cards: Card[]; groups: Group[] }
interface Section { cat: Entity | null; cards: Card[]; groups: Group[] }

const isContainer = (e: Entity) => e.type === 'project' || e.type === 'subproject' || e.type === 'category'
const isGroup = (e: Entity) => e.type === 'objective'
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
    const depth = (e: Entity) => ancestors(ents, e.id).length
    const sortItems = (a: Entity, b: Entity) => Number(!!a.done) - Number(!!b.done) || Number(a.type === 'milestone') - Number(b.type === 'milestone') || (a.date || '9').localeCompare(b.date || '9') || (b.priority ?? 0) - (a.priority ?? 0)
    const take = (list: Entity[]) => {
      const out: Entity[] = []
      for (const t of list) if (keep(t) && !claimed.has(t.id)) { claimed.add(t.id); out.push(t) }
      return out.sort(sortItems)
    }

    // 1) conteneurs : sections (catégories racines) et cartes (projets / sous-catégories)
    const sections = new Map<string, Section>()
    const other: Section = { cat: null, cards: [], groups: [] }
    const cards = new Map<string, Card>()
    const containers = all.filter(isContainer).sort((x, y) => depth(x) - depth(y))
    for (const c of containers) {
      const parent = nearest(ents, c, isContainer, c.type !== 'category')
      if (!parent && c.type === 'category') { sections.set(c.id, { cat: c, cards: [], groups: [] }); continue }
      const card: Card = { e: c, cards: [], groups: [] }
      cards.set(c.id, card)
      if (parent && cards.has(parent.id)) cards.get(parent.id)!.cards.push(card)
      else if (parent && sections.has(parent.id)) sections.get(parent.id)!.cards.push(card)
      else other.cards.push(card)
    }
    const holderOf = (e: Entity): { groups: Group[] } => {
      const c = nearest(ents, e, isContainer)
      if (c && cards.has(c.id)) return cards.get(c.id)!
      if (c && sections.has(c.id)) return sections.get(c.id)!
      return other
    }

    // 2) objectifs : les plus profonds réclament leurs tâches en premier (pas de doublon)
    for (const g of all.filter(isGroup).sort((x, y) => depth(y) - depth(x))) {
      const items = take(itemsOf(ents, g.id).filter(isItem))
      if (g.type === 'subproject' && !items.length && all.some((x) => isGroup(x) && x.parentId === g.id)) continue
      holderOf(g).groups.push({ obj: g, items })
    }
    // 3) tâches restantes d'un conteneur → « Sans objectif » dans ce conteneur
    for (const c of [...containers].sort((x, y) => depth(y) - depth(x))) {
      const rest = take(itemsOf(ents, c.id).filter(isItem))
      if (!rest.length) continue
      const h = cards.get(c.id) ?? sections.get(c.id)
      h?.groups.push({ obj: null, items: rest })
    }
    // 4) le reste : « À classer »
    const loose = take(all.filter(isItem))
    if (loose.length) other.groups.push({ obj: null, items: loose })

    const order = ['doing', 'blocked', 'waiting', 'todo', 'backlog', 'done']
    const rank = (c: Card) => (c.e.type === 'category' ? -1 : order.indexOf(c.e.status || 'todo'))
    const sortCards = (list: Card[]) => { list.sort((a, b) => rank(a) - rank(b) || (a.e.y ?? 0) - (b.e.y ?? 0)); list.forEach((c) => { sortCards(c.cards); c.groups.sort((a, b) => Number(!a.obj) - Number(!b.obj) || (a.obj?.y ?? 0) - (b.obj?.y ?? 0)) }) }
    const list = [...sections.values()].sort((a, b) => (a.cat?.y ?? 0) - (b.cat?.y ?? 0))
    for (const s of [...list, other]) sortCards(s.cards)
    return [...list, other].filter((s) => s.cards.length || s.groups.length)
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
      <div className="mb-2 flex items-center gap-2 px-1">
        <button onClick={toggle} className="flex min-w-0 items-center gap-2 text-left">
          <Icon name="chevron" className={`h-3 w-3 text-mute transition ${open ? 'rotate-90' : ''}`} />
          {cat && <span style={{ color: cat.color }}>{cat.icon || '◇'}</span>}
          <span className="truncate font-display text-[12px] font-semibold uppercase tracking-[0.14em] text-mute">{cat ? cat.title : 'À classer'}</span>
        </button>
        <span className="h-px flex-1 bg-line/60" />
        {cat && <AddProject parent={cat} />}
      </div>
      {open && (
        <div className="space-y-2.5">
          {s.cards.map((c) => <ContainerCard key={c.e.id} c={c} compact={compact} />)}
          {s.groups.map((g, i) => (
            <div key={g.obj?.id ?? 'loose' + i} className="card px-1.5 py-1.5">
              <GroupView g={g} project={cat} compact={compact} />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function AddProject({ parent }: { parent: Entity }) {
  const [on, setOn] = useState(false)
  const [txt, setTxt] = useState('')
  if (!on) return <button className="text-[11px] text-mute hover:text-ink" onClick={() => setOn(true)}>+ Projet</button>
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!txt.trim()) return; const s = useData.getState(); const pos = parent.mapId ? placeChild(s.entities, parent) : {}; s.create({ type: 'project', title: txt.trim(), status: 'todo', parentId: parent.id, mapId: parent.mapId ?? null, ...pos }); setTxt(''); setOn(false) }}>
      <input autoFocus className="w-36 rounded-lg border border-line bg-surface px-2 py-0.5 text-[12px] outline-none" placeholder="Nom du projet" value={txt} onChange={(e) => setTxt(e.target.value)} onBlur={() => !txt && setOn(false)} onKeyDown={(e) => e.key === 'Escape' && setOn(false)} />
    </form>
  )
}

function ContainerCard({ c, compact, nested }: { c: Card; compact?: boolean; nested?: boolean }) {
  const ents = useData((s) => s.entities)
  const p = c.e
  const [open, toggle] = useOpen(p.id)
  const [adding, setAdding] = useState<null | 'objective' | 'project'>(null)
  const [txt, setTxt] = useState('')
  const color = p.color || (p.type === 'category' ? '#b9c3e6' : '#7aa7ff')
  const prog = p.type !== 'category' ? progressOf(ents, p) : null
  const count = (x: Card): number => x.groups.reduce((n, g) => n + g.items.filter((t) => !t.done && t.type === 'task').length, 0) + x.cards.reduce((n, k) => n + count(k), 0)
  const left = count(c)
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!txt.trim() || !adding) return
    const s = useData.getState()
    const pos = p.mapId ? placeChild(s.entities, p) : {}
    s.create({ type: adding, title: txt.trim(), parentId: p.id, mapId: p.mapId ?? null, status: adding === 'project' ? 'todo' : undefined, progressMode: adding === 'project' ? 'auto' : undefined, ...pos })
    setTxt('')
  }
  return (
    <div className={nested ? 'overflow-hidden rounded-xl border border-line/60 bg-surface/60' : 'card overflow-hidden'}>
      <div className={`flex items-center gap-2.5 px-3.5 ${nested ? 'py-2.5' : 'py-3'}`} style={{ background: `linear-gradient(90deg, ${color}14, transparent 60%)` }}>
        <button onClick={toggle} className="text-mute"><Icon name="chevron" className={`h-3.5 w-3.5 transition ${open ? 'rotate-90' : ''}`} /></button>
        <span className={nested ? 'text-[13px]' : 'text-[15px]'} style={{ color }}>{p.icon || (p.type === 'category' ? '◇' : '▣')}</span>
        <button className={`min-w-0 flex-1 truncate text-left font-display font-semibold ${nested ? 'text-[14px]' : 'text-[15px]'}`} onClick={() => useUI.getState().open(p.id)}>{p.title}</button>
        {prog != null && !compact && <span className="w-24"><ProgressBar value={prog} color={color} slim /></span>}
        <button className="text-mute hover:text-ink" title="Mettre dans un autre projet" onClick={() => useUI.getState().set({ addTo: { sourceId: p.id, mode: 'move' } })}><Icon name="move" className="h-3.5 w-3.5" /></button>
        <span className="rounded-full bg-ink/[0.06] px-2 py-0.5 font-mono text-[10.5px] text-mute">{left}</span>
      </div>
      {open && (
        <div className="space-y-1.5 px-2 pb-2">
          {c.cards.map((k) => <ContainerCard key={k.e.id} c={k} compact={compact} nested />)}
          {c.groups.map((g) => <GroupView key={g.obj?.id ?? 'none'} g={g} project={p} compact={compact} nested />)}
          {adding ? (
            <form onSubmit={submit} className="flex items-center gap-2 rounded-xl border border-dashed border-line/70 px-3 py-2">
              <span className="text-[12px]" style={{ color: adding === 'objective' ? '#6fe0b8' : '#7aa7ff' }}>{adding === 'objective' ? '◉' : '▣'}</span>
              <input autoFocus className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-mute/70" placeholder={adding === 'objective' ? 'Nouvel objectif' : 'Nouveau projet dedans'} value={txt} onChange={(e) => setTxt(e.target.value)} onBlur={() => !txt && setAdding(null)} onKeyDown={(e) => e.key === 'Escape' && setAdding(null)} />
            </form>
          ) : (
            <div className="flex gap-1.5">
              <button className="flex-1 rounded-xl border border-dashed border-line/60 px-3 py-1.5 text-left text-[12px] text-mute hover:border-accent/50 hover:text-ink" onClick={() => setAdding('objective')}>+ Objectif</button>
              <button className="rounded-xl border border-dashed border-line/60 px-3 py-1.5 text-[12px] text-mute hover:border-accent/50 hover:text-ink" onClick={() => setAdding('project')}>+ Projet</button>
            </div>
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
