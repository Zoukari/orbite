import { useMemo } from 'react'
import { useData, useUI, progressOf } from '../lib/store'
import { fmtDay, horizonOf, today, diffDays } from '../lib/dates'
import { TopThree } from '../components/Priorities'
import { TaskRow } from '../components/TaskRow'
import { QuoteLine } from '../components/Quote'
import { ProgressBar, StatusPill, TypeGlyph, Icon } from '../components/ui'
import type { ReactNode } from 'react'

// Les 4 questions : d'où je viens / où j'en suis / ce que je dois faire / où je vais
export function HomeView() {
  const ents = useData((s) => s.entities)
  const t = today()
  const d = useMemo(() => {
    const all = Object.values(ents).filter((e) => !e.archived)
    const tasks = all.filter((e) => e.type === 'task')
    const doneRecent = all.filter((e) => e.done && e.doneAt && Date.now() - new Date(e.doneAt).getTime() < 30 * 86400000).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''))
    const milestonesDone = all.filter((e) => e.type === 'milestone' && e.done).sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    const projects = all.filter((e) => (e.type === 'project' || e.type === 'subproject') && ['doing', 'waiting', 'blocked'].includes(e.status || ''))
    const objectives = all.filter((e) => e.type === 'objective' && e.status !== 'done')
    const nextMilestones = all.filter((e) => e.type === 'milestone' && !e.done && e.date && e.date >= t).sort((a, b) => a.date!.localeCompare(b.date!))
    const todayT = tasks.filter((x) => ['today', 'overdue'].includes(horizonOf(x))).sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    const overdue = tasks.filter((x) => horizonOf(x) === 'overdue' || (!x.done && (x.postponed ?? 0) > 0))
    return { doneRecent, milestonesDone, projects, objectives, nextMilestones, todayT, overdue, tasks }
  }, [ents])
  const hour = new Date().getHours()
  const hello = hour < 5 ? 'Bonne nuit' : hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir'
  const doneWeek = d.tasks.filter((x) => x.done && x.doneAt && Date.now() - new Date(x.doneAt).getTime() < 7 * 86400000).length

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-5 pb-28 pt-8 md:px-10 md:pb-12 md:pt-12">
        <div className="text-sm text-mute">{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight md:text-4xl">{hello}.</h1>
        <div className="mt-3 max-w-xl"><QuoteLine /></div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Stat n={d.todayT.length} l="aujourd’hui" />
          <Stat n={d.overdue.length} l="en retard / reportées" warn={d.overdue.length > 0} />
          <Stat n={d.projects.length} l="projets actifs" />
          <Stat n={doneWeek} l="terminées cette semaine" good />
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <Block n="03" title="Ce que je dois faire" className="md:row-span-2">
            <TopThree large />
            <div className="mt-5">
              {d.todayT.slice(0, 8).map((x) => <TaskRow key={x.id} t={x} />)}
              {!d.todayT.length && <div className="py-4 text-sm text-mute">Rien de prévu aujourd’hui.</div>}
              <button className="mt-1 px-2 text-xs font-medium text-accent" onClick={() => useUI.getState().go('tasks')}>Toutes les tâches →</button>
            </div>
          </Block>

          <Block n="02" title="Où j’en suis">
            {d.projects.slice(0, 6).map((p) => (
              <button key={p.id} className="block w-full rounded-xl px-2 py-2 text-left hover:bg-ink/[0.04]" onClick={() => useUI.getState().open(p.id)}>
                <div className="mb-1 flex items-center gap-2"><TypeGlyph e={p} size="sm" /><span className="flex-1 truncate text-sm font-medium">{p.title}</span><StatusPill status={p.status} /></div>
                <div className="pl-7"><ProgressBar value={progressOf(ents, p) ?? 0} color={p.color} slim /></div>
              </button>
            ))}
            {!d.projects.length && <div className="text-sm text-mute">Aucun projet en cours.</div>}
          </Block>

          <Block n="04" title="Où je vais">
            {d.objectives.slice(0, 5).map((o) => (
              <button key={o.id} className="block w-full rounded-xl px-2 py-2 text-left hover:bg-ink/[0.04]" onClick={() => useUI.getState().open(o.id)}>
                <div className="mb-1 flex items-center gap-2"><TypeGlyph e={o} size="sm" /><span className="flex-1 truncate text-sm font-medium">{o.title}</span>{o.deadline && <span className="text-[11px] text-mute">{fmtDay(o.deadline)}</span>}</div>
                <div className="pl-7"><ProgressBar value={progressOf(ents, o) ?? 0} color={o.color || '#6fe0b8'} slim /></div>
              </button>
            ))}
            {d.nextMilestones.slice(0, 3).map((m) => (
              <button key={m.id} className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-ink/[0.04]" onClick={() => useUI.getState().open(m.id)}>
                <span className="ml-1.5 mr-1 h-2.5 w-2.5 rotate-45 rounded-[2px] border-[1.5px] border-[#f4d58d]" />
                <span className="flex-1 truncate">{m.title}</span><span className="text-[11px] text-mute">dans {diffDays(m.date!, t)} j</span>
              </button>
            ))}
            {!d.objectives.length && !d.nextMilestones.length && <div className="text-sm text-mute">Définis un objectif pour donner une direction.</div>}
          </Block>
        </div>

        <div className="mt-5">
          <Block n="01" title="D’où je viens">
            <div className="grid gap-x-6 md:grid-cols-2">
              <div>
                {d.milestonesDone.slice(0, 4).map((m) => (
                  <div key={m.id} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                    <span className="ml-1.5 mr-1 h-2.5 w-2.5 rotate-45 rounded-[2px] bg-[#f4d58d]" /><span className="flex-1 truncate">{m.title}</span><span className="text-[11px] text-mute">{m.date ? new Date(m.date).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }) : ''}</span>
                  </div>
                ))}
              </div>
              <div>
                {d.doneRecent.slice(0, 6).map((x) => (
                  <div key={x.id} className="flex items-center gap-2 px-2 py-1.5 text-sm text-mute">
                    <Icon name="check" className="h-4 w-4 text-[#6fe0b8]" /><span className="flex-1 truncate">{x.title}</span><span className="text-[11px]">{fmtDay(x.doneAt!.slice(0, 10))}</span>
                  </div>
                ))}
                {!d.doneRecent.length && !d.milestonesDone.length && <div className="px-2 text-sm text-mute">Ton parcours s’écrira ici : jalons atteints et tâches terminées.</div>}
              </div>
            </div>
          </Block>
        </div>
      </div>
    </div>
  )
}

function Stat({ n, l, warn, good }: { n: number; l: string; warn?: boolean; good?: boolean }) {
  return (
    <div className="rounded-2xl border border-line/70 bg-surface px-4 py-2.5">
      <span className={`font-display text-xl font-semibold tabular-nums ${warn ? 'text-[#ff8a8a]' : good ? 'text-[#6fe0b8]' : ''}`}>{n}</span>
      <span className="ml-2 text-xs text-mute">{l}</span>
    </div>
  )
}

function Block({ n, title, children, className = '' }: { n: string; title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-4 md:p-5 ${className}`}>
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="font-display text-[15px] font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  )
}
