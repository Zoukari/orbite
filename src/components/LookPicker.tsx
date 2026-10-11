import { useState } from 'react'
import { useData } from '../lib/store'
import { ICON_GROUPS, PALETTE } from '../lib/meta'
import type { Entity } from '../lib/types'

// Choix rapide de l'emoji et de la couleur d'un élément
export function LookPicker({ e, onClose }: { e: Entity; onClose?: () => void }) {
  const up = (patch: Partial<Entity>) => useData.getState().update(e.id, patch)
  const [custom, setCustom] = useState('')
  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1.5 flex items-center justify-between"><span className="label !mb-0">Couleur</span><button className="text-[11px] text-mute hover:text-ink" onClick={() => up({ color: undefined })}>par défaut</button></div>
        <div className="flex flex-wrap gap-1.5">
          {PALETTE.map((c) => (
            <button key={c} onClick={() => up({ color: c })} className="h-7 w-7 rounded-full border-2 transition hover:scale-110" style={{ background: c, borderColor: e.color === c ? 'rgb(var(--ink))' : 'transparent', boxShadow: e.color === c ? `0 0 12px ${c}` : undefined }} />
          ))}
          <label className="relative flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-dashed border-line text-xs text-mute" title="Couleur personnalisée">
            +
            <input type="color" className="absolute inset-0 cursor-pointer opacity-0" value={e.color || '#8ea2ff'} onChange={(ev) => up({ color: ev.target.value })} />
          </label>
        </div>
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between"><span className="label !mb-0">Emoji</span><button className="text-[11px] text-mute hover:text-ink" onClick={() => up({ icon: undefined })}>aucun</button></div>
        <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
          {ICON_GROUPS.map((g) => (
            <div key={g.label}>
              <div className="mb-0.5 text-[10px] uppercase tracking-wider text-mute/70">{g.label}</div>
              <div className="flex flex-wrap gap-0.5">
                {g.icons.map((i) => (
                  <button key={g.label + i} onClick={() => { up({ icon: i }); onClose?.() }} className={`h-9 w-9 rounded-lg text-[17px] transition ${e.icon === i ? 'bg-accent/25' : 'hover:bg-ink/10'}`}>{i}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <form className="mt-2 flex gap-2" onSubmit={(ev) => { ev.preventDefault(); const v = custom.trim(); if (v) { up({ icon: [...v].slice(0, 2).join('') }); setCustom('') } }}>
          <input className="input !py-1.5 text-sm" placeholder="Autre emoji (clavier 😀)" value={custom} onChange={(ev) => setCustom(ev.target.value)} />
          <button className="btn-soft text-xs">OK</button>
        </form>
      </div>
    </div>
  )
}
