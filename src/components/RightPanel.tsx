import { useMemo, useState } from 'react'
import { useData, useUI, progressOf } from '../lib/store'
import { HORIZONS, horizonOf, today as todayStr, type HorizonKey } from '../lib/dates'
import type { Entity } from '../lib/types'
import { TaskRow } from './TaskRow'
import { TopThree } from './Priorities'
import { Icon, ProgressBar, TypeGlyph } from './ui'
import { QuoteLine } from './Quote'

type Tab = 'today' | 'objectives' | 'later'

// Sidebar droite de la Map : ce que je dois faire maintenant, sans quitter la carte.
export function RightPanel({ onClose }: { onClose?: () => void }) {
  const ents = useData((s) => s.entities)
  const [tab, setTab] = useState<Tab>('today')
  const [hz, setHz] = useState<HorizonKey>('short')
  const [quick, setQuick] = useState('')
  const groups = useMemo(() => {
    const g: Record<string, Entity[]> = {}
    const tasks = Object.values(ents).filter((e) => e.type === 'task' && !e.archived)
    for (const t of tasks) (g[horizonOf(t)] ||= []).push(t)
    for (const k in g) g[k].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || (a.date || '').localeCompare(b.date || ''))
    return g
  }, [ents])
  const objectives = Object.values(ents).filter((e) => e.type === 'objective' && !e.archived && e.status !== 'done')
  const today = groups.today || []
  const overdue = groups.overdue || []

  return (
    <div className="flex h-full flex-col" data-dropzone="tasks">
      <div className="flex items-center gap-1 px-4 pb-2 pt-4">
        {([['today', "Aujourd'hui"], ['objectives', 'Objectifs'], ['later', 'Horizon']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${tab === k ? 'bg-ink/[0.07] text-ink' : 'text-mute hover:text-ink'}`}>{l}</button>
        ))}
        <div className="flex-1" />
        {onClose && <button className="icon-btn !h-8 !w-8" onClick={onClose}><Icon name="close" className="h-4 w-4" /></button>}
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 pb-6">
        {tab === 'today' && (
          <>
            <div className="px-1"><TopThree /></div>
            {overdue.length > 0 && (
              <section>
                <div className="section-title mb-1 px-2 !text-[#ff8a8a]">En retard · {overdue.length}</div>
                {overdue.map((t) => <TaskRow key={t.id} t={t} />)}
              </section>
            )}
            <section>
              <div className="section-title mb-1 flex items-center justify-between px-2">Aujourd’hui <span className="font-mono">{today.length}</span></div>
              {today.map((t) => <TaskRow key={t.id} t={t} />)}
              <form className="flex items-center gap-2 px-2 py-1.5" onSubmit={(e) => { e.preventDefault(); if (!quick.trim()) return; useData.getState().create({ type: 'task', title: quick.trim(), date: todayStr() }); setQuick('') }}>
                <Icon name="plus" className="h-4 w-4 text-mute" />
                <input className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-mute/70" placeholder="Ajouter pour aujourd’hui" value={quick} onChange={(e) => setQuick(e.target.value)} />
              </form>
              {(groups.done || []).filter((t) => t.doneAt && new Date(t.doneAt).toDateString() === new Date().toDateString()).map((t) => <TaskRow key={t.id} t={t} compact />)}
            </section>
            {(groups.inbox?.length ?? 0) > 0 && (
              <button className="flex w-full items-center justify-between rounded-xl border border-line/60 px-3 py-2 text-xs text-mute hover:text-ink" onClick={() => useUI.getState().go('inbox')}>
                <span>Inbox à organiser</span><span className="font-mono">{groups.inbox.length}</span>
              </button>
            )}
            <div className="px-2"><QuoteLine /></div>
          </>
        )}
        {tab === 'objectives' && (
          <section className="space-y-1">
            {objectives.map((o) => (
              <button key={o.id} className="w-full rounded-2xl px-2.5 py-2.5 text-left hover:bg-ink/[0.04]" onClick={() => useUI.getState().open(o.id)}>
                <div className="mb-1.5 flex items-center gap-2"><TypeGlyph e={o} size="sm" /><span className="flex-1 truncate text-[13.5px] font-medium">{o.title}</span></div>
                <ProgressBar value={progressOf(ents, o) ?? 0} color={o.color} />
              </button>
            ))}
            {!objectives.length && <div className="px-3 py-6 text-center text-xs text-mute">Aucun objectif en cours.</div>}
          </section>
        )}
        {tab === 'later' && (
          <>
            <div className="flex flex-wrap gap-1 px-1">
              {HORIZONS.filter((h) => !['today', 'overdue'].includes(h.key)).map((h) => (
                <button key={h.key} onClick={() => setHz(h.key)} className={`chip !py-1 ${hz === h.key ? '!border-accent !text-accent' : ''}`}>{h.label} <span className="font-mono">{groups[h.key]?.length || 0}</span></button>
              ))}
            </div>
            <section>{(groups[hz] || []).map((t) => <TaskRow key={t.id} t={t} />)}{!(groups[hz] || []).length && <div className="px-3 py-6 text-center text-xs text-mute">Rien ici.</div>}</section>
          </>
        )}
      </div>
      <div className="mx-3 mb-3 hidden rounded-xl border border-dashed border-line/70 px-3 py-2 text-center text-[11px] text-mute md:block">
        Glisse une tâche sur la map · glisse un élément de la map ici
      </div>
    </div>
  )
}
