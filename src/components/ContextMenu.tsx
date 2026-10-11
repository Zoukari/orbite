import { useData, useUI, placeChild, descendants, displayTitle } from '../lib/store'
import { childType } from '../lib/meta'
import { Icon, Modal, useIsMobile } from './ui'
import type { ReactNode } from 'react'

// Menu contextuel : clic droit (desktop) ou appui long (mobile)
export function ContextMenu() {
  const menu = useUI((s) => s.menu)
  const e = useData((s) => (menu ? s.entities[menu.id] : undefined))
  const mobile = useIsMobile()
  if (!menu || !e) return null
  const ui = useUI.getState()
  const data = useData.getState()
  const close = () => ui.set({ menu: null })
  const run = (fn: () => void) => () => { close(); fn() }
  const hasKids = descendants(data.entities, e.id).length > 0

  const addChild = (type: 'task' | 'note' | null) => {
    const pos = placeChild(data.entities, e)
    const c = data.create({ type: type ?? childType(e.type), title: '', parentId: e.id, mapId: e.mapId, ...pos })
    if (e.collapsed) data.update(e.id, { collapsed: false })
    if (e.mapId) ui.set({ editingId: c.id })
    else ui.open(c.id)
  }

  const items: { icon: string; label: string; act: () => void; danger?: boolean; sep?: boolean; hide?: boolean }[] = [
    { icon: 'open', label: 'Ouvrir', act: run(() => ui.open(e.id)) },
    { icon: 'edit', label: 'Renommer', act: run(() => (e.mapId ? ui.set({ editingId: e.id }) : ui.open(e.id))), hide: !e.mapId },
    { icon: 'child', label: 'Ajouter enfant', act: run(() => addChild(null)), sep: true, hide: !e.mapId },
    { icon: 'tasks', label: 'Ajouter tâche', act: run(() => addChild('task')), hide: !e.mapId },
    { icon: 'notes', label: 'Ajouter note', act: run(() => addChild('note')), hide: !e.mapId },
    { icon: 'link', label: 'Ajouter à…', act: run(() => ui.set({ addTo: { sourceId: e.id, mode: 'link' } })), sep: true },
    { icon: 'move', label: 'Déplacer vers…', act: run(() => ui.set({ addTo: { sourceId: e.id, mode: 'move' } })) },
    { icon: 'connect', label: 'Créer connexion', act: run(() => ui.set({ connectFrom: e.id })), hide: !e.mapId },
    { icon: 'copy', label: 'Dupliquer', act: run(() => data.duplicate(e.id)) },
    { icon: 'connect', label: 'Fusionner dans…', act: run(() => ui.set({ addTo: { sourceId: e.id, mode: 'pickParent', onPick: (t) => { const d = useData.getState(); if (confirm(`Fusionner « ${displayTitle(d.entities, e)} » dans « ${displayTitle(d.entities, d.entities[t])} » ? Son contenu passe dedans, puis il est supprimé.`)) { d.merge(e.id, t); useUI.getState().notify('Fusionné') } } } })) },
    { icon: 'star', label: e.favorite ? 'Retirer des favoris' : 'Favori', act: run(() => data.update(e.id, { favorite: !e.favorite })) },
    { icon: e.collapsed ? 'expand' : 'collapse', label: e.collapsed ? 'Déplier la branche' : 'Réduire la branche', act: run(() => data.update(e.id, { collapsed: !e.collapsed })), hide: !hasKids },
    { icon: 'share', label: 'Partager…', act: run(() => ui.set({ share: e.id })), sep: true },
    { icon: 'focus', label: 'Focus sur cet élément', act: run(() => ui.set({ focusId: e.id })), hide: !['objective', 'project', 'subproject'].includes(e.type) },
    { icon: 'archive', label: e.archived ? 'Désarchiver' : 'Archiver', act: run(() => data.archive(e.id, !e.archived)) },
    {
      icon: 'trash', label: 'Supprimer', danger: true,
      act: run(() => {
        const n = descendants(data.entities, e.id).length
        if (confirm(n ? `Supprimer « ${displayTitle(data.entities, e)} » et ses ${n} élément(s) ?` : `Supprimer « ${displayTitle(data.entities, e)} » ?`)) data.remove(e.id)
      })
    }
  ].filter((i) => !i.hide)

  const list: ReactNode = (
    <div className="p-1">
      {items.map((it, i) => (
        <div key={it.label}>
          {it.sep && i > 0 && <div className="mx-2 my-1 h-px bg-line/60" />}
          <button onClick={it.act} className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition ${it.danger ? 'text-[#ff7a7a] hover:bg-[#ff7a7a]/10' : 'hover:bg-ink/5'}`}>
            <Icon name={it.icon} className="h-4 w-4 opacity-80" />
            {it.label}
          </button>
        </div>
      ))}
    </div>
  )

  if (mobile)
    return (
      <Modal open onClose={close} title={<span className="truncate">{displayTitle(data.entities, e)}</span>}>
        {list}
      </Modal>
    )
  const h = items.length * 36 + 40
  return (
    <>
      <div className="fixed inset-0 z-40" onPointerDown={close} onContextMenu={(ev) => { ev.preventDefault(); close() }} />
      <div className="fade fixed z-50 w-56 rounded-2xl border border-line bg-surface shadow-2xl" style={{ left: Math.min(menu.x, innerWidth - 232), top: Math.max(8, Math.min(menu.y, innerHeight - h)) }}>
        <div className="truncate px-4 pb-0.5 pt-2.5 text-[11px] font-medium text-mute">{displayTitle(data.entities, e)}</div>
        {list}
      </div>
    </>
  )
}
