import { memo, useEffect, useRef, useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useData, useUI, resolve, displayTitle } from '../lib/store'
import { TYPE_META } from '../lib/meta'
import { fmtDay, today } from '../lib/dates'

export interface NodeData {
  id: string
  hidden: number // nb d'éléments masqués si branche réduite
  childCount: number
  progress: number | null
  urgent: number
  float: boolean
  delay: number
  [key: string]: unknown
}

function EntityNodeImpl({ data, selected }: NodeProps) {
  const d = data as NodeData
  const e = useData((s) => s.entities[d.id])
  const target = useData((s) => (e?.type === 'ref' && e.refId ? s.entities[e.refId] : undefined))
  const statuses = useData((s) => s.settings.statuses)
  const prios = useData((s) => s.settings.priorities)
  const editing = useUI((s) => s.editingId === d.id)
  const connectFrom = useUI((s) => s.connectFrom)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const press = useRef<{ t: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null)

  useEffect(() => {
    if (editing && e) {
      setDraft(resolve(useData.getState().entities, e).title)
      setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 30)
    }
  }, [editing])

  if (!e) return null
  const r = target ?? e // contenu affiché (référence résolue)
  const meta = TYPE_META[r.type]
  const isRef = e.type === 'ref'
  const color = r.color || meta.tint
  const big = ['vision', 'category', 'map'].includes(r.type) && !e.parentId
  const isProj = ['project', 'subproject', 'objective'].includes(r.type)
  const st = statuses.find((s) => s.id === r.status)
  const prio = prios.find((p) => p.level === r.priority)
  const overdue = r.type === 'task' && !r.done && r.date && r.date < today()

  const commit = () => {
    const t = draft.trim()
    if (t) useData.getState().update(r.id, { title: t })
    useUI.getState().set({ editingId: null })
  }

  // appui long (mobile) → menu contextuel
  const onPointerDown = (ev: React.PointerEvent) => {
    if (ev.pointerType === 'mouse') return
    const { clientX: x, clientY: y } = ev
    press.current = { x, y, t: setTimeout(() => { useUI.getState().set({ menu: { id: e.id, x, y } }); navigator.vibrate?.(8) }, 520) }
  }
  const cancelPress = (ev?: React.PointerEvent) => {
    if (!press.current) return
    if (ev && ev.type === 'pointermove' && Math.hypot(ev.clientX - press.current.x, ev.clientY - press.current.y) < 8) return
    clearTimeout(press.current.t)
    press.current = null
  }

  const shape = meta.shape
  const radius = shape === 'orb' ? 'rounded-full' : shape === 'chip' ? 'rounded-xl' : shape === 'diamond' ? 'rounded-xl' : 'rounded-2xl'

  return (
    <div
      className={d.float ? 'floating' : ''}
      style={{ ['--float-delay' as any]: `${d.delay}s`, ['--float-dur' as any]: `${6 + (d.delay % 3)}s` }}
      onPointerDown={onPointerDown}
      onPointerUp={() => cancelPress()}
      onPointerMove={cancelPress}
      onPointerCancel={() => cancelPress()}
    >
      <Handle type="source" position={Position.Left} id="l" />
      <Handle type="source" position={Position.Right} id="r" />
      <Handle type="source" position={Position.Top} id="t" />
      <Handle type="source" position={Position.Bottom} id="b" />
      <div
        className={`node-body relative ${radius} border backdrop-blur-md transition-[box-shadow,border-color] duration-200 ${big ? 'px-6 py-4' : isProj ? 'px-3.5 py-2.5' : 'px-3 py-2'} ${r.priority && r.priority >= 4 && !r.done ? `prio-${r.priority}` : ''}`}
        style={{
          background: 'var(--node-bg)',
          borderColor: selected ? 'rgb(var(--accent))' : connectFrom === e.id ? '#6fe0b8' : isProj || big ? `${color}55` : 'var(--node-border)',
          boxShadow: selected ? '0 0 0 3px rgb(var(--accent) / 0.18), var(--node-shadow)' : 'var(--node-shadow)',
          minWidth: big ? 160 : isProj ? 190 : 120,
          maxWidth: isProj ? 260 : 240,
          opacity: r.done || r.archived ? 0.55 : 1,
          borderStyle: isRef ? 'dashed' : 'solid'
        }}
      >
        {(big || isProj) && <div className="node-glow" style={{ background: `radial-gradient(closest-side, ${color}33, transparent)` }} />}
        <div className="relative flex items-center gap-2">
          {r.type === 'task' ? (
            <button
              className="nodrag flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition"
              style={{ borderColor: r.done ? '#6fe0b8' : prio?.color || 'rgb(var(--line))', background: r.done ? '#6fe0b8' : 'transparent' }}
              onClick={(ev) => { ev.stopPropagation(); useData.getState().toggleDone(r.id) }}
              aria-label="Terminer"
            >
              {r.done && <svg viewBox="0 0 16 16" className="h-3 w-3 text-bg"><path d="M4 8.5l2.5 2.5L12 5.5" stroke="currentColor" strokeWidth="2.2" fill="none" /></svg>}
            </button>
          ) : shape === 'diamond' ? (
            <span className="h-3 w-3 shrink-0 rotate-45 rounded-[3px]" style={{ background: r.done || r.status === 'done' ? color : 'transparent', border: `1.5px solid ${color}` }} />
          ) : (
            <span className={`shrink-0 text-center leading-none ${big ? 'text-lg' : 'text-[13px]'}`} style={{ color }}>{r.icon || meta.glyph}</span>
          )}
          {editing ? (
            <input
              ref={inputRef}
              autoFocus
              className="nodrag w-full min-w-[120px] bg-transparent text-[13px] font-medium outline-none"
              value={draft}
              onChange={(ev) => setDraft(ev.target.value)}
              onBlur={commit}
              onKeyDown={(ev) => {
                ev.stopPropagation()
                if (ev.key === 'Enter') commit()
                if (ev.key === 'Escape') useUI.getState().set({ editingId: null })
              }}
            />
          ) : (
            <div className={`min-w-0 flex-1 ${big ? 'font-display text-[15px] font-semibold tracking-[0.04em]' : isProj ? 'text-[13.5px] font-semibold' : 'text-[13px] font-medium'} ${r.done ? 'line-through' : ''} leading-snug`}>
              <span className="line-clamp-2 break-words">{displayTitle(useData.getState().entities, e)}</span>
            </div>
          )}
          {isRef && <span className="text-[10px] text-mute" title="Référence : le contenu vient de l'original">⇢</span>}
          {r.favorite && <span className="text-[10px] text-[#f2b45a]">★</span>}
        </div>

        {isProj && (st || d.progress != null || d.urgent > 0) && (
          <div className="relative mt-1.5 space-y-1.5">
            <div className="flex items-center gap-2 text-[11px]">
              {st && <span className="inline-flex items-center gap-1" style={{ color: st.color }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: st.color }} />{st.label}</span>}
              {d.urgent > 0 && <span className="text-[#f2b45a]">· {d.urgent} urgente{d.urgent > 1 ? 's' : ''}</span>}
            </div>
            {d.progress != null && (
              <div className="flex items-center gap-2">
                <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-ink/10"><div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${d.progress}%`, background: color }} /></div>
                <span className="font-mono text-[10px] tabular-nums text-mute">{d.progress}%</span>
              </div>
            )}
          </div>
        )}

        {(r.type === 'task' || r.type === 'milestone') && (r.date || r.postponed) && !r.done && (
          <div className={`relative mt-1 flex items-center gap-1.5 pl-[26px] text-[10.5px] ${overdue ? 'text-[#ff8a8a]' : 'text-mute'}`}>
            {r.date && <span>{fmtDay(r.date)}</span>}
            {!!r.postponed && <span className="text-[#f2b45a]">↻ {r.postponed}</span>}
          </div>
        )}

        {r.type === 'maplink' && (
          <button className="nodrag relative mt-1.5 text-[11px] font-medium text-accent" onClick={(ev) => { ev.stopPropagation(); if (r.targetMapId) { useData.getState().setSettings({ activeMapId: r.targetMapId }); useUI.getState().go('map') } }}>
            Ouvrir la map →
          </button>
        )}

        {d.hidden > 0 && (
          <button
            className="nodrag absolute -right-3 top-1/2 -translate-y-1/2 translate-x-full rounded-full border border-line bg-surface px-2 py-0.5 text-[10.5px] font-medium text-mute shadow-sm hover:text-ink"
            onClick={(ev) => { ev.stopPropagation(); useData.getState().update(e.id, { collapsed: false }) }}
          >
            +{d.hidden} élément{d.hidden > 1 ? 's' : ''}
          </button>
        )}
      </div>
    </div>
  )
}

export const EntityNode = memo(EntityNodeImpl)
