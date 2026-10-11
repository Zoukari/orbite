import { useState } from 'react'
import { useData, useUI } from '../lib/store'
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
        {items.length < 3 && <button className="text-[11px] font-medium text-accent" onClick={() => setPick(true)}>Choisir</button>}
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
  const [q, setQ] = useState('')
  const open = Object.values(ents).filter((e) => e.type === 'task' && !e.done && !e.archived && !ids.includes(e.id))
  const rank = (h: string) => ['overdue', 'today', 'short', 'medium', 'inbox', 'long', 'someday'].indexOf(h)
  const list = open
    .filter((t) => !q || norm(t.title).includes(norm(q)))
    .sort((a, b) => rank(horizonOf(a)) - rank(horizonOf(b)) || (b.priority ?? 0) - (a.priority ?? 0))
    .slice(0, 40)
  const add = (id: string) => {
    const s = useData.getState()
    const next = [...s.settings.dailyTop.ids, id]
    s.setSettings({ dailyTop: { date: today(), ids: next } })
    if (!ents[id].date || ents[id].date! > today()) s.update(id, { date: today(), inbox: false })
    if (next.length >= 3) onClose()
  }
  const [newT, setNewT] = useState('')
  return (
    <Modal open onClose={onClose} title={`Priorité ${ids.length + 1} sur 3`}>
      <div className="px-4 pb-4">
        <input autoFocus className="input mb-2" placeholder="Filtrer…" value={q} onChange={(e) => setQ(e.target.value)} />
        <form className="mb-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!newT.trim()) return; const t = useData.getState().create({ type: 'task', title: newT.trim(), date: today() }); add(t.id); setNewT('') }}>
          <input className="input" placeholder="…ou nouvelle tâche" value={newT} onChange={(e) => setNewT(e.target.value)} />
          <button className="btn-soft">Créer</button>
        </form>
        {list.map((t) => (
          <button key={t.id} onClick={() => add(t.id)} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm hover:bg-ink/5">
            <span className="h-2 w-2 rounded-full" style={{ background: useData.getState().settings.priorities.find((p) => p.level === t.priority)?.color || 'rgb(var(--line))' }} />
            <span className="flex-1 truncate">{t.title}</span>
            <span className="text-[11px] text-mute">{{ overdue: 'en retard', today: "aujourd'hui", short: 'bientôt', medium: '', long: '', someday: '', inbox: 'inbox', done: '' }[horizonOf(t)]}</span>
          </button>
        ))}
        {!list.length && <div className="py-6 text-center text-sm text-mute">Aucune tâche ouverte.</div>}
      </div>
    </Modal>
  )
}
