import { memo, useCallback, useEffect, useMemo } from 'react'
import { ReactFlow, ReactFlowProvider, useNodesState, useReactFlow, type Node, type NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useData, useUI } from '../lib/store'
import { TYPE_META } from '../lib/meta'
import { plainExcerpt } from '../lib/markdown'
import { Starfield } from '../map/Starfield'
import { useIsMobile } from '../components/ui'
import type { Entity } from '../lib/types'

// Tableau libre : chaque note se pose où on veut (position gardée dans meta.board).

const W = 230
const pos = (e: Entity, i: number) => {
  const b = (e.meta as any)?.board as { x: number; y: number } | undefined
  return b ?? { x: (i % 4) * (W + 30), y: Math.floor(i / 4) * 210 }
}

function NoteCardImpl({ data, selected }: NodeProps) {
  const e = useData((s) => s.entities[(data as any).id])
  if (!e) return null
  const tint = e.color || TYPE_META[e.type].tint
  const items = e.checklist || []
  return (
    <div
      className="rounded-2xl border p-3.5 backdrop-blur-md transition-shadow"
      style={{
        width: W,
        background: `linear-gradient(160deg, ${tint}22, var(--node-bg) 55%)`,
        borderColor: selected ? 'rgb(var(--accent))' : `${tint}44`,
        boxShadow: selected ? '0 0 0 3px rgb(var(--accent) / .18), var(--node-shadow)' : 'var(--node-shadow)'
      }}
    >
      <div className="mb-1 flex items-center gap-1.5 text-[10.5px] text-mute">
        <span style={{ color: tint }}>{TYPE_META[e.type].glyph}</span>{TYPE_META[e.type].label}
        {e.favorite && <span className="ml-auto text-[#f2b45a]">★</span>}
      </div>
      <div className="text-[14px] font-semibold leading-snug">{e.title || 'Sans titre'}</div>
      {e.description && <div className="mt-1.5 line-clamp-6 whitespace-pre-line text-[12.5px] leading-relaxed text-ink/70">{plainExcerpt(e.description, 260)}</div>}
      {items.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {items.slice(0, 6).map((c) => (
            <button
              key={c.id}
              className="nodrag flex w-full items-center gap-1.5 text-left text-[12px]"
              onClick={(ev) => { ev.stopPropagation(); useData.getState().update(e.id, { checklist: items.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)) }) }}
            >
              <span className={`h-3 w-3 shrink-0 rounded-[4px] border ${c.done ? 'border-accent bg-accent' : 'border-line'}`} />
              <span className={c.done ? 'text-mute line-through' : ''}>{c.text}</span>
            </button>
          ))}
          {items.length > 6 && <div className="text-[11px] text-mute">+{items.length - 6}</div>}
        </div>
      )}
    </div>
  )
}
const NoteCard = memo(NoteCardImpl)
const nodeTypes = { note: NoteCard }

function Board({ notes }: { notes: Entity[] }) {
  const rf = useReactFlow()
  const theme = useData((s) => s.settings.theme)
  const mobile = useIsMobile()
  const initial = useMemo<Node[]>(() => notes.map((e, i) => ({ id: e.id, type: 'note', position: pos(e, i), data: { id: e.id } })), [notes])
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initial)
  useEffect(() => setNodes((cur) => { const sel = new Set(cur.filter((n) => n.selected).map((n) => n.id)); return initial.map((n) => ({ ...n, selected: sel.has(n.id) })) }), [initial])
  useEffect(() => { const t = setTimeout(() => rf.fitView({ padding: 0.2, maxZoom: 1 }), 50); return () => clearTimeout(t) }, [])

  const onDragStop = useCallback((_: unknown, _n: Node, dragged: Node[]) => {
    const ents = useData.getState().entities
    useData.getState().updateMany(dragged.map((d) => ({ id: d.id, patch: { meta: { ...(ents[d.id]?.meta || {}), board: { x: Math.round(d.position.x), y: Math.round(d.position.y) } } } })))
  }, [])

  const createAt = (x: number, y: number) => {
    const p = rf.screenToFlowPosition({ x, y })
    const n = useData.getState().create({ type: 'note', title: '', meta: { board: { x: Math.round(p.x - W / 2), y: Math.round(p.y - 40) } } })
    useUI.getState().open(n.id)
  }

  return (
    <div
      className="relative h-full w-full"
      onDoubleClick={(ev) => { if ((ev.target as HTMLElement).classList.contains('react-flow__pane')) createAt(ev.clientX, ev.clientY) }}
    >
      <Starfield offset={{ x: 0, y: 0 }} light={theme === 'light'} calm />
      <ReactFlow
        nodes={nodes}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={onDragStop}
        onNodeClick={(_, n) => useUI.getState().open(n.id)}
        minZoom={0.2}
        maxZoom={1.6}
        zoomOnDoubleClick={false}
        selectionOnDrag={!mobile}
        panOnDrag={mobile ? true : [1, 2]}
        panOnScroll={!mobile}
        nodeDragThreshold={mobile ? 6 : 2}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={null}
      />
      <button
        className="absolute bottom-24 left-1/2 z-10 -translate-x-1/2 rounded-full border border-line/60 bg-surface/90 px-4 py-2 text-[13px] font-medium shadow-lg backdrop-blur md:bottom-6"
        onClick={() => { const r = document.body.getBoundingClientRect(); createAt(r.width / 2, r.height / 2) }}
      >
        + Note
      </button>
    </div>
  )
}

export function NotesBoard({ notes }: { notes: Entity[] }) {
  return (
    <ReactFlowProvider>
      <Board notes={notes} />
    </ReactFlowProvider>
  )
}
