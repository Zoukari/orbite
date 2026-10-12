import { useMemo, useRef, useState } from 'react'
import { useData, useUI } from '../lib/store'
import { planParent } from './ProjectTree'
import type { Entity } from '../lib/types'
import { horizonOf, today } from '../lib/dates'
import { Icon, Modal } from './ui'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// « À terminer » : autant de tâches qu'il faut. Elles restent jusqu'à ce qu'elles soient cochées.
export function TopThree({ large }: { large?: boolean }) {
  const ids = useData((s) => s.settings.dailyTop.ids)
  const ents = useData((s) => s.entities)
  const prios = useData((s) => s.settings.priorities)
  const [pick, setPick] = useState(false)
  const items = ids.map((i) => ents[i]).filter((t) => t && !t.archived)
  const left = items.filter((t) => !t.done).length
  const remove = (id: string) => { const s = useData.getState(); s.setSettings({ dailyTop: { date: today(), ids: s.settings.dailyTop.ids.filter((x) => x !== id) } }) }
  const anim = useData((s) => s.settings.animations)
  // réordonner : maintenir la poignée ⠿ et glisser
  const listRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ id: string; dy: number; y0: number } | null>(null)
  const setOrder = (order: string[]) => { const s = useData.getState(); s.setSettings({ dailyTop: { date: s.settings.dailyTop.date || today(), ids: order } }) }
  const onGrip = (ev: React.PointerEvent, id: string) => {
    ev.preventDefault(); (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId)
    setDrag({ id, dy: 0, y0: ev.clientY }); navigator.vibrate?.(8)
  }
  const onGripMove = (ev: React.PointerEvent) => {
    if (!drag || !listRef.current) return
    const rows = [...listRef.current.querySelectorAll<HTMLElement>('[data-row]')]
    const order = rows.map((r) => r.dataset.row!)
    const from = order.indexOf(drag.id)
    const me = rows[from]
    const h = me.offsetHeight + 6
    let dy = ev.clientY - drag.y0
    // franchir la moitié d'une ligne → échange
    if (dy > h / 2 && from < order.length - 1) { const o = [...order]; o.splice(from + 1, 0, o.splice(from, 1)[0]); setOrder(merge(o)); setDrag({ ...drag, y0: drag.y0 + h, dy: dy - h }); return }
    if (dy < -h / 2 && from > 0) { const o = [...order]; o.splice(from - 1, 0, o.splice(from, 1)[0]); setOrder(merge(o)); setDrag({ ...drag, y0: drag.y0 - h, dy: dy + h }); return }
    setDrag({ ...drag, dy })
  }
  // garde les ids masqués (archivés) à la fin
  const merge = (o: string[]) => [...o, ...ids.filter((x) => !o.includes(x))]
  const pathOf = (t: Entity) => { const out: string[] = []; let p = planParent(ents, t); const seen = new Set<string>(); while (p && !seen.has(p.id) && out.length < 2) { seen.add(p.id); if (['project', 'subproject', 'category'].includes(p.type)) out.unshift(p.title); p = planParent(ents, p) } return out.join(' › ') }
  return (
    <div className={`beam rounded-[22px] bg-surface/40 p-3 ${anim ? '' : 'no-anim'}`}>
      <span className="beam-bg" />
      <div className="mb-2 flex items-center justify-between px-0.5">
        <div className="section-title">À terminer {items.length > 0 && <span className="ml-1 font-mono normal-case tracking-normal">{left}/{items.length}</span>}</div>
        <button className="text-[11px] font-medium text-accent" onClick={() => setPick(true)}>+ Ajouter</button>
      </div>
      <div ref={listRef} className="relative space-y-1.5">
        {items.map((t, i) => {
          const dragging = drag?.id === t.id
          const p = prios.find((x) => x.level === t.priority)
          const path = pathOf(t)
          return (
            <div key={t.id} data-row={t.id} style={dragging ? { transform: `translateY(${drag!.dy}px) scale(1.02)`, zIndex: 10, transition: 'none' } : undefined} className={`group relative flex min-w-0 items-center gap-2.5 overflow-hidden rounded-2xl border pl-1 pr-3 transition ${dragging ? 'shadow-2xl ring-1 ring-accent/50' : ''} ${large ? 'py-3' : 'py-2'} ${t.done ? 'border-[#6fe0b8]/30 bg-[#6fe0b8]/[0.06]' : 'border-line/70 bg-raised/50'}`}>
              <div className="absolute inset-y-0 left-0 w-[3px]" style={{ background: t.done ? '#6fe0b8' : p?.color || 'rgb(var(--accent))' }} />
              <span onPointerDown={(ev) => onGrip(ev, t.id)} onPointerMove={onGripMove} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)} className="flex h-9 w-6 shrink-0 cursor-grab touch-none select-none items-center justify-center text-mute/60 active:cursor-grabbing" title="Glisser pour réordonner">
                <svg viewBox="0 0 10 16" className="h-4 w-2.5" fill="currentColor"><circle cx="2.5" cy="3" r="1.3" /><circle cx="7.5" cy="3" r="1.3" /><circle cx="2.5" cy="8" r="1.3" /><circle cx="7.5" cy="8" r="1.3" /><circle cx="2.5" cy="13" r="1.3" /><circle cx="7.5" cy="13" r="1.3" /></svg>
              </span>
              <span className={`w-8 shrink-0 font-display font-semibold tabular-nums ${large ? 'text-2xl' : 'text-lg'} ${t.done ? 'text-[#6fe0b8]' : ''}`} style={{ color: t.done ? undefined : p?.color }}>{String(i + 1).padStart(2, '0')}</span>
              <button className="min-w-0 flex-1 text-left" onClick={() => useUI.getState().open(t.id)}>
                <div className={`line-clamp-2 break-words font-medium leading-snug ${large ? 'text-[15px]' : 'text-[13.5px]'} ${t.done ? 'text-mute line-through' : ''}`}>{t.title}</div>
                {path && <div className="truncate text-[11px] text-mute">{path}</div>}
              </button>
              <button onClick={() => useData.getState().toggleDone(t.id)} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-[1.5px]" style={{ borderColor: t.done ? '#6fe0b8' : 'rgb(var(--line))', background: t.done ? '#6fe0b8' : '' }} title="Terminé">
                {t.done && <Icon name="check" className="h-3.5 w-3.5 text-bg" stroke={3} />}
              </button>
              <button onClick={() => remove(t.id)} className="text-mute/50 hover:text-ink max-md:text-mute md:opacity-0 md:group-hover:opacity-100" title="Retirer de la liste">×</button>
            </div>
          )
        })}
        {!items.length && (
          <button onClick={() => setPick(true)} className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-line/80 px-3 py-3 text-left text-sm text-mute/80 transition hover:border-accent/50 hover:text-ink">
            <Icon name="plus" className="h-4 w-4" /> Choisir les tâches à terminer
          </button>
        )}
      </div>
      {pick && <PickTop onClose={() => setPick(false)} />}
    </div>
  )
}

