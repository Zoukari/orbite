import { useMemo } from 'react'
import { useData, useUI, progressOf } from '../lib/store'
import { planParent, isMapCenter } from '../components/ProjectTree'
import type { Entity } from '../lib/types'
import { fmtDay, horizonOf, today, diffDays } from '../lib/dates'
import { TopThree } from '../components/Priorities'
import { TaskRow } from '../components/TaskRow'
import { QuoteLine } from '../components/Quote'
import { ProgressBar, TypeGlyph, Icon, Info } from '../components/ui'
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
    // ── arbre du plan (via planParent, comme dans Projets) ──
    const kids = new Map<string, Entity[]>()
    const parentOf = new Map<string, Entity | null>()
    for (const e of all) {
      if (isMapCenter(e)) continue
      const p = planParent(ents, e)
      parentOf.set(e.id, p)
      if (p) { if (!kids.has(p.id)) kids.set(p.id, []); kids.get(p.id)!.push(e) }
    }
    const under = (id: string) => { const out: Entity[] = []; const st = [...(kids.get(id) || [])]; const seen = new Set<string>(); while (st.length) { const x = st.pop()!; if (seen.has(x.id)) continue; seen.add(x.id); out.push(x); st.push(...(kids.get(x.id) || [])) } return out }
    const pathOf = (e: Entity) => { const out: string[] = []; let p = parentOf.get(e.id); const seen = new Set<string>(); while (p && !seen.has(p.id)) { seen.add(p.id); if (['category', 'project', 'subproject'].includes(p.type)) out.unshift(p.title); p = parentOf.get(p.id) ?? null } return out.slice(-2).join(' › ') }
    const orderOf = (e: Entity) => (e.date || e.deadline || '9999') + String(9 - (e.priority ?? 0))
    const nextTask = (id: string) => under(id).filter((x) => x.type === 'task' && !x.done).sort((a, b) => Number(b.status === 'doing') - Number(a.status === 'doing') || orderOf(a).localeCompare(orderOf(b)))[0]
    const lastTouch = (list: Entity[]) => list.reduce((m, x) => (x.updatedAt > m ? x.updatedAt : m), '')

    // OÙ J'EN SUIS : tâches « En cours » + chantiers actifs (sous-projets / projets feuilles avec du travail ouvert)
    const doing = tasks.filter((x) => !x.done && x.status === 'doing')
    const containers = all.filter((e) => ['project', 'subproject'].includes(e.type) && !isMapCenter(e))
    const chantiers = containers
      .filter((c) => !(kids.get(c.id) || []).some((k) => ['project', 'subproject'].includes(k.type) && under(k.id).some((x) => x.type === 'task')))
      .map((c) => {
        const sub = under(c.id)
        const ts = sub.filter((x) => x.type === 'task')
        const open = ts.filter((x) => !x.done)
        const done = ts.length - open.length
        const ms = sub.filter((x) => x.type === 'milestone' && !x.done).sort((a, b) => orderOf(a).localeCompare(orderOf(b)))
        const step = ms.find((m) => under(m.id).some((x) => x.status === 'doing')) || ms[0]
        const recent = Date.now() - new Date(lastTouch([c, ...sub]) || 0).getTime() < 14 * 86400000
        const nDoing = open.filter((x) => x.status === 'doing').length
        return { c, path: pathOf(c), total: ts.length, done, open: open.length, nDoing, step, recent, pct: ts.length ? Math.round((done / ts.length) * 100) : (progressOf(ents, c) ?? 0), touch: lastTouch([c, ...sub]) }
      })
      .filter((x) => x.open > 0 || x.c.status === 'doing')
      .sort((a, b) => b.nDoing - a.nDoing || Number(b.recent) - Number(a.recent) || b.touch.localeCompare(a.touch))

    // OÙ JE VAIS : prochains jalons (datés d'abord) puis visions / objectifs ouverts, chacun avec sa prochaine étape
    const goals = all
      .filter((e) => ['milestone', 'objective', 'vision'].includes(e.type) && !e.done && e.status !== 'done' && !isMapCenter(e))
      .map((g) => ({ g, path: pathOf(g), pct: progressOf(ents, g) ?? 0, next: nextTask(g.id), when: g.date || g.deadline || null }))
      .filter((x) => x.next || x.when)
    const RANKG: Record<string, number> = { milestone: 0, objective: 1, vision: 2 }
    goals.sort((a, b) => (a.when ? 0 : 1) - (b.when ? 0 : 1) || (a.when || '').localeCompare(b.when || '') || RANKG[a.g.type] - RANKG[b.g.type] || b.pct - a.pct)
    return { doneRecent, milestonesDone, projects, objectives, nextMilestones, todayT, overdue, tasks, doing, chantiers, goals, pathOf }
  }, [ents])
  const hour = new Date().getHours()
  const name = useData((s) => s.settings.userName?.trim())
  const hello = hour < 5 ? 'Bonne nuit' : hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir'
  const doneWeek = d.tasks.filter((x) => x.done && x.doneAt && Date.now() - new Date(x.doneAt).getTime() < 7 * 86400000).length

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden">
      <div className="mx-auto max-w-5xl px-5 pb-28 pt-safe md:px-10 md:pb-12">
        <div className="text-sm text-mute">{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight md:text-4xl">{hello}{name ? `, ${name}` : ''}.</h1>
        <div className="mt-3 max-w-xl"><QuoteLine /></div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Stat n={d.todayT.length} l="aujourd’hui" />
          <Stat n={d.overdue.length} l="en retard / reportées" warn={d.overdue.length > 0} />
          <Stat n={d.chantiers.length} l="chantiers actifs" />
          <Stat n={doneWeek} l="terminées cette semaine" good />
        </div>

        <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2">
          <Block n="03" title="Ce que je dois faire" className="md:row-span-2">
            <TopThree large />
            <div className="mt-5">
              {d.todayT.slice(0, 8).map((x) => <TaskRow key={x.id} t={x} />)}
              {!d.todayT.length && <div className="py-4 text-sm text-mute">Rien de prévu aujourd’hui.</div>}
              <button className="mt-1 px-2 text-xs font-medium text-accent" onClick={() => useUI.getState().go('tasks')}>Toutes les tâches →</button>
            </div>
          </Block>

          <Block n="02" title="Où j’en suis" info="Ce qui est « En cours » (statut d’une tâche), puis l’avancement de tes chantiers : tâches faites / total, et l’étape actuelle (le jalon qui contient une tâche en cours, sinon le prochain jalon). Classés par activité récente.">
            {d.doing.length > 0 && (
              <div className="mb-3">
                <div className="mb-1 px-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#7aa7ff]">En cours · {d.doing.length}</div>
                {d.doing.slice(0, 5).map((x) => (
                  <button key={x.id} className="flex w-full min-w-0 items-center gap-2.5 rounded-xl px-2 py-1.5 text-left hover:bg-ink/[0.04]" onClick={() => useUI.getState().open(x.id)}>
                    <span className="relative flex h-2.5 w-2.5 shrink-0"><span className="absolute inset-0 animate-ping rounded-full bg-[#7aa7ff]/60" /><span className="relative h-2.5 w-2.5 rounded-full bg-[#7aa7ff]" /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{x.title}</span>{d.pathOf(x) && <span className="block truncate text-[11px] text-mute">{d.pathOf(x)}</span>}</span>
                  </button>
                ))}
              </div>
            )}
            {d.chantiers.slice(0, 5).map(({ c, path, done, total, step, nDoing, pct }) => (
              <button key={c.id} className="block w-full min-w-0 rounded-xl px-2 py-2 text-left hover:bg-ink/[0.04]" onClick={() => useUI.getState().open(c.id)}>
                <div className="flex min-w-0 items-center gap-2">
                  <TypeGlyph e={c} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{path ? <span className="text-mute">{path} › </span> : null}{c.title}</span>
                  {nDoing > 0 && <span className="shrink-0 rounded-full bg-[#7aa7ff]/15 px-1.5 py-0.5 text-[10px] font-medium text-[#7aa7ff]">{nDoing} en cours</span>}
                  <span className="shrink-0 font-mono text-[11px] text-mute">{done}/{total}</span>
                </div>
                <div className="mt-1.5 pl-7"><ProgressBar value={pct} color={c.color} slim /></div>
                {step && <div className="mt-1 truncate pl-7 text-[11.5px] text-mute"><span className="mr-1 inline-block h-2 w-2 rotate-45 rounded-[1px] border border-[#f4d58d]" />Étape : <span className="text-ink/80">{step.title}</span></div>}
              </button>
            ))}
            {!d.doing.length && !d.chantiers.length && <div className="text-sm text-mute">Rien en cours. Passe une tâche en « En cours » pour la voir ici.</div>}
          </Block>

          <Block n="04" title="Où je vais" info="Tes prochains caps : jalons datés d’abord (compte à rebours), puis objectifs et visions ouverts. Pour chacun : l’avancement et la prochaine tâche à faire pour avancer.">
            {d.goals.slice(0, 6).map(({ g, path, pct, next, when }) => {
              const days = when ? diffDays(when, t) : null
              return (
                <div key={g.id} className="min-w-0 rounded-xl px-2 py-2 hover:bg-ink/[0.04]">
                  <button className="flex w-full min-w-0 items-center gap-2 text-left" onClick={() => useUI.getState().open(g.id)}>
                    {g.type === 'milestone' ? <span className="ml-1 mr-0.5 h-2.5 w-2.5 shrink-0 rotate-45 rounded-[2px] border-[1.5px] border-[#f4d58d]" /> : <TypeGlyph e={g} size="sm" />}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{g.title}</span>
                    {days != null && <span className={`shrink-0 text-[11px] ${days < 0 ? 'text-[#ff8a8a]' : days <= 7 ? 'text-[#f2b45a]' : 'text-mute'}`}>{days < 0 ? `${-days} j de retard` : days === 0 ? 'aujourd’hui' : `dans ${days} j`}</span>}
                  </button>
                  <div className="mt-1.5 pl-7"><ProgressBar value={pct} color={g.color || (g.type === 'milestone' ? '#f4d58d' : '#6fe0b8')} slim /></div>
                  {path && <div className="mt-1 truncate pl-7 text-[11.5px] text-mute">{path}</div>}
                  {next && <div className="mt-0.5 flex min-w-0 items-center gap-1 pl-7 text-[11.5px] text-mute"><span className="shrink-0">→ Prochaine :</span><button className="min-w-0 truncate text-accent" onClick={() => useUI.getState().open(next.id)}>{next.title}</button></div>}
                </div>
              )
            })}
            {!d.goals.length && <div className="text-sm text-mute">Ajoute un jalon daté ou un objectif dans Projets pour voir ta direction.</div>}
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

function Block({ title, children, className = '', info }: { n: string; title: string; children: ReactNode; className?: string; info?: string }) {
  return (
    <section className={`card min-w-0 p-4 md:p-5 ${className}`}>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="font-display text-[15px] font-semibold">{title}</h2>{info && <Info text={info} />}
      </div>
      {children}
    </section>
  )
}
