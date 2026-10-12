import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useData, useUI, resolve, ancestors, displayTitle, progressOf, relationCounts, relatedEntities, relatedTasks, uid, descendants } from '../lib/store'
import { TYPE_META } from '../lib/meta'
import { LookPicker } from './LookPicker'
import { fmtDay, fmtRelative, recurrenceLabel, DAY_NAMES, today } from '../lib/dates'
import { Markdown, toggleCheckboxLine } from '../lib/markdown'
import { Icon, Info, Modal, ProgressBar, PriorityBadge, Segmented, TypeGlyph, Toggle, useIsMobile } from './ui'
import { TaskRow } from './TaskRow'
import type { Entity, Recurrence } from '../lib/types'

const HISTORY_LABEL: Record<string, string> = {
  created: 'Créé', status: 'Statut', done: 'Terminé', reopened: 'Réouvert', postponed: 'Reporté', moved: 'Déplacé',
  linked: 'Lié à', archived: 'Archivé', unarchived: 'Désarchivé'
}

export function DetailPanel() {
  const id = useUI((s) => s.detailId)
  const raw = useData((s) => (id ? s.entities[id] : undefined))
  const ents = useData((s) => s.entities)
  const mobile = useIsMobile()
  useEffect(() => {
    const fn = (e: KeyboardEvent) => e.key === 'Escape' && useUI.getState().set({ detailId: null })
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [])
  const sheetRef = useRef<HTMLElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const backRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ y0: number; y: number; t: number; on: boolean; fromBody: boolean } | null>(null)
  if (!id || !raw) return null
  const e = resolve(ents, raw)
  const close = () => useUI.getState().set({ detailId: null })

  // Glisser vers le bas pour fermer (poignée, en-tête, ou contenu quand il est tout en haut)
  const setY = (y: number, anim = false) => {
    const el = sheetRef.current
    if (!el) return
    el.style.transition = anim ? 'transform .26s cubic-bezier(.2,.8,.2,1)' : 'none'
    el.style.transform = y ? `translateY(${y}px)` : ''
    if (backRef.current) { backRef.current.style.transition = el.style.transition.replace('transform', 'opacity'); backRef.current.style.opacity = String(Math.max(0, 1 - y / 500)) }
  }
  const onStart = (ev: React.TouchEvent, fromBody: boolean) => {
    if (fromBody && (scrollRef.current?.scrollTop || 0) > 0) return
    const tag = (ev.target as HTMLElement).tagName
    if (!fromBody && (tag === 'TEXTAREA' || tag === 'INPUT')) return
    drag.current = { y0: ev.touches[0].clientY, y: 0, t: Date.now(), on: false, fromBody }
  }
  const onMove = (ev: React.TouchEvent) => {
    const d = drag.current
    if (!d) return
    const dy = ev.touches[0].clientY - d.y0
    if (!d.on) {
      if (dy < -4 || (d.fromBody && (scrollRef.current?.scrollTop || 0) > 0)) { drag.current = null; return }
      if (dy > 8) d.on = true
      else return
    }
    d.y = Math.max(0, dy - 8)
    setY(d.y)
  }
  const onEnd = () => {
    const d = drag.current
    drag.current = null
    if (!d || !d.on) return
    const v = d.y / Math.max(1, Date.now() - d.t)
    if (d.y > 130 || v > 0.6) {
      setY(window.innerHeight, true)
      setTimeout(close, 220)
    } else setY(0, true)
  }
  const touch = (fromBody: boolean) => (mobile ? { onTouchStart: (ev: React.TouchEvent) => onStart(ev, fromBody), onTouchMove: onMove, onTouchEnd: onEnd, onTouchCancel: onEnd } : {})

  return (
    <>
      {mobile && <div ref={backRef} className="fade fixed inset-0 z-40 bg-[#0a0d1c]/55 backdrop-blur-[2px]" onClick={close} />}
      <aside
        ref={sheetRef}
        className={`fixed z-50 flex flex-col border-line/70 bg-surface shadow-2xl ${mobile ? 'sheet inset-x-0 bottom-0 top-[6vh] rounded-t-[28px] border-t' : 'slidein bottom-3 right-3 top-3 w-[420px] rounded-3xl border'}`}
        key={e.id}
      >
        <div {...touch(false)} className="shrink-0 touch-none">
          {mobile && <div className="flex justify-center pb-1 pt-2.5"><div className="h-1.5 w-11 rounded-full bg-ink/25" /></div>}
          <Header e={e} raw={raw} onClose={close} />
        </div>
        <div ref={scrollRef} {...touch(true)} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-10 safe-b">
          <Body e={e} raw={raw} />
        </div>
      </aside>
    </>
  )
}

