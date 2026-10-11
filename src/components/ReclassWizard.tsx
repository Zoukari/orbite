import { useMemo, useState } from 'react'
import { useData, useUI, descendants } from '../lib/store'
import { TYPE_META } from '../lib/meta'
import { planParent, PLAN_TYPES, isMapCenter } from './ProjectTree'
import { Modal } from './ui'
import type { Entity, EntityType } from '../lib/types'

// Assistant : passe sur chaque élément existant et demande
// « c'est quoi ? » puis « ça fait partie de quoi ? ».

const LEVELS: { t: EntityType; label: string; hint: string }[] = [
  { t: 'project', label: 'Projet', hint: 'Grand domaine : Vie perso, Entrepreneuriat…' },
  { t: 'subproject', label: 'Sous-projet', hint: 'Branche d’un projet : Épargne, Shakpot…' },
  { t: 'vision', label: 'Vision', hint: 'Ce que tu veux devenir à long terme' },
  { t: 'objective', label: 'Objectif', hint: 'Résultat mesurable avec échéance' },
  { t: 'milestone', label: 'Jalon', hint: 'Palier vers un objectif' },
  { t: 'task', label: 'Tâche', hint: 'Action concrète' }
]
const RANK: Record<string, number> = { category: 0, project: 0, subproject: 1, vision: 2, objective: 3, milestone: 4, task: 5 }
// parents autorisés pour chaque niveau
const PARENTS: Record<string, EntityType[]> = {
  project: ['project', 'category'],
  subproject: ['project', 'subproject', 'category'],
  vision: ['subproject', 'project', 'category'],
  objective: ['vision', 'subproject', 'project', 'category'],
  milestone: ['objective'],
  task: ['milestone', 'objective', 'subproject', 'project', 'task']
}

function suggest(ents: Record<string, Entity>, e: Entity): EntityType {
  if (e.type === 'category') return planParent(ents, e) ? 'subproject' : 'project'
  if (e.type === 'project') { const p = planParent(ents, e); return p && (p.type === 'project' || p.type === 'category') ? 'subproject' : 'project' }
  if (e.type === 'idea') return 'task'
  return (PLAN_TYPES.includes(e.type) ? e.type : 'task') as EntityType
}

