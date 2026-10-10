import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow, ReactFlowProvider, useReactFlow, useNodesState, MiniMap, ConnectionMode, MarkerType, Background, BackgroundVariant,
  type Node, type Edge as RFEdge, type OnNodesChange, type Connection, type Viewport
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { EntityNode, type NodeData } from './EntityNode'
import { RelEdge } from './RelEdge'
import { Starfield } from './Starfield'
import { useData, useUI, descendants, progressOf, urgentCount, placeChild, childrenOf, displayTitle } from '../lib/store'
import { layoutTree } from '../lib/layout'
import { CREATABLE, EDGE_META, TYPE_META, childType } from '../lib/meta'
import { Icon, Info, Modal, useIsMobile } from '../components/ui'
import type { EdgeKind, EntityType } from '../lib/types'

const nodeTypes = { entity: EntityNode }
const edgeTypes = { rel: RelEdge }
const ANIM_LIMIT = 140

function Canvas() {
  const ents = useData((s) => s.entities)
  const edgesStore = useData((s) => s.edges)
  const rev = useData((s) => s.rev)
  const settings = useData((s) => s.settings)
  const mapId = settings.activeMapId
  const focusId = useUI((s) => s.focusId)
  const connectFrom = useUI((s) => s.connectFrom)
  const rf = useReactFlow()
  const mobile = useIsMobile()
  const [vp, setVp] = useState<Viewport>({ x: 0, y: 0, zoom: 1 })
  const [mobileSel, setMobileSel] = useState<string | null>(null)
  const [edgeMenu, setEdgeMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [addMenu, setAddMenu] = useState<{ x: number; y: number; flow: { x: number; y: number } } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const dragStart = useRef<{ id: string; x: number; y: number; desc: { id: string; x: number; y: number }[] } | null>(null)

  // ── Nœuds visibles (les branches réduites masquent leurs descendants)
  const graph = useMemo(() => {
    if (!mapId) return { nodes: [] as Node[], edges: [] as RFEdge[] }
    const onMap = Object.values(ents).filter((e) => e.mapId === mapId && !e.archived && e.type !== 'map')
    const ids = new Set(onMap.map((e) => e.id))
    const hidden = new Set<string>()
    const hiddenCount = new Map<string, number>()
    for (const e of onMap) {
      if (e.collapsed) {
        const d = descendants(ents, e.id).filter((x) => ids.has(x))
        d.forEach((x) => hidden.add(x))
        hiddenCount.set(e.id, d.length)
      }
    }
    const visible = onMap.filter((e) => !hidden.has(e.id))
    const animate = settings.animations && visible.length <= ANIM_LIMIT && vp.zoom > 0.35
    const nodes: Node[] = visible.map((e, i) => {
      const statsFor = ['project', 'subproject', 'objective', 'category', 'vision'].includes(e.type)
      const data: NodeData = {
        id: e.id,
        hidden: hiddenCount.get(e.id) || 0,
        childCount: 0,
        progress: statsFor ? progressOf(ents, e) : null,
        urgent: ['project', 'subproject', 'objective'].includes(e.type) ? urgentCount(ents, e.id) : 0,
        float: animate,
        delay: (i * 0.37) % 5
      }
      return { id: e.id, type: 'entity', position: { x: e.x ?? 0, y: e.y ?? 0 }, data }
    })
    const vis = new Set(visible.map((v) => v.id))
    const edges: RFEdge[] = []
    for (const e of visible) {
      if (e.parentId && vis.has(e.parentId)) {
        const p = ents[e.parentId]
        const left = (e.x ?? 0) < (p.x ?? 0)
        edges.push({
          id: `t-${e.id}`, source: p.id, target: e.id, type: 'rel', sourceHandle: left ? 'l' : 'r', targetHandle: left ? 'r' : 'l',
          data: { kind: 'parent', color: p.color }, selectable: false, focusable: false
        })
      }
    }
    for (const ed of Object.values(edgesStore)) {
      if (!vis.has(ed.source) || !vis.has(ed.target)) continue
      const s = ents[ed.source]
      const t = ents[ed.target]
      const left = (t.x ?? 0) < (s.x ?? 0)
      edges.push({
        id: ed.id, source: ed.source, target: ed.target, type: 'rel', sourceHandle: left ? 'l' : 'r', targetHandle: left ? 'r' : 'l',
        data: { kind: ed.kind, label: ed.label }, markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: EDGE_META[ed.kind].color.startsWith('var') ? '#8a90a6' : EDGE_META[ed.kind].color }
      })
    }
    return { nodes, edges }
  }, [rev, mapId, settings.animations, vp.zoom > 0.35])

  const [nodes, setNodes, onNodesChangeBase] = useNodesState<Node>(graph.nodes)
  useEffect(() => {
    // conserve la sélection locale lors des mises à jour du store
    setNodes((cur) => {
      const sel = new Set(cur.filter((n) => n.selected).map((n) => n.id))
      return graph.nodes.map((n) => (sel.has(n.id) ? { ...n, selected: true } : n))
    })
  }, [graph.nodes])

  const onNodesChange: OnNodesChange<Node> = useCallback((ch) => onNodesChangeBase(ch), [onNodesChangeBase])

  // ── Centrage initial / changement de map
  useEffect(() => {
    const t = setTimeout(() => {
      // vue d'ensemble si elle reste lisible, sinon on centre sur le cœur de la map
      rf.fitView({ padding: 0.2, maxZoom: 1.1 }).then(() => {
        if (rf.getZoom() >= 0.5) return
        const ents = useData.getState().entities
        const root = Object.values(ents).find((e) => e.mapId === mapId && !e.parentId && e.type !== 'map')
        if (root) rf.setCenter((root.x ?? 0) + 260, root.y ?? 0, { zoom: mobile ? 0.95 : 0.8, duration: 600 })
      })
    }, 60)
    return () => clearTimeout(t)
  }, [mapId])

  // ── Glisser une branche : les enfants suivent (Alt = déplacer seul)
  const onNodeDragStart = useCallback((ev: MouseEvent | TouchEvent, node: Node) => {
    const ents = useData.getState().entities
    const selectedCount = rf.getNodes().filter((n) => n.selected).length
    const desc = ev.altKey || selectedCount > 1 ? [] : descendants(ents, node.id).filter((d) => ents[d]?.mapId === mapId).map((d) => ({ id: d, x: ents[d].x ?? 0, y: ents[d].y ?? 0 }))
    dragStart.current = { id: node.id, x: node.position.x, y: node.position.y, desc }
  }, [mapId])

  const onNodeDrag = useCallback((_: MouseEvent | TouchEvent, node: Node) => {
    const s = dragStart.current
    if (!s || !s.desc.length) return
    const dx = node.position.x - s.x
    const dy = node.position.y - s.y
    const m = new Map(s.desc.map((d) => [d.id, d]))
    setNodes((ns) => ns.map((n) => (m.has(n.id) ? { ...n, position: { x: m.get(n.id)!.x + dx, y: m.get(n.id)!.y + dy } } : n)))
  }, [])

  const onNodeDragStop = useCallback((ev: MouseEvent | TouchEvent, node: Node, dragged: Node[]) => {
    const s = dragStart.current
    dragStart.current = null
    // dépôt sur une zone de la sidebar (Tâches / Notes) ?
    const pt = 'clientX' in ev ? { x: ev.clientX, y: ev.clientY } : ev.changedTouches?.[0] ? { x: ev.changedTouches[0].clientX, y: ev.changedTouches[0].clientY } : null
    if (pt) {
      const zone = document.elementsFromPoint(pt.x, pt.y).find((el) => (el as HTMLElement).dataset?.dropzone) as HTMLElement | undefined
      if (zone && s) {
        setNodes((ns) => ns.map((n) => (n.id === node.id ? { ...n, position: { x: s.x, y: s.y } } : n)))
        useUI.getState().set({ dropAsk: { entityId: node.id, target: zone.dataset.dropzone as any } })
        return
      }
    }
    const current = new Map(rf.getNodes().map((n) => [n.id, n.position]))
    const ids = new Set([...dragged.map((d) => d.id), ...(s?.desc.map((d) => d.id) || [])])
    useData.getState().updateMany([...ids].map((id) => ({ id, patch: { x: Math.round(current.get(id)!.x), y: Math.round(current.get(id)!.y) } })))
  }, [])

  const onNodeClick = useCallback((ev: React.MouseEvent, node: Node) => {
    const ui = useUI.getState()
    if (ui.connectFrom) {
      if (ui.connectFrom !== node.id && mapId) {
        useData.getState().addEdge(mapId, ui.connectFrom, node.id, 'linked')
        useData.getState().link(ui.connectFrom, node.id)
        ui.notify('Connexion créée')
      }
      ui.set({ connectFrom: null })
      return
    }
    if (ev.shiftKey || ev.metaKey) return
    // mobile : un tap sélectionne et affiche la barre d'actions (pas de plein écran)
    if (mobile) { setMobileSel(node.id); return }
    ui.open(node.id)
  }, [mapId, mobile])

  const onNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node) => {
    useUI.getState().set({ editingId: node.id })
  }, [])

  const onNodeContextMenu = useCallback((ev: React.MouseEvent, node: Node) => {
    ev.preventDefault()
    useUI.getState().set({ menu: { id: node.id, x: ev.clientX, y: ev.clientY } })
  }, [])

  const onConnect = useCallback((c: Connection) => {
    if (!mapId || !c.source || !c.target || c.source === c.target) return
    useData.getState().addEdge(mapId, c.source, c.target, 'linked')
    useData.getState().link(c.source, c.target)
  }, [mapId])

  const onEdgeClick = useCallback((ev: React.MouseEvent, edge: RFEdge) => {
    if (edge.id.startsWith('t-')) return
    setEdgeMenu({ id: edge.id, x: ev.clientX, y: ev.clientY })
  }, [])

  // ── Double-clic sur le vide : nouvelle idée à cet endroit
  const onPaneDouble = (ev: React.MouseEvent) => {
    const target = ev.target as HTMLElement
    if (!target.classList.contains('react-flow__pane')) return
    const flow = rf.screenToFlowPosition({ x: ev.clientX, y: ev.clientY })
    setAddMenu({ x: ev.clientX, y: ev.clientY, flow })
  }

  const createAt = (type: EntityType, flow: { x: number; y: number }, parentId: string | null = null) => {
    if (!mapId) return
    const e = useData.getState().create({ type, title: '', mapId, parentId, x: Math.round(flow.x - 70), y: Math.round(flow.y - 18) })
    useUI.getState().set({ editingId: e.id })
    setAddMenu(null)
  }

  // ── Dépôt depuis la sidebar (tâche / note → map)
  const onDrop = (ev: React.DragEvent) => {
    const id = ev.dataTransfer.getData('application/orbite')
    if (!id) return
    ev.preventDefault()
    const pos = rf.screenToFlowPosition({ x: ev.clientX, y: ev.clientY })
    useUI.getState().set({ dropAsk: { entityId: id, target: 'map', pos } })
  }

  // ── Raccourcis clavier façon mind map
  useEffect(() => {
    const fn = (ev: KeyboardEvent) => {
      const tag = (ev.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (ev.target as HTMLElement).isContentEditable) return
      if (useUI.getState().view !== 'map') return
      const sel = rf.getNodes().filter((n) => n.selected)
      const data = useData.getState()
      if (ev.key === 'Escape') useUI.getState().set({ connectFrom: null, menu: null })
      if (!sel.length) return
      const one = data.entities[sel[0].id]
      if (ev.key === 'Tab') {
        ev.preventDefault()
        const pos = placeChild(data.entities, one)
        const c = data.create({ type: childType(one.type), title: '', parentId: one.id, mapId, ...pos })
        if (one.collapsed) data.update(one.id, { collapsed: false })
        select(c.id)
        useUI.getState().set({ editingId: c.id })
      } else if (ev.key === 'Enter' && one.parentId) {
        ev.preventDefault()
        const p = data.entities[one.parentId]
        const pos = placeChild(data.entities, p)
        const c = data.create({ type: one.type === 'ref' ? 'idea' : one.type, title: '', parentId: p.id, mapId, ...pos })
        select(c.id)
        useUI.getState().set({ editingId: c.id })
      } else if (ev.key === 'F2' || (ev.key === 'Enter' && !one.parentId)) {
        ev.preventDefault()
        useUI.getState().set({ editingId: one.id })
      } else if (ev.key === ' ') {
        ev.preventDefault()
        useUI.getState().open(one.id)
      } else if ((ev.key === 'Delete' || ev.key === 'Backspace') && sel.length) {
        ev.preventDefault()
        const n = sel.length + sel.reduce((s, x) => s + descendants(data.entities, x.id).length, 0)
        if (confirm(n > 1 ? `Supprimer ${n} éléments (branches incluses) ?` : `Supprimer « ${displayTitle(data.entities, one)} » ?`)) sel.forEach((x) => useData.getState().remove(x.id))
      }
    }
    const select = (id: string) => setTimeout(() => setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === id }))), 30)
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [mapId])

  const relayout = () => {
    const data = useData.getState()
    const sel = rf.getNodes().filter((n) => n.selected)
    const roots = sel.length ? sel.map((s) => s.id) : Object.values(data.entities).filter((e) => e.mapId === mapId && !e.parentId && e.type !== 'map').map((e) => e.id)
    let offsetY = 0
    const patches: { id: string; patch: { x: number; y: number } }[] = []
    roots.forEach((r, i) => {
      if (!sel.length && i > 0 && !childrenOf(data.entities, r).length) return
      const pos = layoutTree(data.entities, r, mapId!)
      Object.entries(pos).forEach(([id, p]) => patches.push({ id, patch: { x: Math.round(p.x), y: Math.round(p.y + (sel.length ? 0 : offsetY)) } }))
      offsetY += 0
    })
    data.updateMany(patches)
    setTimeout(() => rf.fitView({ padding: 0.25, duration: 500 }), 80)
    useUI.getState().notify('Branche réorganisée')
  }

  const map = mapId ? ents[mapId] : undefined
  const calm = !!focusId

  if (!map) return null

  return (
    <div ref={wrapRef} className={`relative h-full w-full ${connectFrom ? 'connecting' : ''}`} onDoubleClick={onPaneDouble} onDragOver={(e) => { if (e.dataTransfer.types.includes('application/orbite')) e.preventDefault() }} onDrop={onDrop}>
      <Starfield offset={vp} calm={calm} light={settings.theme === 'light'} />
      <ReactFlow
        nodes={nodes}
        edges={graph.edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeClick={onEdgeClick}
        onConnect={onConnect}
        onMove={(_, v) => setVp(v)}
        onPaneClick={() => { useUI.getState().set({ menu: null, connectFrom: null }); setEdgeMenu(null); setMobileSel(null) }}
        connectionMode={ConnectionMode.Loose}
        minZoom={0.05}
        maxZoom={2.5}
        zoomOnDoubleClick={false}
        selectionOnDrag={!mobile}
        panOnDrag={mobile ? true : [1, 2]}
        nodeDragThreshold={mobile ? 6 : 1}
        panOnScroll={!mobile}
        zoomOnPinch
        multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
        selectionKeyCode={null}
        onlyRenderVisibleElements={nodes.length > 80}
        elevateNodesOnSelect
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={null}
      >
        {settings.theme === 'light' && <Background id="g1" variant={BackgroundVariant.Lines} gap={36} lineWidth={0.6} color="rgba(79,102,230,0.07)" />}
        {settings.theme === 'light' && <Background id="g2" variant={BackgroundVariant.Lines} gap={144} lineWidth={0.9} color="rgba(79,102,230,0.11)" />}
        {!mobile && nodes.length > 12 && <MiniMap pannable zoomable maskColor="rgba(0,0,0,0.12)" nodeColor={(n) => { const e = ents[(n.data as any).id]; return e?.color || TYPE_META[e?.type || 'idea'].tint }} nodeBorderRadius={8} style={{ width: 150, height: 100 }} />}
      </ReactFlow>

      {/* Barre d'outils de la carte */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3 md:p-4">
        <MapSwitcher />
        <div className="pointer-events-auto glass flex items-center gap-0.5 rounded-2xl border border-line/60 p-1 shadow-sm">
          <button className="icon-btn" title="Ajouter (double-clic sur le vide)" onClick={() => { const b = wrapRef.current!.getBoundingClientRect(); setAddMenu({ x: b.left + b.width / 2 - 120, y: b.top + 80, flow: rf.screenToFlowPosition({ x: b.left + b.width / 2, y: b.top + b.height / 2 }) }) }}><Icon name="plus" /></button>
          <button className="icon-btn" title="Réorganiser (sélection ou tout)" onClick={relayout}><Icon name="layout" /></button>
          <button className="icon-btn" title="Recentrer" onClick={() => rf.fitView({ padding: 0.2, duration: 500 })}><Icon name="center" /></button>
          <button className={`icon-btn ${focusId ? 'text-accent' : ''}`} title="Mode Focus" onClick={() => useUI.getState().set({ focusId: focusId ? null : '__pick' })}><Icon name="focus" /></button>
          {!mobile && <span className="flex h-9 w-7 items-center justify-center"><Info text={<>Double-clic sur le vide : créer. <b>Tab</b> : ajouter un enfant · <b>Entrée</b> : un frère · <b>F2</b> : renommer · clic droit : menu. Glisser une branche déplace ses enfants (<b>Alt</b> pour la déplacer seule).</>} /></span>}
          {!mobile && <button className={`icon-btn ${settings.rightPanel ? 'text-accent' : ''}`} title="Panneau Aujourd'hui" onClick={() => useData.getState().setSettings({ rightPanel: !settings.rightPanel })}><Icon name="sidebar" /></button>}
        </div>
      </div>

      {connectFrom && (
        <div className="glass rise absolute bottom-[92px] left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-full border border-accent/50 px-4 py-2.5 text-[13px] shadow-lg md:bottom-6">
          Touche l’élément à relier · <button className="font-medium text-accent" onClick={() => useUI.getState().set({ connectFrom: null })}>Annuler</button>
        </div>
      )}
      {mobile && mobileSel && !connectFrom && ents[mobileSel] && (
        <MobileBar id={mobileSel} onClose={() => setMobileSel(null)} onChild={(id) => setMobileSel(id)} />
      )}


      {edgeMenu && <EdgeMenu {...edgeMenu} onClose={() => setEdgeMenu(null)} />}
      {addMenu && (
        <AddMenu x={addMenu.x} y={addMenu.y} onClose={() => setAddMenu(null)} onPick={(t) => createAt(t, addMenu.flow)} />
      )}
    </div>
  )
}


// Barre d'actions mobile : tout ce qu'on fait au clavier / clic droit sur desktop
function MobileBar({ id, onClose, onChild }: { id: string; onClose: () => void; onChild: (id: string) => void }) {
  const e = useData((s) => s.entities[id])
  const ents = useData((s) => s.entities)
  if (!e) return null
  const ui = useUI.getState()
  const data = useData.getState()
  const hasKids = descendants(ents, id).length > 0
  const actions: { icon: string; label: string; act: () => void; danger?: boolean }[] = [
    { icon: 'open', label: 'Ouvrir', act: () => ui.open(id) },
    { icon: 'child', label: 'Enfant', act: () => { const pos = placeChild(data.entities, e); const c = data.create({ type: childType(e.type), title: '', parentId: e.id, mapId: e.mapId, ...pos }); if (e.collapsed) data.update(e.id, { collapsed: false }); ui.set({ editingId: c.id }); onChild(c.id) } },
    { icon: 'connect', label: 'Relier', act: () => { ui.set({ connectFrom: id }); ui.notify('Touche maintenant l’élément à relier') } },
    { icon: 'edit', label: 'Renommer', act: () => ui.set({ editingId: id }) },
    { icon: 'move', label: 'Ranger', act: () => ui.set({ addTo: { sourceId: id, mode: 'move' } }) },
    ...(hasKids ? [{ icon: e.collapsed ? 'expand' : 'collapse', label: e.collapsed ? 'Déplier' : 'Réduire', act: () => data.update(id, { collapsed: !e.collapsed }) }] : []),
    { icon: 'trash', label: 'Suppr.', danger: true, act: () => { const n = descendants(data.entities, id).length; if (confirm(n ? `Supprimer avec ${n} élément(s) ?` : `Supprimer « ${displayTitle(data.entities, e)} » ?`)) { data.remove(id); onClose() } } }
  ]
  return (
    <div className="rise absolute inset-x-2 bottom-[84px] z-30 rounded-2xl border border-line/70 bg-surface/95 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center gap-2 px-3 pb-1 pt-2">
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{displayTitle(ents, e)}</span>
        <button className="text-mute" onClick={onClose}><Icon name="close" className="h-4 w-4" /></button>
      </div>
      <div className="no-scrollbar flex overflow-x-auto px-1 pb-1.5">
        {actions.map((a) => (
          <button key={a.label} onClick={a.act} className={`flex min-w-[48px] flex-1 flex-col items-center gap-1 rounded-xl px-0.5 py-2 text-[10px] active:bg-ink/10 ${a.danger ? 'text-[#ff7a7a]' : 'text-ink/80'}`}>
            <Icon name={a.icon} className="h-5 w-5" />{a.label}
          </button>
        ))}
      </div>
      <div className="px-3 pb-2 text-center text-[10.5px] text-mute">Glisse l’élément pour le déplacer</div>
    </div>
  )
}

function EdgeMenu({ id, x, y, onClose }: { id: string; x: number; y: number; onClose: () => void }) {
  const edge = useData((s) => s.edges[id])
  if (!edge) return null
  return (
    <div className="fade fixed z-50 w-48 rounded-2xl border border-line bg-surface p-1 shadow-xl" style={{ left: Math.min(x, innerWidth - 200), top: Math.min(y, innerHeight - 260) }}>
      <div className="px-2.5 pb-1 pt-1.5 text-[10px] uppercase tracking-wider text-mute">Type de connexion</div>
      {(Object.keys(EDGE_META) as EdgeKind[]).filter((k) => k !== 'parent').map((k) => (
        <button key={k} className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-sm hover:bg-ink/5 ${edge.kind === k ? 'text-accent' : ''}`} onClick={() => { useData.getState().updateEdge(id, { kind: k }); onClose() }}>
          <svg width="22" height="6"><line x1="1" y1="3" x2="21" y2="3" stroke={EDGE_META[k].color.startsWith('var') ? 'currentColor' : EDGE_META[k].color} strokeWidth="1.6" strokeDasharray={EDGE_META[k].dash} /></svg>
          {EDGE_META[k].label}
        </button>
      ))}
      <button className="mt-1 flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-sm text-[#ff7a7a] hover:bg-[#ff7a7a]/10" onClick={() => { useData.getState().removeEdge(id); onClose() }}>
        <Icon name="trash" className="h-4 w-4" /> Supprimer la connexion
      </button>
    </div>
  )
}

const MAIN_TYPES: EntityType[] = ['idea', 'task', 'project', 'objective', 'note', 'milestone']

export function AddMenu({ x, y, onClose, onPick }: { x: number; y: number; onClose: () => void; onPick: (t: EntityType) => void }) {
  const mobile = useIsMobile()
  const [all, setAll] = useState(false)
  const types = all ? CREATABLE : MAIN_TYPES
  const list = (
    <div className="p-1.5">
      {types.map((t) => (
        <button key={t} className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] text-ink/85 hover:bg-ink/5" onClick={() => onPick(t)}>
          <span className="w-4 text-center" style={{ color: TYPE_META[t].tint }}>{TYPE_META[t].glyph}</span>
          {TYPE_META[t].label}
        </button>
      ))}
      {!all && (
        <button className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[12px] text-mute hover:bg-ink/5 hover:text-ink" onClick={() => setAll(true)}>
          <span className="w-4 text-center">…</span>Autres types
        </button>
      )}
    </div>
  )
  if (mobile) return <Modal open onClose={onClose} title="Ajouter">{list}</Modal>
  return (
    <>
      <div className="fixed inset-0 z-40" onPointerDown={onClose} />
      <div className={`fade fixed z-50 w-[200px] rounded-2xl border border-line bg-surface shadow-2xl ${all ? 'max-h-[70vh] overflow-y-auto' : ''}`} style={{ left: Math.min(x, innerWidth - 210), top: Math.min(y, innerHeight - (all ? 560 : 300)) }}>{list}</div>
    </>
  )
}

function MapSwitcher() {
  const ents = useData((s) => s.entities)
  const activeId = useData((s) => s.settings.activeMapId)
  const [open, setOpen] = useState(false)
  const maps = Object.values(ents).filter((e) => e.type === 'map' && !e.archived)
  const active = activeId ? ents[activeId] : undefined
  return (
    <div className="pointer-events-auto relative">
      <button className="glass flex items-center gap-2 rounded-2xl border border-line/60 px-3.5 py-2 shadow-sm" onClick={() => setOpen(!open)}>
        <span className="text-accent">{active?.icon || '◎'}</span>
        <span className="max-w-[46vw] truncate font-display text-sm font-semibold">{active?.title || 'Map'}</span>
        <Icon name="down" className="h-3.5 w-3.5 text-mute" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onPointerDown={() => setOpen(false)} />
          <div className="fade absolute left-0 top-12 z-50 w-64 rounded-2xl border border-line bg-surface p-1 shadow-xl">
            {maps.map((m) => (
              <button key={m.id} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-ink/5 ${m.id === activeId ? 'text-accent' : ''}`} onClick={() => { useData.getState().setSettings({ activeMapId: m.id }); setOpen(false) }}>
                <span>{m.icon || '◎'}</span><span className="flex-1 truncate">{m.title}</span>
                <span className="text-[11px] text-mute">{Object.values(ents).filter((e) => e.mapId === m.id).length}</span>
              </button>
            ))}
            <div className="my-1 h-px bg-line/60" />
            <button className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-mute hover:bg-ink/5 hover:text-ink" onClick={() => { setOpen(false); useUI.getState().go('maps') }}>
              <Icon name="plus" className="h-4 w-4" /> Gérer / nouvelle map
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export function MapCanvas() {
  return (
    <ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider>
  )
}