function Header({ e, raw, onClose }: { e: Entity; raw: Entity; onClose: () => void }) {
  const ents = useData((s) => s.entities)
  const [title, setTitle] = useState(e.title)
  const [look, setLook] = useState(false)
  useEffect(() => setTitle(e.title), [e.id, e.title])
  const path = ancestors(ents, raw.id)
  const map = raw.mapId ? ents[raw.mapId] : undefined
  const ui = useUI.getState()
  return (
    <div className="shrink-0 px-5 pb-3 pt-4">
      <div className="mb-2 flex items-center gap-1 text-[11px] text-mute">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden whitespace-nowrap">
        {map && <button className="shrink-0 hover:text-ink" onClick={() => { useData.getState().setSettings({ activeMapId: map.id }); ui.go('map') }}>{map.title}</button>}
        {path.length > 1 && <span className="flex shrink-0 items-center gap-1"><span>›</span><button className="hover:text-ink" title={path.slice(0, -1).map((p) => displayTitle(ents, p)).join(' › ')} onClick={() => ui.open(path[path.length - 2].id)}>…</button></span>}
        {path.slice(-1).map((p) => (
          <span key={p.id} className="flex min-w-0 items-center gap-1"><span>›</span><button className="truncate hover:text-ink" onClick={() => ui.open(p.id)}>{displayTitle(ents, p)}</button></span>
        ))}
        {!map && !path.length && <span>{TYPE_META[e.type].label}{e.inbox ? ' · Inbox' : ''}</span>}
        </div>
        <button className="icon-btn !h-8 !w-8" title="Favori" onClick={() => useData.getState().update(e.id, { favorite: !e.favorite })}>
          <span className={e.favorite ? 'text-[#f2b45a]' : ''}>{e.favorite ? '★' : '☆'}</span>
        </button>
        <button className="icon-btn !h-8 !w-8" title="Ajouter à…" onClick={() => ui.set({ addTo: { sourceId: raw.id, mode: 'link' } })}><Icon name="link" className="h-4 w-4" /></button>
        <button className="icon-btn !h-8 !w-8" title="Plus" onClick={(ev) => ui.set({ menu: { id: raw.id, x: ev.clientX - 200, y: ev.clientY + 10 } })}><Icon name="more" className="h-4 w-4" /></button>
        <button className="icon-btn !h-8 !w-8" onClick={onClose}><Icon name="close" className="h-4 w-4" /></button>
      </div>
      <div className="flex items-start gap-3">
        {e.type === 'task' ? (
          <button className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition" style={{ borderColor: e.done ? '#6fe0b8' : 'rgb(var(--line))', background: e.done ? '#6fe0b8' : '' }} onClick={() => useData.getState().toggleDone(e.id)}>
            {e.done && <Icon name="check" className="h-3.5 w-3.5 text-bg" stroke={2.6} />}
          </button>
        ) : (
          <button className="relative shrink-0" title="Emoji et couleur" onClick={() => setLook(!look)}>
            <TypeGlyph e={e} size="lg" />
            <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-line bg-surface text-[9px] text-mute">✎</span>
          </button>
        )}
        <textarea
          rows={1}
          className={`min-w-0 flex-1 resize-none bg-transparent font-display text-xl font-semibold leading-tight outline-none placeholder:text-mute/50 ${e.done ? 'text-mute line-through' : ''}`}
          value={title}
          placeholder="Titre"
          onChange={(ev) => setTitle(ev.target.value)}
          onBlur={() => title.trim() !== e.title && useData.getState().update(e.id, { title: title.trim() || e.title })}
          onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); (ev.target as HTMLTextAreaElement).blur() } }}
          style={{ fieldSizing: 'content' } as any}
        />
      </div>
      {look && <div className="fade mt-3 rounded-2xl border border-line/60 bg-raised/40 p-3"><LookPicker e={e} onClose={() => setLook(false)} /></div>}
      {raw.type === 'ref' && (
        <div className="mt-2 flex items-center gap-1.5 text-[11.5px] text-accent">
          ⇢ Référence <Info text={`Tu modifies l’original « ${e.title} » : le changement apparaît partout où il est placé.`} />
        </div>
      )}
    </div>
  )
}

