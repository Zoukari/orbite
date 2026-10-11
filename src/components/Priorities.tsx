import { useMemo, useState } from 'react'
import { useData, useUI } from '../lib/store'
import { planParent } from './ProjectTree'
import type { Entity } from '../lib/types'
import { horizonOf, today } from '../lib/dates'
import { Icon, Modal } from './ui'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function TopThree({ large }: { large?: boolean }) {
  const ids = useData((s) => s.settings.dailyTop.ids)
  const ents = useData((s) => s.entities)
  const prios = useData((s) => s.settings.priorities)
  const [pick, setPick] = useState(false)
  const items = ids.map((i) => ents[i]).filter(Boolean)
  const remove = (id: string) => { const s = useData.getState(); s.setSettings({ dailyTop: { date: today(), ids: s.settings.dailyTop.ids.filter((x) => x !== id) } }) }
  const anim = useData((s) => s.settings.animations)
  return (
    <div className={`beam rounded-[22px] bg-surface/40 p-3 ${anim ? '' : 'no-anim'}`}>
      <span className="beam-bg" />
      <div className="mb-2 flex items-center justify-between px-0.5">
        <div className="section-title">Mes 3 priorités</div>
        <button className="text-[11px] font-medium text-accent" onClick={() => setPick(true)}>{items.length < 3 ? 'Choisir' : '+ Tâches du jour'}</button>
      </div>
      <div className="relative space-y-1.5">
        {[0, 1, 2].map((i) => {
          const t = items[i]
          const p = t && prios.find((x) => x.level === t.priority)
          if (!t)
            return (
              <button key={i} onClick={() => setPick(true)} className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-line/80 px-3 py-2.5 text-left text-sm text-mute/80 transition hover:border-accent/50 hover:text-ink">
                <span className={`font-display font-semibold tabular-nums text-mute/40 ${large ? 'text-2xl' : 'text-lg'}`}>0{i + 1}</span>
                <span>Choisir une priorité</span>
              </button>
            )
          return (
            <div key={t.id} className={`group relative flex items-center gap-3 overflow-hidden rounded-2xl border px-3 transition ${large ? 'py-3.5' : 'py-2.5'} ${t.done ? 'border-[#6fe0b8]/30 bg-[#6fe0b8]/[0.06]' : 'border-line/70 bg-raised/50'}`}>
              <div className="absolute inset-y-0 left-0 w-[3px]" style={{ background: t.done ? '#6fe0b8' : p?.color || 'rgb(var(--accent))' }} />
              <span className={`font-display font-semibold tabular-nums ${large ? 'text-3xl' : 'text-xl'} ${t.done ? 'text-[#6fe0b8]' : ''}`} style={{ color: t.done ? undefined : p?.color }}>0{i + 1}</span>
              <button className="min-w-0 flex-1 text-left" onClick={() => useUI.getState().open(t.id)}>
                <div className={`truncate font-medium ${large ? 'text-[15px]' : 'text-[13.5px]'} ${t.done ? 'text-mute line-through' : ''}`}>{t.title}</div>
              </button>
              <button onClick={() => useData.getState().toggleDone(t.id)} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-[1.5px]" style={{ borderColor: t.done ? '#6fe0b8' : 'rgb(var(--line))', background: t.done ? '#6fe0b8' : '' }}>
                {t.done && <Icon name="check" className="h-3.5 w-3.5 text-bg" stroke={3} />}
              </button>
              <button onClick={() => remove(t.id)} className="absolute right-1 top-1 hidden text-[11px] text-mute group-hover:block" title="Retirer">×</button>
            </div>
          )
        })}
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
  const slots = Math.max(0, 3 - ids.length)

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
    const toTop = sel.slice(0, slots)
    s.setSettings({ dailyTop: { date: today(), ids: [...s.settings.dailyTop.ids, ...toTop] } })
    for (const id of sel) if (!s.entities[id].date || s.entities[id].date! > today()) s.update(id, { date: today(), inbox: false })
    const extra = sel.length - toTop.length
    useUI.getState().notify(extra > 0 ? `${toTop.length} priorité(s) + ${extra} tâche(s) pour aujourd’hui` : `${toTop.length} priorité(s) ajoutée(s)`)
    onClose()
  }
  const badge = (id: string) => { const i = sel.indexOf(id); if (i < 0) return null; return i < slots ? `0${ids.length + i + 1}` : 'jour' }
  return (
    <Modal open onClose={onClose} title="Choisir mes tâches du jour" wide>
      <div className="px-4 pb-4">
        <div className="mb-2 text-[12px] text-mute">Coche plusieurs tâches : les {slots} premières deviennent tes priorités, les autres passent dans « Aujourd’hui ».</div>
        <input autoFocus className="input mb-2" placeholder="Filtrer…" value={q} onChange={(e) => setQ(e.target.value)} />
        <form className="mb-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!newT.trim()) return; const t = useData.getState().create({ type: 'task', title: newT.trim(), date: today() }); setSel((c) => [...c, t.id]); setNewT('') }}>
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
                    {b && <span className={`rounded-md px-1.5 py-0.5 font-mono text-[10.5px] font-semibold ${b === 'jour' ? 'bg-ink/10 text-mute' : 'bg-[#f2b45a]/20 text-[#f2b45a]'}`}>{b}</span>}
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
