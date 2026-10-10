import { useEffect, useMemo, useState } from 'react'
import { ReactFlow, ReactFlowProvider, Handle, Position, ConnectionMode, type Node, type Edge as RFEdge, type NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { decompress, type ShareSnapshot } from '../lib/backup'
import { TYPE_META, DEFAULT_STATUSES } from '../lib/meta'
import { Markdown } from '../lib/markdown'
import { RelEdge } from '../map/RelEdge'
import { Starfield } from '../map/Starfield'
import type { Entity } from '../lib/types'

// Lecture seule d'une branche partagée. N'écrit jamais dans les données locales.
function ROnode({ data }: NodeProps) {
  const e = (data as any).e as Entity
  const m = TYPE_META[e.type]
  const color = e.color || m.tint
  const st = DEFAULT_STATUSES.find((s) => s.id === e.status)
  return (
    <div className={`border px-3 py-2 backdrop-blur-md ${m.shape === 'orb' ? 'rounded-full px-5' : 'rounded-2xl'}`} style={{ background: 'var(--node-bg)', borderColor: `${color}44`, boxShadow: 'var(--node-shadow)', maxWidth: 240, opacity: e.done ? 0.6 : 1 }}>
      <Handle type="source" position={Position.Left} id="l" style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} id="r" style={{ opacity: 0 }} />
      <div className="flex items-center gap-2 text-[13px] font-medium">
        <span style={{ color }}>{e.icon || m.glyph}</span>
        <span className={e.done ? 'line-through' : ''}>{e.title || 'Sans titre'}</span>
      </div>
      {st && ['project', 'subproject', 'objective'].includes(e.type) && <div className="mt-1 text-[11px]" style={{ color: st.color }}>● {st.label}</div>}
    </div>
  )
}
const nodeTypes = { ro: ROnode }
const edgeTypes = { rel: RelEdge }

export function ShareView({ code }: { code: string }) {
  const [snap, setSnap] = useState<ShareSnapshot | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [sel, setSel] = useState<Entity | null>(null)
  useEffect(() => {
    document.documentElement.classList.add('dark')
    ;(async () => {
      try {
        const txt = code === 'file' ? sessionStorage.getItem('orbite.shareFile') || '' : await decompress(code)
        const s = JSON.parse(txt) as ShareSnapshot
        if (s.app !== 'orbite-share') throw new Error()
        setSnap(s)
        document.title = `${s.title} — Orbite (lecture seule)`
      } catch {
        setErr('Lien de partage invalide ou incomplet.')
      }
    })()
  }, [code])

  const graph = useMemo(() => {
    if (!snap) return { nodes: [] as Node[], edges: [] as RFEdge[] }
    const ids = new Set(snap.entities.map((e) => e.id))
    const byId = Object.fromEntries(snap.entities.map((e) => [e.id, e]))
    const placed = snap.entities.filter((e) => e.type !== 'map')
    const nodes: Node[] = placed.map((e) => ({ id: e.id, type: 'ro', position: { x: e.x ?? 0, y: e.y ?? 0 }, data: { e }, draggable: false }))
    const edges: RFEdge[] = []
    for (const e of placed) if (e.parentId && ids.has(e.parentId)) {
      const left = (e.x ?? 0) < (byId[e.parentId].x ?? 0)
      edges.push({ id: 't' + e.id, source: e.parentId, target: e.id, type: 'rel', sourceHandle: left ? 'l' : 'r', targetHandle: left ? 'r' : 'l', data: { kind: 'parent', color: byId[e.parentId].color } })
    }
    for (const d of snap.edges) edges.push({ id: d.id, source: d.source, target: d.target, type: 'rel', sourceHandle: 'r', targetHandle: 'l', data: { kind: d.kind } })
    return { nodes, edges }
  }, [snap])

  if (err) return <div className="flex h-full items-center justify-center p-6 text-center text-mute">{err}<br /><a className="mt-3 text-accent" href="/">Ouvrir Orbite</a></div>
  if (!snap) return <div className="flex h-full items-center justify-center text-mute">Chargement…</div>
  return (
    <div className="relative h-full">
      <Starfield offset={{ x: 0, y: 0 }} />
      <ReactFlowProvider>
        <ReactFlow nodes={graph.nodes} edges={graph.edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} fitView fitViewOptions={{ padding: 0.25 }} minZoom={0.05} nodesConnectable={false} connectionMode={ConnectionMode.Loose} nodesDraggable={false} elementsSelectable onNodeClick={(_, n) => setSel((n.data as any).e)} proOptions={{ hideAttribution: true }} />
      </ReactFlowProvider>
      <div className="glass absolute left-4 top-4 rounded-2xl border border-line/60 px-4 py-2.5 safe-t">
        <div className="text-[10px] uppercase tracking-[0.14em] text-mute">Partage · lecture seule</div>
        <div className="font-display text-base font-semibold">{snap.title}</div>
      </div>
      {sel && (
        <div className="rise absolute bottom-4 left-4 right-4 max-h-[50vh] overflow-y-auto rounded-3xl border border-line bg-surface p-5 shadow-2xl md:left-auto md:w-[380px]">
          <div className="mb-1 flex justify-between text-[11px] text-mute">{TYPE_META[sel.type].label}<button onClick={() => setSel(null)}>Fermer</button></div>
          <div className="font-display text-lg font-semibold">{sel.title}</div>
          {sel.description && <div className="mt-2 text-sm"><Markdown text={sel.description} /></div>}
          {sel.checklist?.map((c) => <div key={c.id} className="text-sm">{c.done ? '☑' : '☐'} {c.text}</div>)}
        </div>
      )}
    </div>
  )
}
