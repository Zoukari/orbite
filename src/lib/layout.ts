import type { Entity } from './types'

// Disposition "mind map" classique : racine au centre, branches de
// premier niveau réparties à gauche / à droite, sous-arbres empilés
// selon leur nombre de feuilles. Utilisée par la démo et par
// l'action "Réorganiser la branche".

const GAP_X = 300
const GAP_Y = 86

export function layoutTree(ents: Record<string, Entity>, rootId: string, mapId: string): Record<string, { x: number; y: number }> {
  const kids = new Map<string, string[]>()
  for (const e of Object.values(ents)) {
    if (!e.parentId || e.mapId !== mapId || e.archived) continue
    const a = kids.get(e.parentId) || []
    a.push(e.id)
    kids.set(e.parentId, a)
  }
  const order = (id: string) => (kids.get(id) || []).sort((a, b) => (ents[a].y ?? 0) - (ents[b].y ?? 0))
  const leaves = new Map<string, number>()
  const count = (id: string): number => {
    const k = ents[id]?.collapsed ? [] : order(id)
    const n = k.length ? k.reduce((s, c) => s + count(c), 0) : 1
    leaves.set(id, n)
    return n
  }
  count(rootId)
  const pos: Record<string, { x: number; y: number }> = {}
  const root = ents[rootId]
  const rx = root.x ?? 0
  const ry = root.y ?? 0
  pos[rootId] = { x: rx, y: ry }
  const place = (id: string, depth: number, dir: 1 | -1, top: number) => {
    const n = leaves.get(id) || 1
    pos[id] = { x: rx + dir * depth * GAP_X, y: top + (n * GAP_Y) / 2 - GAP_Y / 2 }
    if (ents[id]?.collapsed) return
    let cur = top
    for (const c of order(id)) {
      place(c, depth + 1, dir, cur)
      cur += (leaves.get(c) || 1) * GAP_Y
    }
  }
  const first = order(rootId)
  const isCenter = !root.parentId
  if (isCenter && first.length > 1) {
    // partage gauche/droite équilibré par nombre de feuilles
    const total = first.reduce((s, c) => s + (leaves.get(c) || 1), 0)
    const right: string[] = []
    const left: string[] = []
    let acc = 0
    for (const c of first) {
      if (acc < total / 2) { right.push(c); acc += leaves.get(c) || 1 } else left.push(c)
    }
    for (const [side, dir] of [[right, 1], [left, -1]] as const) {
      const h = side.reduce((s, c) => s + (leaves.get(c) || 1), 0) * GAP_Y
      let cur = ry - h / 2 + GAP_Y / 2
      for (const c of side) {
        place(c, 1, dir, cur)
        cur += (leaves.get(c) || 1) * GAP_Y
      }
    }
  } else {
    const dir: 1 | -1 = root.parentId && (ents[root.parentId]?.x ?? 0) > rx ? -1 : 1
    const h = (leaves.get(rootId) || 1) * GAP_Y
    let cur = ry - h / 2 + GAP_Y / 2
    for (const c of first) {
      place(c, 1, dir, cur)
      cur += (leaves.get(c) || 1) * GAP_Y
    }
  }
  return pos
}