function Body({ e, raw }: { e: Entity; raw: Entity }) {
  const ents = useData((s) => s.entities)
  const settings = useData((s) => s.settings)
  const up = (patch: Partial<Entity>) => useData.getState().update(e.id, patch)
  const [more, setMore] = useState(false)
  const isProj = ['project', 'subproject', 'objective', 'vision', 'category'].includes(e.type)
  const isWork = ['project', 'subproject', 'objective', 'vision'].includes(e.type)
  const isTask = e.type === 'task'
  const progress = progressOf(ents, e)
  const noteLike = ['note', 'idea', 'text', 'document'].includes(e.type)

  return (
    <div className="space-y-5">
      {isTask && !e.done && !!e.postponed && e.postponedFrom && (
        <div className="rounded-2xl border border-[#f2b45a]/30 bg-[#f2b45a]/10 px-3.5 py-2.5 text-[12.5px] text-[#e8a948]">
          Cette tâche était prévue {fmtDay(e.postponedFrom).toLowerCase()} et a été automatiquement reportée.
          <span className="ml-1 font-semibold">Reportée {e.postponed} fois.</span>
        </div>
      )}

      {/* Statut / priorité */}
      {(isWork || isTask || e.type === 'milestone') && (
        <div className="grid grid-cols-2 gap-3">
          {e.type !== 'milestone' && (
            <Field label="Statut">
              <select className="input" value={e.status || ''} onChange={(ev) => up({ status: ev.target.value, done: settings.statuses.find((s) => s.id === ev.target.value)?.done ? true : isTask ? false : e.done, doneAt: settings.statuses.find((s) => s.id === ev.target.value)?.done ? new Date().toISOString() : e.doneAt })}>
                <option value="">—</option>
                {settings.statuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </Field>
          )}
          {e.type === 'milestone' && (
            <Field label="Atteint">
              <div className="flex h-[38px] items-center"><Toggle on={!!e.done} onChange={(v) => up({ done: v, status: v ? 'done' : 'todo', doneAt: v ? new Date().toISOString() : null })} /></div>
            </Field>
          )}
          <Field label={e.type === 'milestone' ? 'Date' : 'Prévu le'}>
            <input type="date" className="input" value={e.date || ''} onChange={(ev) => up({ date: ev.target.value || null, inbox: false, postponed: 0, postponedFrom: null })} />
          </Field>
        </div>
      )}

      {(isTask || isWork) && (
        <Field label="Priorité" right={<span className="text-[11px] font-medium" style={{ color: settings.priorities.find((p) => p.level === e.priority)?.color }}>{settings.priorities.find((p) => p.level === e.priority)?.label}</span>}>
          <div className="flex gap-1">
            {settings.priorities.map((p) => (
              <button key={p.level} title={p.label} onClick={() => up({ priority: e.priority === p.level ? undefined : p.level })}
                className="flex h-8 flex-1 items-center justify-center rounded-lg border text-[13px] transition"
                style={{ color: p.color, borderColor: e.priority === p.level ? p.color : 'rgb(var(--line) / .7)', background: e.priority === p.level ? `${p.color}1f` : 'transparent' }}>
                {p.glyph}
              </button>
            ))}
          </div>
        </Field>
      )}

      {/* Progression */}
      {isProj && (
        <Field label="Progression" right={<Segmented value={e.progressMode || 'auto'} onChange={(v) => up({ progressMode: v, progress: v === 'manual' ? progress ?? 0 : e.progress })} options={[{ value: 'auto', label: 'Auto' }, { value: 'manual', label: 'Manuelle' }]} />}>
          {e.progressMode === 'manual' ? (
            <div className="flex items-center gap-3">
              <input type="range" min={0} max={100} step={5} value={e.progress ?? 0} onChange={(ev) => up({ progress: Number(ev.target.value) })} className="flex-1 accent-[rgb(var(--accent))]" />
              <span className="w-10 text-right font-mono text-sm">{e.progress ?? 0}%</span>
            </div>
          ) : progress != null ? <ProgressBar value={progress} color={e.color} /> : <div className="flex items-center gap-1.5 text-xs text-mute">—<Info text="Calculée automatiquement depuis les tâches liées. Aucune pour l’instant." /></div>}
        </Field>
      )}

      {/* Relations */}
      {isProj && <Relations id={e.id} />}

      {/* Contenu */}
      {(e.type === 'link' || e.type === 'image' || e.type === 'document') && (
        <Field label={e.type === 'image' ? 'URL de l’image' : 'Lien'}>
          <input className="input" placeholder="https://" value={e.url || ''} onChange={(ev) => up({ url: ev.target.value })} />
          {e.url && e.type === 'image' && /^https?:/.test(e.url) && <img src={e.url} alt="" className="mt-2 max-h-56 w-full rounded-xl object-cover" />}
          {e.url && e.type !== 'image' && /^https?:/.test(e.url) && <a href={e.url} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-xs text-accent">Ouvrir <Icon name="open" className="h-3 w-3" /></a>}
        </Field>
      )}
      {e.type === 'maplink' && (
        <Field label="Map cible">
          <select className="input" value={e.targetMapId || ''} onChange={(ev) => up({ targetMapId: ev.target.value || undefined })}>
            <option value="">— choisir —</option>
            {Object.values(ents).filter((m) => m.type === 'map' && !m.archived).map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
          </select>
          {e.targetMapId && <button className="mt-2 text-xs font-medium text-accent" onClick={() => { useData.getState().setSettings({ activeMapId: e.targetMapId! }); useUI.getState().set({ detailId: null }); useUI.getState().go('map') }}>Ouvrir la map →</button>}
        </Field>
      )}
      {e.type === 'expense' && (
        <Field label="Montant">
          <input type="number" className="input" value={e.amount ?? ''} onChange={(ev) => up({ amount: ev.target.value === '' ? undefined : Number(ev.target.value) })} />
        </Field>
      )}

      <Description e={e} big={noteLike} />

      {(isTask || e.type === 'checklist') && <Checklist e={e} title={isTask ? 'Sous-tâches' : 'Checklist'} />}

      {isTask && <TaskExtras e={e} />}

      <LinksField e={e} raw={raw} />

      {/* Détails secondaires (progressive disclosure) */}
      <button className="flex w-full items-center gap-2 text-xs font-medium text-mute hover:text-ink" onClick={() => setMore(!more)}>
        <Icon name="chevron" className={`h-3.5 w-3.5 transition ${more ? 'rotate-90' : ''}`} /> {more ? 'Moins' : 'Plus (tags, historique, commentaires)'}
      </button>
      {more && (
        <div className="space-y-5">
          {(isProj || ['milestone', 'idea', 'note', 'map'].includes(e.type)) && (
            <Field label="Deadline">
              <input type="date" className="input" value={e.deadline || ''} onChange={(ev) => up({ deadline: ev.target.value || null })} />
            </Field>
          )}
          <LookPicker e={e} />
          <Tags e={e} />
          <Comments e={e} />
          <History e={e} />
        </div>
      )}

      <Footer e={e} raw={raw} />
    </div>
  )
}

function Field({ label, children, right }: { label: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-center justify-between"><span className="label !mb-0">{label}</span>{right}</div>
      {children}
    </div>
  )
}

function Description({ e, big }: { e: Entity; big: boolean }) {
  const [edit, setEdit] = useState(!e.description && big)
  const [text, setText] = useState(e.description || '')
  const [pickNote, setPickNote] = useState(false)
  const insertNote = (n: Entity) => {
    const ta = document.getElementById('md-' + e.id) as HTMLTextAreaElement | null
    const label = (n.title || 'Note').replace(/[\[\]]/g, '')
    const tag = `[${label}](orbite:${n.id})`
    const at = ta ? ta.selectionStart : text.length
    const next = text.slice(0, at) + (at && !/\s$/.test(text.slice(0, at)) ? ' ' : '') + tag + ' ' + text.slice(at)
    setText(next)
    useData.getState().update(e.id, { description: next, linkedIds: [...new Set([...(e.linkedIds || []), n.id])] })
    setPickNote(false)
  }
  useEffect(() => setText(e.description || ''), [e.id])
  const save = () => text !== (e.description || '') && useData.getState().update(e.id, { description: text })
  const wrap = (before: string, after = before) => {
    const ta = document.getElementById('md-' + e.id) as HTMLTextAreaElement | null
    if (!ta) return
    const { selectionStart: a, selectionEnd: b } = ta
    const next = text.slice(0, a) + before + text.slice(a, b) + after + text.slice(b)
    setText(next)
    setTimeout(() => { ta.focus(); ta.setSelectionRange(a + before.length, b + before.length) })
  }
  const line = (prefix: string) => {
    const ta = document.getElementById('md-' + e.id) as HTMLTextAreaElement | null
    if (!ta) return
    const a = ta.selectionStart
    const start = text.lastIndexOf('\n', a - 1) + 1
    setText(text.slice(0, start) + prefix + text.slice(start))
    setTimeout(() => ta.focus())
  }
  return (
    <>
    {pickNote && <NotePicker onPick={insertNote} onClose={() => setPickNote(false)} />}
    <Field label={big ? 'Contenu' : 'Description'} right={<span className="flex items-center gap-3"><button className="text-[11px] font-medium text-[#d6c6ff]" onClick={() => setPickNote(true)}>≡ Lier une note</button><button className="text-[11px] font-medium text-accent" onClick={() => { if (edit) save(); setEdit(!edit) }}>{edit ? 'Aperçu' : 'Modifier'}</button></span>}>
      {edit ? (
        <div className="rounded-2xl border border-line bg-raised/40 focus-within:border-accent/50">
          <div className="flex gap-0.5 border-b border-line/60 px-1.5 py-1 text-[12px]">
            {[['H', () => line('## ')], ['B', () => wrap('**')], ['I', () => wrap('*')], ['•', () => line('- ')], ['☐', () => line('- [ ] ')], ['↗', () => wrap('[', '](https://)')], ['≡ Note', () => setPickNote(true)]].map(([l, fn]) => (
              <button key={l as string} onMouseDown={(ev) => ev.preventDefault()} onClick={fn as () => void} className={`h-7 rounded-md hover:bg-ink/10 ${l === '≡ Note' ? 'ml-auto px-2 text-[11.5px] font-medium text-[#d6c6ff]' : 'w-7'} ${l === 'B' ? 'font-bold' : l === 'I' ? 'italic' : ''}`}>{l as string}</button>
            ))}
          </div>
          <textarea id={'md-' + e.id} className={`w-full resize-y bg-transparent px-3 py-2.5 text-sm leading-relaxed outline-none ${big ? 'min-h-[220px]' : 'min-h-[90px]'}`} value={text} onChange={(ev) => setText(ev.target.value)} onBlur={save} placeholder="Écris… (markdown : ## titre, **gras**, - [ ] case)" autoFocus={!e.description} />
        </div>
      ) : text ? (
        <div className="text-sm" onDoubleClick={() => setEdit(true)}>
          <Markdown text={text} onToggle={(i) => { const n = toggleCheckboxLine(text, i); setText(n); useData.getState().update(e.id, { description: n }) }} />
        </div>
      ) : (
        <button className="w-full rounded-xl border border-dashed border-line px-3 py-3 text-left text-sm text-mute hover:text-ink" onClick={() => setEdit(true)}>Ajouter du contenu…</button>
      )}
    </Field>
    </>
  )
}

function NotePicker({ onPick, onClose }: { onPick: (n: Entity) => void; onClose: () => void }) {
  const ents = useData((s) => s.entities)
  const [q, setQ] = useState('')
  const notes = Object.values(ents)
    .filter((n) => ['note', 'idea', 'text', 'checklist', 'document'].includes(n.type) && !n.archived)
    .filter((n) => !q || n.title.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 40)
  return (
    <Modal open onClose={onClose} title="Insérer le lien d’une note">
      <div className="px-4 pb-4">
        <input autoFocus className="input mb-2" placeholder="Rechercher une note…" value={q} onChange={(ev) => setQ(ev.target.value)} />
        {q.trim() && (
          <button className="mb-1 flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm text-accent hover:bg-ink/5" onClick={() => onPick(useData.getState().create({ type: 'note', title: q.trim() }))}>＋ Créer la note « {q.trim()} »</button>
        )}
        {notes.map((n) => (
          <button key={n.id} onClick={() => onPick(n)} className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-ink/5">
            <span style={{ color: TYPE_META[n.type].tint }}>{TYPE_META[n.type].glyph}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm">{n.title || 'Sans titre'}</span>{n.description && <span className="block truncate text-[11px] text-mute">{n.description.replace(/[#*\[\]]/g, '').slice(0, 80)}</span>}</span>
          </button>
        ))}
        {!notes.length && !q && <div className="py-6 text-center text-sm text-mute">Aucune note pour l’instant.</div>}
      </div>
    </Modal>
  )
}

function Checklist({ e, title }: { e: Entity; title: string }) {
  const [txt, setTxt] = useState('')
  const items = e.checklist || []
  const up = (checklist: typeof items) => useData.getState().update(e.id, { checklist })
  const doneN = items.filter((i) => i.done).length
  return (
    <Field label={title} right={items.length ? <span className="font-mono text-[11px] text-mute">{doneN}/{items.length}</span> : null}>
      <div className="space-y-0.5">
        {items.map((it) => (
          <div key={it.id} className="group flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-ink/5">
            <button className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border ${it.done ? 'border-accent bg-accent' : 'border-line'}`} onClick={() => up(items.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)))}>
              {it.done && <Icon name="check" className="h-3 w-3 text-bg" stroke={3} />}
            </button>
            <input className={`flex-1 bg-transparent text-sm outline-none ${it.done ? 'text-mute line-through' : ''}`} value={it.text} onChange={(ev) => up(items.map((x) => (x.id === it.id ? { ...x, text: ev.target.value } : x)))} />
            <button className="opacity-0 transition group-hover:opacity-100" onClick={() => up(items.filter((x) => x.id !== it.id))}><Icon name="close" className="h-3.5 w-3.5 text-mute" /></button>
          </div>
        ))}
        <form onSubmit={(ev) => { ev.preventDefault(); if (!txt.trim()) return; up([...items, { id: uid(), text: txt.trim(), done: false }]); setTxt('') }} className="flex items-center gap-2 px-1 py-1">
          <Icon name="plus" className="h-4 w-4 text-mute" />
          <input className="flex-1 bg-transparent text-sm outline-none placeholder:text-mute/70" placeholder="Ajouter un élément" value={txt} onChange={(ev) => setTxt(ev.target.value)} />
        </form>
      </div>
    </Field>
  )
}

function TaskExtras({ e }: { e: Entity }) {
  const up = (patch: Partial<Entity>) => useData.getState().update(e.id, patch)
  const r = e.recurrence
  const setR = (next: Recurrence | null) => up({ recurrence: next, date: next && !e.date ? today() : e.date })
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Field label="Heure"><input type="time" className="input !px-2" value={e.time || ''} onChange={(ev) => up({ time: ev.target.value || null })} /></Field>
        <Field label="Deadline"><input type="date" className="input !px-2" value={e.deadline || ''} onChange={(ev) => up({ deadline: ev.target.value || null })} /></Field>
        <Field label="Durée (min)"><input type="number" min={0} step={5} className="input !px-2" value={e.duration ?? ''} onChange={(ev) => up({ duration: ev.target.value ? Number(ev.target.value) : null })} /></Field>
      </div>
      <Field label="Répétition" right={r ? <span className="text-[11px] text-accent">{recurrenceLabel(r)}</span> : null}>
        <div className="flex flex-wrap gap-1.5">
          {([['none', 'Jamais'], ['daily', 'Chaque jour'], ['weekdays', 'Certains jours'], ['weekly', 'Chaque semaine'], ['monthly', 'Chaque mois'], ['every', 'Tous les N jours']] as const).map(([k, l]) => (
            <button key={k} className={`chip !px-2.5 !py-1 ${(r?.kind ?? 'none') === k ? '!border-accent !text-accent' : ''}`} onClick={() => setR(k === 'none' ? null : { kind: k, days: k === 'weekdays' ? [1, 2, 3, 4, 5] : undefined, interval: k === 'every' ? 2 : 1 })}>{l}</button>
          ))}
        </div>
        {r?.kind === 'weekdays' && (
          <div className="mt-2 flex gap-1">
            {DAY_NAMES.map((d, i) => {
              const on = r.days?.includes(i)
              return <button key={d} className={`h-8 w-9 rounded-lg text-[11px] font-medium ${on ? 'bg-accent text-white dark:text-bg' : 'bg-ink/5 text-mute'}`} onClick={() => setR({ ...r, days: on ? r.days!.filter((x) => x !== i) : [...(r.days || []), i].sort() })}>{d}</button>
            })}
          </div>
        )}
        {(r?.kind === 'every' || r?.kind === 'weekly' || r?.kind === 'monthly') && (
          <div className="mt-2 flex items-center gap-2 text-sm">Intervalle <input type="number" min={1} className="input !w-20 !py-1" value={r.interval || 1} onChange={(ev) => setR({ ...r, interval: Math.max(1, Number(ev.target.value)) })} /></div>
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Rappel">
          <input type="datetime-local" className="input !px-2" value={e.reminder ? e.reminder.slice(0, 16) : ''} onChange={(ev) => { up({ reminder: ev.target.value || null }); if (ev.target.value && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission() }} />
        </Field>
        <Field label="Un jour / peut-être">
          <div className="flex h-[38px] items-center"><Toggle on={e.horizon === 'someday'} onChange={(v) => up({ horizon: v ? 'someday' : 'auto', inbox: false })} /></div>
        </Field>
      </div>
    </div>
  )
}

function Relations({ id }: { id: string }) {
  const ents = useData((s) => s.entities)
  const [kind, setKind] = useState<keyof ReturnType<typeof relationCounts> | null>(null)
  const [newTask, setNewTask] = useState('')
  const c = relationCounts(ents, id)
  const labels: [keyof typeof c, string][] = [['tasks', 'tâches'], ['objectives', 'objectifs'], ['notes', 'notes'], ['documents', 'documents'], ['milestones', 'jalons'], ['projects', 'projets']]
  const list = kind ? (kind === 'tasks' ? relatedTasks(ents, id) : relatedEntities(ents, id, kind)) : []
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {labels.filter(([k]) => c[k] > 0).map(([k, l]) => (
          <button key={k} onClick={() => setKind(kind === k ? null : k)} className={`rounded-full border px-2.5 py-1 text-[12px] transition ${kind === k ? 'border-accent/60 bg-accent/10 text-ink' : 'border-line/70 text-mute hover:text-ink'}`}>
            <b className="font-semibold text-ink">{c[k]}</b> {c[k] > 1 ? l : l.replace(/s$/, '')}
          </button>
        ))}
        <button onClick={() => setKind(kind === 'tasks' ? null : 'tasks')} className="rounded-full border border-dashed border-line/70 px-2.5 py-1 text-[12px] text-mute hover:text-ink">+ tâche</button>
      </div>
      {kind && (
        <div className="fade mt-2 rounded-2xl border border-line/60 p-1">
          {kind === 'tasks'
            ? list.sort((a, b) => Number(a.done) - Number(b.done)).map((t) => <TaskRow key={t.id} t={t} compact />)
            : list.map((x) => (
                <button key={x.id} className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-ink/5" onClick={() => useUI.getState().open(x.id)}>
                  <TypeGlyph e={x} size="sm" /><span className="truncate">{x.title}</span>
                </button>
              ))}
          {!list.length && <div className="px-3 py-3 text-xs text-mute">Rien pour l’instant.</div>}
          {kind === 'tasks' && (
            <form className="flex items-center gap-2 px-2 py-1.5" onSubmit={(ev) => { ev.preventDefault(); if (!newTask.trim()) return; useData.getState().create({ type: 'task', title: newTask.trim(), projectIds: ents[id].type === 'objective' ? [] : [id], objectiveIds: ents[id].type === 'objective' ? [id] : [] }); setNewTask('') }}>
              <Icon name="plus" className="h-4 w-4 text-mute" />
              <input className="flex-1 bg-transparent text-sm outline-none placeholder:text-mute/70" placeholder="Nouvelle tâche liée" value={newTask} onChange={(ev) => setNewTask(ev.target.value)} />
            </form>
          )}
        </div>
      )}
    </div>
  )
}

function LinksField({ e, raw }: { e: Entity; raw: Entity }) {
  const ents = useData((s) => s.entities)
  const links = [...(e.projectIds || []), ...(e.objectiveIds || []), ...(e.linkedIds || [])].filter((l, i, a) => ents[l] && a.indexOf(l) === i)
  // éléments qui pointent vers celui-ci (relations inverses)
  const back = Object.values(ents).filter((x) => x.id !== e.id && !links.includes(x.id) && (x.linkedIds?.includes(e.id) || x.projectIds?.includes(e.id) || x.objectiveIds?.includes(e.id)) && !['project', 'subproject', 'objective'].includes(e.type))
  const unlink = (l: string) => useData.getState().update(e.id, { projectIds: e.projectIds?.filter((x) => x !== l), objectiveIds: e.objectiveIds?.filter((x) => x !== l), linkedIds: e.linkedIds?.filter((x) => x !== l) })
  return (
    <Field label="Relié à" right={<button className="text-[11px] font-medium text-accent" onClick={() => useUI.getState().set({ addTo: { sourceId: raw.id, mode: 'link' } })}>+ Ajouter à…</button>}>
      <div className="flex flex-wrap gap-1.5">
        {links.map((l) => (
          <span key={l} className="group inline-flex items-center gap-1.5 rounded-full border border-line/80 py-0.5 pl-1 pr-2 text-xs">
            <TypeGlyph e={ents[l]} size="sm" />
            <button className="max-w-[160px] truncate hover:underline" onClick={() => useUI.getState().open(l)}>{displayTitle(ents, ents[l])}</button>
            <button onClick={() => unlink(l)} className="text-mute hover:text-ink">×</button>
          </span>
        ))}
        {back.map((x) => (
          <span key={x.id} className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-line/80 py-0.5 pl-1 pr-2 text-xs text-mute">
            <TypeGlyph e={x} size="sm" />
            <button className="max-w-[160px] truncate hover:underline" onClick={() => useUI.getState().open(x.id)}>{x.title}</button>
          </span>
        ))}
        {!links.length && !back.length && <span className="text-xs text-mute">Aucune relation.</span>}
      </div>
    </Field>
  )
}

function Tags({ e }: { e: Entity }) {
  const [t, setT] = useState('')
  const tags = e.tags || []
  return (
    <Field label="Tags">
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((x) => <span key={x} className="chip">#{x}<button onClick={() => useData.getState().update(e.id, { tags: tags.filter((y) => y !== x) })}>×</button></span>)}
        <form onSubmit={(ev) => { ev.preventDefault(); const v = t.trim().replace(/^#/, ''); if (v && !tags.includes(v)) useData.getState().update(e.id, { tags: [...tags, v] }); setT('') }}>
          <input className="w-28 bg-transparent text-xs outline-none placeholder:text-mute/70" placeholder="+ tag" value={t} onChange={(ev) => setT(ev.target.value)} />
        </form>
      </div>
    </Field>
  )
}

function Comments({ e }: { e: Entity }) {
  const [t, setT] = useState('')
  const list = e.comments || []
  return (
    <Field label="Commentaires personnels">
      <div className="space-y-2">
        {list.map((c) => (
          <div key={c.id} className="group rounded-xl bg-ink/[0.04] px-3 py-2 text-sm">
            <div className="whitespace-pre-wrap">{c.text}</div>
            <div className="mt-1 flex justify-between text-[10.5px] text-mute">{fmtRelative(c.at)}<button className="opacity-0 group-hover:opacity-100" onClick={() => useData.getState().update(e.id, { comments: list.filter((x) => x.id !== c.id) })}>supprimer</button></div>
          </div>
        ))}
        <form onSubmit={(ev) => { ev.preventDefault(); if (!t.trim()) return; useData.getState().update(e.id, { comments: [...list, { id: uid(), at: new Date().toISOString(), text: t.trim() }] }); setT('') }} className="flex gap-2">
          <input className="input" placeholder="Note pour moi-même…" value={t} onChange={(ev) => setT(ev.target.value)} />
          <button className="btn-soft">OK</button>
        </form>
      </div>
    </Field>
  )
}

function History({ e }: { e: Entity }) {
  const statuses = useData((s) => s.settings.statuses)
  const h = [...(e.history || [])].reverse().slice(0, 20)
  return (
    <Field label="Historique">
      <ol className="relative ml-1.5 border-l border-line/80 pl-4">
        {h.map((x, i) => (
          <li key={i} className="relative pb-2.5 text-xs">
            <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full border border-line bg-surface" />
            <span className="font-medium">{HISTORY_LABEL[x.action] || x.action}</span>
            {x.detail && <span className="text-mute"> · {x.action === 'status' ? statuses.find((s) => s.id === x.detail)?.label || x.detail : x.detail}</span>}
            <div className="text-[10.5px] text-mute">{new Date(x.at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</div>
          </li>
        ))}
      </ol>
    </Field>
  )
}

function Footer({ e, raw }: { e: Entity; raw: Entity }) {
  const ui = useUI.getState()
  const data = useData.getState()
  const onMap = !!raw.mapId
  return (
    <div className="flex flex-wrap gap-2 border-t border-line/60 pt-4">
      {!onMap && (
        <button className="btn-soft text-xs" onClick={() => ui.set({ addTo: { sourceId: raw.id, mode: 'pickParent', onPick: (target) => {
          const t = useData.getState().entities[target]
          const mapId = t.type === 'map' ? t.id : t.mapId
          if (!mapId) return
          useData.getState().addRef(e.id, t.type === 'map' ? null : t.id, mapId, t.type === 'map' ? { x: 0, y: 200 } : undefined)
          if (t.type !== 'map') useData.getState().link(e.id, t.id)
          useUI.getState().notify('Ajouté à la Mind Map (référence liée)')
        } } })}>
          <Icon name="map" className="h-4 w-4" /> Mettre sur la map
        </button>
      )}
      {onMap && (
        <button className="btn-soft text-xs" onClick={() => { data.setSettings({ activeMapId: raw.mapId! }); ui.set({ detailId: null }); ui.go('map') }}>
          <Icon name="map" className="h-4 w-4" /> Voir sur la map
        </button>
      )}
      <button className="btn-soft text-xs" onClick={() => ui.set({ share: raw.id })}><Icon name="share" className="h-4 w-4" /> Partager</button>
      <div className="flex-1" />
      <button className="icon-btn" title={raw.archived ? 'Désarchiver' : 'Archiver'} onClick={() => { data.archive(raw.id, !raw.archived); ui.set({ detailId: null }) }}><Icon name="archive" className="h-4 w-4" /></button>
      <button className="icon-btn text-[#ff7a7a] hover:!text-[#ff7a7a]" title="Supprimer" onClick={() => {
        const n = descendants(data.entities, raw.id).length
        if (confirm(n ? `Supprimer avec ${n} élément(s) enfant(s) ?` : 'Supprimer définitivement ?')) { data.remove(raw.id); ui.set({ detailId: null }) }
      }}><Icon name="trash" className="h-4 w-4" /></button>
    </div>
  )
}

export { PriorityBadge }
