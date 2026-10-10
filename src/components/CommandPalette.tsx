import { useEffect, useMemo, useState } from 'react'
import { useData, useUI, pathLabel, displayTitle, resolve } from '../lib/store'
import { COMMANDS, matchCommand } from '../lib/commands'
import { TYPE_META } from '../lib/meta'
import { plainExcerpt } from '../lib/markdown'
import { fmtDay } from '../lib/dates'
import { Icon, Modal, TypeGlyph } from './ui'
import type { Entity, EntityType } from '../lib/types'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const TYPE_FILTERS: { key: string; label: string; types: EntityType[] }[] = [
  { key: 'all', label: 'Tout', types: [] },
  { key: 'project', label: 'Projets', types: ['project', 'subproject'] },
  { key: 'task', label: 'Tâches', types: ['task'] },
  { key: 'note', label: 'Notes', types: ['note', 'idea', 'text', 'checklist', 'document', 'link'] },
  { key: 'objective', label: 'Objectifs', types: ['objective', 'milestone'] },
  { key: 'person', label: 'Personnes', types: ['person'] },
  { key: 'map', label: 'Maps', types: ['map', 'category', 'vision'] }
]

// Recherche universelle + Command Center (règles locales, pas d'IA)
export function CommandPalette() {
  const open = useUI((s) => s.palette)
  const initial = useUI((s) => s.paletteQuery)
  const ents = useData((s) => s.entities)
  const settings = useData((s) => s.settings)
  const [q, setQ] = useState('')
  const [tf, setTf] = useState('all')
  const [status, setStatus] = useState('')
  const [prio, setPrio] = useState(0)
  const [cmdId, setCmdId] = useState<string | null>(null)
  const [idx, setIdx] = useState(0)

  useEffect(() => { if (open) { setQ(initial || ''); setCmdId(null); setIdx(0) } }, [open])

  const cmd = cmdId ? COMMANDS.find((c) => c.id === cmdId)! : matchCommand(q.replace(/^[?>]\s*/, ''))
  const cmdResult = useMemo(() => (cmd && (cmdId || q.startsWith('?') || q.trim().endsWith('?') || q.length > 5) ? cmd.run(ents) : null), [cmd, ents, cmdId, q])

  const results = useMemo(() => {
    const nq = norm(q.trim())
    const types = TYPE_FILTERS.find((f) => f.key === tf)!.types
    const tagQ = nq.startsWith('#') ? nq.slice(1) : null
    const out: { e: Entity; score: number }[] = []
    for (const raw of Object.values(ents)) {
      if (raw.type === 'ref') continue
      const e = raw
      if (types.length && !types.includes(e.type)) continue
      if (status && e.status !== status) continue
      if (prio && (e.priority ?? 0) !== prio) continue
      let score = 0
      if (!nq) score = e.favorite ? 3 : 1
      else if (tagQ) score = e.tags?.some((t) => norm(t).includes(tagQ)) ? 5 : 0
      else {
        const t = norm(e.title)
        if (t === nq) score = 10
        else if (t.startsWith(nq)) score = 7
        else if (t.includes(nq)) score = 5
        else if (e.tags?.some((x) => norm(x).includes(nq))) score = 3
        else if (e.description && norm(e.description).includes(nq)) score = 2
        else if (e.comments?.some((c) => norm(c.text).includes(nq)) || e.checklist?.some((c) => norm(c.text).includes(nq))) score = 1
      }
      if (score) out.push({ e, score: score - (e.archived ? 2 : 0) - (e.done ? 1 : 0) })
    }
    out.sort((a, b) => b.score - a.score || b.e.updatedAt.localeCompare(a.e.updatedAt))
    return out.slice(0, nq || tf !== 'all' || status || prio ? 50 : 12).map((x) => x.e)
  }, [q, tf, status, prio, ents])

  if (!open) return null
  const close = () => useUI.getState().set({ palette: false, paletteQuery: '' })
  const go = (e: Entity) => { close(); useUI.getState().open(e.id) }
  const list = cmdResult && (cmdId || q.trim().endsWith('?') || q.startsWith('?')) ? cmdResult.items : results

  return (
    <Modal open onClose={close} wide bare>
      <div className="flex items-center gap-2 border-b border-line/60 px-4 py-3">
        <Icon name="search" className="h-5 w-5 text-mute" />
        <input
          autoFocus
          className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-mute/60"
          placeholder="Rechercher partout… ou poser une question (« qu’ai-je d’urgent ? »)"
          value={q}
          onChange={(e) => { setQ(e.target.value); setCmdId(null); setIdx(0) }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, list.length - 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)) }
            if (e.key === 'Enter' && list[idx]) go(list[idx])
          }}
        />
        <kbd className="hidden rounded-md border border-line px-1.5 text-[10px] text-mute md:block">esc</kbd>
      </div>

      {!q && !cmdId && (
        <div className="border-b border-line/60 px-3 py-2.5">
          <div className="section-title mb-1.5 px-1">Command Center</div>
          <div className="flex flex-wrap gap-1.5">
            {COMMANDS.map((c) => (
              <button key={c.id} onClick={() => setCmdId(c.id)} className="chip !px-2.5 !py-1 !text-[11.5px] hover:!text-ink"><Icon name="bolt" className="h-3 w-3" />{c.label}</button>
            ))}
          </div>
        </div>
      )}

      {cmdResult && (cmdId || q.trim().endsWith('?') || q.startsWith('?')) ? (
        <div className="px-3 py-3">
          <div className="mb-1 flex items-center justify-between px-1">
            <div className="font-display text-sm font-semibold">{cmdResult.title} <span className="font-mono text-xs text-mute">{cmdResult.items.length}</span></div>
            {cmdId && <button className="text-xs text-mute hover:text-ink" onClick={() => setCmdId(null)}>← retour</button>}
          </div>
          {cmdResult.items.length ? cmdResult.items.map((e, i) => <ResultRow key={e.id} e={e} active={i === idx} meta={cmdResult.meta?.(e)} onClick={() => go(e)} />) : <div className="px-2 py-6 text-center text-sm text-mute">{cmdResult.empty}</div>}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3">
            {TYPE_FILTERS.map((f) => <button key={f.key} onClick={() => setTf(f.key)} className={`chip !py-1 ${tf === f.key ? '!border-accent !text-accent' : ''}`}>{f.label}</button>)}
            <select className="chip !py-1 bg-transparent" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Statut</option>
              {settings.statuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <select className="chip !py-1 bg-transparent" value={prio} onChange={(e) => setPrio(Number(e.target.value))}>
              <option value={0}>Priorité</option>
              {settings.priorities.map((p) => <option key={p.level} value={p.level}>{p.label}</option>)}
            </select>
          </div>
          {cmd && q.length > 3 && !q.trim().endsWith('?') && (
            <button className="mx-3 mt-2 flex w-[calc(100%-1.5rem)] items-center gap-2 rounded-xl bg-accent/10 px-3 py-2 text-left text-sm text-accent" onClick={() => setCmdId(cmd.id)}>
              <Icon name="bolt" className="h-4 w-4" /> {cmd.label}
            </button>
          )}
          <div className="px-3 py-2">
            {!q && <div className="section-title px-1 pb-1">{results.some((r) => r.favorite) ? 'Favoris & récents' : 'Récents'}</div>}
            {results.map((e, i) => <ResultRow key={e.id} e={e} active={i === idx} onClick={() => go(e)} />)}
            {q && !results.length && <div className="px-2 py-6 text-center text-sm text-mute">Aucun résultat.</div>}
          </div>
        </>
      )}
    </Modal>
  )
}

function ResultRow({ e, onClick, active, meta }: { e: Entity; onClick: () => void; active?: boolean; meta?: string }) {
  const ents = useData((s) => s.entities)
  const map = e.mapId ? ents[e.mapId] : undefined
  const path = [map?.title, pathLabel(ents, e.id)].filter(Boolean).join(' › ')
  const r = resolve(ents, e)
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition ${active ? 'bg-ink/[0.06]' : 'hover:bg-ink/[0.04]'}`}>
      <TypeGlyph e={r} size="sm" />
      <div className="min-w-0 flex-1">
        <div className={`truncate text-sm ${r.done ? 'text-mute line-through' : ''}`}>{displayTitle(ents, e)}</div>
        <div className="truncate text-[11px] text-mute">
          {TYPE_META[r.type].label}{path ? ` · ${path}` : ''}{r.date ? ` · ${fmtDay(r.date)}` : ''}{!path && r.description ? ` · ${plainExcerpt(r.description, 60)}` : ''}
        </div>
      </div>
      {meta && <span className="shrink-0 text-[11px] text-[#f2b45a]">{meta}</span>}
      {r.favorite && <span className="text-[11px] text-[#f2b45a]">★</span>}
    </button>
  )
}