export function ReclassWizard() {
  const open = useUI((s) => s.reclass)
  const ents = useData((s) => s.entities)
  const [withTasks, setWithTasks] = useState(false)
  const [started, setStarted] = useState(false)
  const [i, setI] = useState(0)
  const [type, setType] = useState<EntityType | null>(null)
  const [parent, setParent] = useState<string | null | undefined>(undefined)
  const [q, setQ] = useState('')

  // liste figée au démarrage : du plus haut au plus bas niveau
  const queue = useMemo(() => {
    if (!started) return [] as string[]
    const depth = (e: Entity) => { let d = 0; let p = planParent(ents, e); const seen = new Set<string>(); while (p && !seen.has(p.id)) { seen.add(p.id); d++; p = planParent(ents, p) } return d }
    return Object.values(ents)
      .filter((e) => !e.archived && !e.deleted && !isMapCenter(e) && [...PLAN_TYPES, 'idea'].includes(e.type) && (withTasks || (e.type !== 'task' && e.type !== 'idea')) && !(e.type === 'task' && e.done))
      .sort((a, b) => depth(a) - depth(b) || (RANK[a.type] ?? 9) - (RANK[b.type] ?? 9) || (a.y ?? 0) - (b.y ?? 0))
      .map((e) => e.id)
  }, [started])

  if (!open) return null
  const close = () => { useUI.getState().set({ reclass: false }); setStarted(false); setI(0); setType(null); setParent(undefined) }

  if (!started)
    return (
      <Modal open onClose={close} title="Reclasser mes éléments">
        <div className="space-y-4 px-5 pb-5">
          <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-mute">
            {LEVELS.map((l, k) => <span key={l.t} className="flex items-center gap-1.5">{k > 0 && '→'}<b className="font-medium text-ink">{l.label}</b></span>)}
          </div>
          <p className="text-sm text-mute">Je te montre chaque élément un par un. Tu choisis ce que c’est, puis à quoi il appartient. Tu peux passer ou arrêter à tout moment, rien n’est supprimé.</p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={withTasks} onChange={(e) => setWithTasks(e.target.checked)} /> Inclure aussi les tâches et idées</label>
          <button className="btn-primary w-full" onClick={() => setStarted(true)}>Commencer</button>
        </div>
      </Modal>
    )

  const id = queue[i]
  const e = id ? ents[id] : undefined
  if (!e)
    return (
      <Modal open onClose={close} title="Reclassement terminé">
        <div className="space-y-4 px-5 pb-5 text-center">
          <div className="text-4xl">✦</div>
          <p className="text-sm text-mute">{queue.length} élément(s) passés en revue. Ta page Projets suit maintenant la nouvelle hiérarchie.</p>
          <button className="btn-primary w-full" onClick={() => { close(); useUI.getState().go('tasks') }}>Voir mes projets</button>
        </div>
      </Modal>
    )

  const curType = type ?? suggest(ents, e)
  const curParentEnt = planParent(ents, e)
  const allowed = PARENTS[curType] || []
  const forbidden = new Set([e.id, ...descendants(ents, e.id)])
  const candidates = Object.values(ents)
    .filter((x) => !x.archived && !forbidden.has(x.id) && !isMapCenter(x) && allowed.includes(x.type))
    .filter((x) => !q || x.title.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (RANK[a.type] ?? 9) - (RANK[b.type] ?? 9) || a.title.localeCompare(b.title))
  const defaultParent = curParentEnt && allowed.includes(curParentEnt.type) ? curParentEnt.id : curType === 'project' ? null : undefined
  const curParent = parent !== undefined ? parent : defaultParent
  const pathOf = (x: Entity) => { const out: string[] = []; let p = planParent(ents, x); const seen = new Set<string>(); while (p && !seen.has(p.id)) { seen.add(p.id); out.unshift(p.title); p = planParent(ents, p) } return out.join(' › ') }

  const next = () => { setI(i + 1); setType(null); setParent(undefined); setQ('') }
  const apply = () => {
    const s = useData.getState()
    const patch: Partial<Entity> = {}
    if (curType !== e.type) {
      Object.assign(patch, { type: curType })
      if (['project', 'subproject', 'objective', 'vision'].includes(curType) && !e.progressMode) patch.progressMode = 'auto'
      if (curType === 'task' && !e.status) patch.status = 'todo'
      if (e.type === 'idea' || e.inbox) patch.inbox = false
    }
    if (Object.keys(patch).length) s.update(e.id, patch, { action: 'moved', detail: `reclassé : ${TYPE_META[curType].label}` })
    if (curParent !== undefined && curParent !== (e.parentId ?? null)) {
      const target = curParent ? s.entities[curParent] : null
      s.moveUnder(e.id, curParent, target?.mapId ?? e.mapId ?? null)
      // le lien projet/objectif suit le nouveau parent
      if (target) s.update(e.id, { projectIds: (s.entities[e.id].projectIds || []).filter((p) => p !== target.id), objectiveIds: (s.entities[e.id].objectiveIds || []).filter((p) => p !== target.id) })
    }
    next()
  }

  return (
    <Modal open onClose={close} title={<span>Reclasser <span className="font-mono text-xs font-normal text-mute">{i + 1} / {queue.length}</span></span>} wide>
      <div className="space-y-4 px-5 pb-5">
        <div className="h-1 overflow-hidden rounded-full bg-ink/10"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(i / queue.length) * 100}%` }} /></div>
        <div className="rounded-2xl border border-line/70 bg-raised/50 p-4">
          <div className="text-[11px] text-mute">{pathOf(e) || 'Racine'} · actuellement : {TYPE_META[e.type].label}</div>
          <div className="mt-1 flex items-center gap-2 font-display text-lg font-semibold"><span style={{ color: e.color || TYPE_META[e.type].tint }}>{e.icon || TYPE_META[e.type].glyph}</span>{e.title || 'Sans titre'}</div>
        </div>

        <div>
          <div className="mb-2 text-sm font-medium">1. « {e.title} », c’est quoi ?</div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {LEVELS.map((l) => (
              <button key={l.t} onClick={() => { setType(l.t); setParent(undefined) }} className={`rounded-xl border px-3 py-2 text-left transition ${curType === l.t ? 'border-accent bg-accent/10' : 'border-line/70 hover:bg-ink/5'}`}>
                <div className="flex items-center gap-1.5 text-[13px] font-semibold"><span style={{ color: TYPE_META[l.t].tint }}>{TYPE_META[l.t].glyph}</span>{l.label}</div>
                <div className="text-[10.5px] leading-snug text-mute">{l.hint}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 text-sm font-medium">2. Il fait partie de…</div>
          <input className="input mb-2 !py-1.5 text-sm" placeholder="Rechercher…" value={q} onChange={(ev) => setQ(ev.target.value)} />
          <div className="max-h-48 space-y-0.5 overflow-y-auto rounded-xl border border-line/60 p-1">
            {(curType === 'project' || curType === 'subproject' || curType === 'vision' || curType === 'objective') && (
              <button onClick={() => setParent(null)} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm ${curParent === null ? 'bg-accent/15 text-accent' : 'hover:bg-ink/5'}`}>◌ Rien (niveau le plus haut)</button>
            )}
            {candidates.map((x) => (
              <button key={x.id} onClick={() => setParent(x.id)} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left ${curParent === x.id ? 'bg-accent/15' : 'hover:bg-ink/5'}`}>
                <span className="w-4 text-center text-[13px]" style={{ color: x.color || TYPE_META[x.type].tint }}>{x.icon || TYPE_META[x.type].glyph}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm ${curParent === x.id ? 'text-accent' : ''}`}>{x.title}</span>
                  <span className="block truncate text-[10.5px] text-mute">{TYPE_META[x.type].label}{pathOf(x) ? ` · ${pathOf(x)}` : ''}</span>
                </span>
              </button>
            ))}
            {!candidates.length && <div className="px-3 py-3 text-xs text-mute">Aucun {curType === 'milestone' ? 'objectif' : 'parent possible'} pour l’instant. Tu pourras le ranger plus tard.</div>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="btn-ghost text-xs" onClick={close}>Arrêter</button>
          <div className="flex-1" />
          <button className="btn-soft text-xs" onClick={next}>Passer</button>
          <button className="btn-primary" onClick={apply}>Valider →</button>
        </div>
      </div>
    </Modal>
  )
}