function PickTop({ onClose }: { onClose: () => void }) {
  const ents = useData((s) => s.entities)
  const ids = useData((s) => s.settings.dailyTop.ids)
  const prios = useData((s) => s.settings.priorities)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string[]>([])
  const [newT, setNewT] = useState('')

  // tâches ouvertes regroupées par projet › sous-projet
  const groups = useMemo(() => {
    const rank = (h: string) => ['overdue', 'today', 'short', 'medium', 'inbox', 'long', 'someday'].indexOf(h)
    const open = Object.values(ents)
      .filter((e) => e.type === 'task' && !e.done && !e.archived && !ids.includes(e.id))
      .filter((t) => !q || norm(t.title).includes(norm(q)))
    const map = new Map<string, { label: string; color?: string; icon?: string; tasks: Entity[] }>()
    for (const t of open) {
      const chain: Entity[] = []
      let p = planParent(ents, t)
      const seen = new Set<string>()
      while (p && !seen.has(p.id)) { seen.add(p.id); chain.unshift(p); p = planParent(ents, p) }
      const containers = chain.filter((c) => ['category', 'project', 'subproject'].includes(c.type))
      const key = containers.map((c) => c.id).join('/') || 'none'
      const last = containers[containers.length - 1]
      if (!map.has(key)) map.set(key, { label: containers.length ? containers.map((c) => c.title).join(' › ') : 'Sans projet', color: last?.color, icon: last?.icon, tasks: [] })
      map.get(key)!.tasks.push(t)
    }
    const list = [...map.values()]
    list.forEach((g) => g.tasks.sort((a, b) => rank(horizonOf(a)) - rank(horizonOf(b)) || (b.priority ?? 0) - (a.priority ?? 0)))
    return list.sort((a, b) => Number(a.label === 'Sans projet') - Number(b.label === 'Sans projet') || a.label.localeCompare(b.label))
  }, [ents, ids, q])

  const toggle = (id: string) => setSel((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  const validate = () => {
    const s = useData.getState()
    s.setSettings({ dailyTop: { date: today(), ids: [...s.settings.dailyTop.ids, ...sel] } })
    for (const id of sel) if (s.entities[id].inbox) s.update(id, { inbox: false })
    useUI.getState().notify(`${sel.length} tâche(s) ajoutée(s) à « À terminer »`)
    onClose()
  }
  const badge = (id: string) => { const i = sel.indexOf(id); return i < 0 ? null : String(ids.length + i + 1).padStart(2, '0') }
  return (
    <Modal open onClose={onClose} title="Ajouter à « À terminer »" wide>
      <div className="px-4 pb-4">
        <div className="mb-2 text-[12px] text-mute">Coche autant de tâches que tu veux. Elles restent sur l’accueil jusqu’à ce que tu les termines.</div>
        <input autoFocus className="input mb-2" placeholder="Filtrer…" value={q} onChange={(e) => setQ(e.target.value)} />
        <form className="mb-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!newT.trim()) return; const t = useData.getState().create({ type: 'task', title: newT.trim() }); setSel((c) => [...c, t.id]); setNewT('') }}>
          <input className="input" placeholder="…ou nouvelle tâche" value={newT} onChange={(e) => setNewT(e.target.value)} />
          <button className="btn-soft">Créer</button>
        </form>
        <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="mb-1 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: g.color || 'rgb(var(--mute))' }}>{g.icon && <span>{g.icon}</span>}<span className="truncate">{g.label}</span><span className="font-mono font-normal text-mute">{g.tasks.length}</span></div>
              {g.tasks.map((t) => {
                const on = sel.includes(t.id)
                const b = badge(t.id)
                const p = prios.find((x) => x.level === t.priority)
                return (
                  <button key={t.id} onClick={() => toggle(t.id)} className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left text-sm transition ${on ? 'bg-accent/10' : 'hover:bg-ink/5'}`}>
                    <span className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px] border ${on ? 'border-accent bg-accent text-bg' : 'border-line'}`}>{on && <Icon name="check" className="h-3 w-3" stroke={3} />}</span>
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    {p && p.level >= 2 && <span className="text-[11px]" style={{ color: p.color }}>{p.glyph}</span>}
                    <span className="text-[11px] text-mute">{{ overdue: 'en retard', today: "aujourd'hui", short: 'bientôt', medium: '', long: '', someday: '', inbox: 'inbox', done: '' }[horizonOf(t)]}</span>
                    {b && <span className={`rounded-md px-1.5 py-0.5 font-mono text-[10.5px] font-semibold bg-[#f2b45a]/20 text-[#f2b45a]`}>{b}</span>}
                  </button>
                )
              })}
            </div>
          ))}
          {!groups.length && <div className="py-6 text-center text-sm text-mute">Aucune tâche ouverte.</div>}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-mute">{sel.length} sélectionnée(s)</span>
          <div className="flex-1" />
          <button className="btn-ghost text-xs" onClick={onClose}>Annuler</button>
          <button className="btn-primary" disabled={!sel.length} onClick={validate}>Valider</button>
        </div>
      </div>
    </Modal>
  )
}
