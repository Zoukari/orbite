import { useMemo, useState } from 'react'
import { useData, useUI, progressOf } from '../lib/store'
import { planParent, isMapCenter } from '../components/ProjectTree'
import type { Entity } from '../lib/types'
import { fmtDay, horizonOf, today, diffDays } from '../lib/dates'
import { TopThree } from '../components/Priorities'
import { TaskRow } from '../components/TaskRow'
import { QuoteLine } from '../components/Quote'
import { ProgressBar, TypeGlyph, Icon, Info, Modal } from '../components/ui'
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
    // ── suivi choisi (Réglages accueil) ──
    const stats = (id: string) => { const ts = under(id).filter((x) => x.type === 'task'); const done = ts.filter((x) => x.done).length; return { done, total: ts.length, pct: ts.length ? Math.round((done / ts.length) * 100) : (progressOf(ents, ents[id]) ?? 0) } }
    const milestonesOf = (id: string) => under(id).filter((x) => x.type === 'milestone' && !x.done).sort((a, b) => orderOf(a).localeCompare(orderOf(b)))
    const visionsOf = (id: string) => { const sub = under(id).filter((x) => !x.done && x.status !== 'done'); const v = sub.filter((x) => x.type === 'vision'); return v.length ? v : sub.filter((x) => x.type === 'objective') }
    const containerOf = (e: Entity) => { let p = parentOf.get(e.id); const seen = new Set<string>(); while (p && !seen.has(p.id)) { seen.add(p.id); if (['project', 'subproject'].includes(p.type)) return p; p = parentOf.get(p.id) ?? null } return null }
    const ancestorIds = (e: Entity) => { const out = new Set<string>(); let p = parentOf.get(e.id); while (p && !out.has(p.id)) { out.add(p.id); p = parentOf.get(p.id) ?? null } return out }
    return { doneRecent, milestonesDone, projects, objectives, nextMilestones, todayT, overdue, tasks, doing, chantiers, goals, pathOf, stats, milestonesOf, visionsOf, nextTask, containerOf, ancestorIds, containers }
  }, [ents])
  const focus = useData((s) => s.settings.homeFocus)
  const [pickFocus, setPickFocus] = useState(false)
  const fProjects = (focus?.projects || []).map((id) => ents[id]).filter((e) => e && !e.archived)
  const fMilestones = (focus?.milestones || []).map((id) => ents[id]).filter((e) => e && !e.archived)
  const custom = fProjects.length > 0 || fMilestones.length > 0
  const countdown = (when?: string | null) => { if (!when) return null; const n = diffDays(when, t); return <span className={`shrink-0 text-[11px] ${n < 0 ? 'text-[#ff8a8a]' : n <= 7 ? 'text-[#f2b45a]' : 'text-mute'}`}>{n < 0 ? `${-n} j de retard` : n === 0 ? 'aujourd’hui' : `dans ${n} j`}</span> }
  const choose = <button className="ml-auto text-[11px] font-medium text-accent" onClick={() => setPickFocus(true)}>{custom ? 'Modifier' : 'Choisir'}</button>
  const MRow = ({ m }: { m: Entity }) => {
    const st = d.stats(m.id)
    return (
      <button className="flex w-full min-w-0 items-center gap-2 rounded-lg py-1 pl-7 pr-1 text-left text-[12.5px] hover:bg-ink/[0.04]" onClick={() => useUI.getState().open(m.id)}>
        <span className={`h-2.5 w-2.5 shrink-0 rotate-45 rounded-[2px] border-[1.5px] border-[#f4d58d] ${m.done ? 'bg-[#f4d58d]' : ''}`} />
        <span className="min-w-0 flex-1 truncate">{m.title}</span>
        <span className="shrink-0 font-mono text-[10.5px] text-mute">{st.total ? `${st.done}/${st.total}` : ''}</span>
        {countdown(m.date)}
      </button>
    )
  }
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

          <Block n="02" title="Où j’en suis" right={choose} info="Tu choisis les projets et jalons à suivre (bouton Choisir). Pour chaque projet : tâches faites / total et ses jalons suivis (sinon le prochain jalon). Sans choix, Orbite affiche tes chantiers les plus actifs.">
            {custom && (
              <div className="mb-1 space-y-1">
                {fProjects.map((p) => {
                  const st = d.stats(p.id)
                  const chosenMs = fMilestones.filter((m) => d.ancestorIds(m).has(p.id))
                  const ms = chosenMs.length ? chosenMs : d.milestonesOf(p.id).slice(0, 1)
                  const path = d.pathOf(p)
                  return (
                    <div key={p.id} className="min-w-0 rounded-xl py-1">
                      <button className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-ink/[0.04]" onClick={() => useUI.getState().open(p.id)}>
                        <TypeGlyph e={p} size="sm" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{path ? <span className="text-mute">{path} › </span> : null}{p.title}</span>
                        <span className="shrink-0 font-mono text-[11px] text-mute">{st.done}/{st.total}</span>
                      </button>
                      <div className="px-2 pl-9"><ProgressBar value={st.pct} color={p.color} slim /></div>
                      <div className="mt-0.5 px-2">{ms.map((m) => <MRow key={m.id} m={m} />)}</div>
                    </div>
                  )
                })}
                {(() => {
                  const loose = fMilestones.filter((m) => !fProjects.some((p) => d.ancestorIds(m).has(p.id)))
                  if (!loose.length) return null
                  return <div className="px-2 pt-1"><div className="mb-0.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-mute">Jalons suivis</div>{loose.map((m) => <MRow key={m.id} m={m} />)}</div>
                })()}
              </div>
            )}
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
            {!custom && d.chantiers.slice(0, 5).map(({ c, path, done, total, step, nDoing, pct }) => (
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

          <Block n="04" title="Où je vais" right={fProjects.length ? undefined : choose} info="Les visions des projets que tu suis (ou leurs objectifs s’ils n’ont pas de vision) : avancement, prochain jalon et prochaine tâche. Sans choix : tes prochains jalons datés.">
            {fProjects.length > 0 && fProjects.flatMap((p) => d.visionsOf(p.id).map((v) => ({ p, v }))).map(({ p, v }) => {
              const nm = d.milestonesOf(v.id)[0]
              const next = d.nextTask(v.id)
              return (
                <div key={v.id} className="min-w-0 rounded-xl px-2 py-2 hover:bg-ink/[0.04]">
                  <button className="flex w-full min-w-0 items-center gap-2 text-left" onClick={() => useUI.getState().open(v.id)}>
                    <TypeGlyph e={v} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{v.title}</span>
                    {countdown(v.deadline || v.date)}
                  </button>
                  <div className="mt-1.5 pl-7"><ProgressBar value={progressOf(ents, v) ?? 0} color={v.color || p.color || '#6fe0b8'} slim /></div>
                  <div className="mt-1 truncate pl-7 text-[11.5px] text-mute">{p.title}</div>
                  {nm && <button className="mt-0.5 flex w-full min-w-0 items-center gap-1.5 pl-7 text-left text-[11.5px] text-mute" onClick={() => useUI.getState().open(nm.id)}><span className="h-2 w-2 shrink-0 rotate-45 rounded-[1px] border border-[#f4d58d]" /><span className="shrink-0">Prochain jalon :</span><span className="min-w-0 truncate text-ink/85">{nm.title}</span>{countdown(nm.date)}</button>}
                  {next && <div className="mt-0.5 flex min-w-0 items-center gap-1 pl-7 text-[11.5px] text-mute"><span className="shrink-0">→ Prochaine tâche :</span><button className="min-w-0 truncate text-accent" onClick={() => useUI.getState().open(next.id)}>{next.title}</button></div>}
                </div>
              )
            })}
            {fProjects.length > 0 && !fProjects.some((p) => d.visionsOf(p.id).length) && <div className="text-sm text-mute">Aucune vision dans ces projets. Ajoute-en une dans Projets.</div>}
            {!fProjects.length && d.goals.slice(0, 6).map(({ g, path, pct, next, when }) => {
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
            {!fProjects.length && !d.goals.length && <div className="text-sm text-mute">Ajoute un jalon daté ou un objectif dans Projets pour voir ta direction.</div>}
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
      {pickFocus && <FocusPicker containers={d.containers} pathOf={d.pathOf} containerOf={d.containerOf} onClose={() => setPickFocus(false)} />}
    </div>
  )
}

function FocusPicker({ containers, pathOf, containerOf, onClose }: { containers: Entity[]; pathOf: (e: Entity) => string; containerOf: (e: Entity) => Entity | null; onClose: () => void }) {
  const ents = useData((s) => s.entities)
  const cur = useData((s) => s.settings.homeFocus)
  const [ps, setPs] = useState<string[]>(cur?.projects || [])
  const [ms, setMs] = useState<string[]>(cur?.milestones || [])
  const [tab, setTab] = useState<'p' | 'm'>('p')
  const tog = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  const projects = containers.filter((c) => !c.done).map((c) => ({ c, label: (pathOf(c) ? pathOf(c) + ' › ' : '') + c.title })).sort((a, b) => a.label.localeCompare(b.label))
  const groups = useMemo(() => {
    const m = new Map<string, Entity[]>()
    for (const e of Object.values(ents)) {
      if (e.type !== 'milestone' || e.done || e.archived) continue
      const c = containerOf(e)
      const key = c ? (pathOf(c) ? pathOf(c) + ' › ' : '') + c.title : 'Sans projet'
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(e)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [ents, containerOf, pathOf])
  const Check = ({ on }: { on: boolean }) => <span className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px] border ${on ? 'border-accent bg-accent text-bg' : 'border-line'}`}>{on && <Icon name="check" className="h-3 w-3" stroke={3} />}</span>
  const save = () => { useData.getState().setSettings({ homeFocus: { projects: ps, milestones: ms } }); onClose() }
  return (
    <Modal open onClose={onClose} title="Projets et jalons suivis" wide>
      <div className="px-4 pb-4">
        <div className="mb-3 flex gap-1 rounded-xl bg-ink/[0.05] p-1 text-sm">
          <button className={`flex-1 rounded-lg py-1.5 ${tab === 'p' ? 'bg-surface font-medium shadow-sm' : 'text-mute'}`} onClick={() => setTab('p')}>Projets · {ps.length}</button>
          <button className={`flex-1 rounded-lg py-1.5 ${tab === 'm' ? 'bg-surface font-medium shadow-sm' : 'text-mute'}`} onClick={() => setTab('m')}>Jalons · {ms.length}</button>
        </div>
        <div className="mb-2 text-[12px] text-mute">{tab === 'p' ? '« Où j’en suis » montre ces projets, « Où je vais » montre leurs visions.' : 'Les jalons que tu veux voir avancer dans « Où j’en suis ».'}</div>
        <div className="max-h-[52vh] overflow-y-auto pr-1">
          {tab === 'p' && projects.map(({ c, label }) => (
            <button key={c.id} onClick={() => tog(ps, setPs, c.id)} className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left text-sm ${ps.includes(c.id) ? 'bg-accent/10' : 'hover:bg-ink/5'}`}>
              <Check on={ps.includes(c.id)} /><TypeGlyph e={c} size="sm" /><span className="min-w-0 flex-1 truncate">{label}</span>
            </button>
          ))}
          {tab === 'p' && !projects.length && <div className="py-6 text-center text-sm text-mute">Aucun projet.</div>}
          {tab === 'm' && groups.map(([label, list]) => (
            <div key={label} className="mb-2">
              <div className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-mute">{label}</div>
              {list.map((m) => (
                <button key={m.id} onClick={() => tog(ms, setMs, m.id)} className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left text-sm ${ms.includes(m.id) ? 'bg-accent/10' : 'hover:bg-ink/5'}`}>
                  <Check on={ms.includes(m.id)} /><span className="h-2.5 w-2.5 shrink-0 rotate-45 rounded-[2px] border-[1.5px] border-[#f4d58d]" /><span className="min-w-0 flex-1 truncate">{m.title}</span>{m.date && <span className="text-[11px] text-mute">{fmtDay(m.date)}</span>}
                </button>
              ))}
            </div>
          ))}
          {tab === 'm' && !groups.length && <div className="py-6 text-center text-sm text-mute">Aucun jalon ouvert.</div>}
        </div>
        <div className="mt-3 flex items-center gap-2">
          {(ps.length > 0 || ms.length > 0) && <button className="btn-ghost text-xs" onClick={() => { setPs([]); setMs([]) }}>Tout effacer</button>}
          <div className="flex-1" />
          <button className="btn-ghost text-xs" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={save}>Valider</button>
        </div>
      </div>
    </Modal>
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

function Block({ title, children, className = '', info, right }: { n: string; title: string; children: ReactNode; className?: string; info?: string; right?: ReactNode }) {
  return (
    <section className={`card min-w-0 p-4 md:p-5 ${className}`}>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="font-display text-[15px] font-semibold">{title}</h2>{info && <Info text={info} />}{right}
      </div>
      {children}
    </section>
  )
}
