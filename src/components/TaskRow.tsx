import { memo } from 'react'
import { useData, useUI } from '../lib/store'
import { fmtDay, recurrenceLabel, today } from '../lib/dates'
import type { Entity } from '../lib/types'
import { Icon } from './ui'

function TaskRowImpl({ t, compact, showTop = true }: { t: Entity; compact?: boolean; showTop?: boolean }) {
  const prio = useData((s) => s.settings.priorities.find((p) => p.level === t.priority))
  const project = useData((s) => {
    const pid = t.projectIds?.[0] || (t.parentId && ['project', 'subproject'].includes(s.entities[t.parentId]?.type) ? t.parentId : undefined)
    return pid ? s.entities[pid] : undefined
  })
  const inTop = useData((s) => s.settings.dailyTop.ids.includes(t.id))
  const overdue = !t.done && ((t.date && t.date < today()) || (t.deadline && t.deadline < today()))
  const toggleTop = () => {
    const s = useData.getState()
    const top = s.settings.dailyTop
    if (inTop) s.setSettings({ dailyTop: { ...top, ids: top.ids.filter((x) => x !== t.id) } })
    else if (top.ids.length >= 3) useUI.getState().notify('3 priorités maximum — retire-en une d’abord')
    else s.setSettings({ dailyTop: { date: today(), ids: [...top.ids, t.id] } })
  }
  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('application/orbite', t.id); e.dataTransfer.effectAllowed = 'copyMove' }}
      className={`group flex items-start gap-2.5 rounded-xl px-2 ${compact ? 'py-1.5' : 'py-2'} transition hover:bg-ink/[0.04]`}
    >
      <button
        className="mt-[1px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition hover:scale-110"
        style={{ borderColor: t.done ? '#6fe0b8' : prio?.color || 'rgb(var(--mute) / .6)', background: t.done ? '#6fe0b8' : prio && prio.level >= 4 ? `${prio.color}18` : undefined, boxShadow: !t.done && prio && prio.level >= 4 ? `0 0 10px -2px ${prio.color}88` : undefined }}
        onClick={() => useData.getState().toggleDone(t.id)}
        aria-label="Terminer"
      >
        {t.done && <Icon name="check" className="h-3 w-3 text-bg" stroke={3} />}
      </button>
      <button className="min-w-0 flex-1 text-left" onClick={() => useUI.getState().open(t.id)}>
        <div className={`text-[13.5px] leading-snug ${t.done ? 'text-mute line-through' : ''}`}>{t.title || 'Sans titre'}</div>
        {!compact && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-mute">
            {prio && prio.level >= 2 && <span style={{ color: prio.color }}>{prio.glyph} {prio.label}</span>}
            {t.date && <span className={overdue ? 'text-[#ff8a8a]' : ''}>{fmtDay(t.date)}{t.time ? ` · ${t.time}` : ''}</span>}
            {t.deadline && <span className={t.deadline < today() && !t.done ? 'text-[#ff8a8a]' : ''}>⚑ {fmtDay(t.deadline)}</span>}
            {t.recurrence && <span>↻ {recurrenceLabel(t.recurrence)}</span>}
            {!!t.postponed && !t.done && <span className="text-[#f2b45a]">Reportée {t.postponed}×</span>}
            {project && <span className="truncate" style={{ color: project.color }}>{project.icon || '▣'} {project.title}</span>}
            {t.checklist?.length ? <span>☑ {t.checklist.filter((c) => c.done).length}/{t.checklist.length}</span> : null}
          </div>
        )}
      </button>
      {showTop && !t.done && (
        <button onClick={toggleTop} title={inTop ? 'Retirer des 3 priorités' : 'Ajouter aux 3 priorités du jour'} className={`mt-0.5 text-sm transition ${inTop ? 'text-[#f2b45a]' : 'text-mute/40 opacity-0 hover:text-[#f2b45a] group-hover:opacity-100 max-md:opacity-100'}`}>
          {inTop ? '★' : '☆'}
        </button>
      )}
    </div>
  )
}
export const TaskRow = memo(TaskRowImpl)
