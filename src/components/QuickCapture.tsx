import { useEffect, useMemo, useRef, useState } from 'react'
import { useData, useUI } from '../lib/store'
import { parseCapture } from '../lib/parser'
import { fmtDay } from '../lib/dates'
import { TYPE_META } from '../lib/meta'
import { Icon, Modal } from './ui'
import type { EntityType } from '../lib/types'

const TYPES: EntityType[] = ['task', 'idea', 'note', 'project', 'objective', 'milestone']

const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

// Capture rapide + commande vocale (Web Speech API, gratuite, locale au navigateur)
export function QuickCapture() {
  const cap = useUI((s) => s.capture)
  const ents = useData((s) => s.entities)
  const prios = useData((s) => s.settings.priorities)
  const [text, setText] = useState('')
  const [type, setType] = useState<EntityType | null>(null)
  const [listening, setListening] = useState(false)
  const [voiceErr, setVoiceErr] = useState<string | null>(null)
  const recRef = useRef<any>(null)

  useEffect(() => {
    if (!cap?.open) return
    setText(cap.text || '')
    setType(cap.type ?? null)
    setVoiceErr(null)
    if (cap.voice) setTimeout(startVoice, 150)
    return () => recRef.current?.abort?.()
  }, [cap?.open])

  const parsed = useMemo(() => parseCapture(text, Object.values(ents)), [text, ents])
  const finalType = type ?? parsed.type

  if (!cap?.open) return null
  const close = () => { recRef.current?.abort?.(); setListening(false); useUI.getState().set({ capture: null }) }

  function startVoice() {
    if (!SR) { setVoiceErr('La reconnaissance vocale n’est pas disponible sur ce navigateur. Tape ta phrase, elle sera analysée de la même façon.'); return }
    try {
      const rec = new SR()
      rec.lang = 'fr-FR'
      rec.interimResults = true
      rec.continuous = false
      rec.onresult = (ev: any) => {
        let s = ''
        for (let i = 0; i < ev.results.length; i++) s += ev.results[i][0].transcript
        setText(s)
      }
      rec.onerror = (ev: any) => { setVoiceErr(ev.error === 'not-allowed' ? 'Micro refusé. Autorise-le dans les réglages du navigateur.' : 'Je n’ai pas compris. Réessaie ou tape le texte.'); setListening(false) }
      rec.onend = () => setListening(false)
      recRef.current = rec
      rec.start()
      setListening(true)
    } catch {
      setVoiceErr('Impossible de démarrer le micro.')
    }
  }

  const create = (toInbox: boolean) => {
    if (!text.trim()) return
    const s = useData.getState()
    if (toInbox) {
      const e = s.create({ type: finalType, title: text.trim(), inbox: true })
      useUI.getState().notify('Capturé dans l’Inbox')
      close()
      return e
    }
    const e = s.create({
      type: finalType,
      title: parsed.title,
      date: parsed.date ?? null,
      time: parsed.time ?? null,
      priority: parsed.priority,
      tags: parsed.tags.length ? parsed.tags : undefined,
      projectIds: parsed.projectId && ents[parsed.projectId]?.type !== 'objective' ? [parsed.projectId] : undefined,
      objectiveIds: parsed.projectId && ents[parsed.projectId]?.type === 'objective' ? [parsed.projectId] : undefined,
      inbox: finalType === 'task' && !parsed.date && !parsed.projectId
    })
    useUI.getState().notify(`${TYPE_META[finalType].label} créé${finalType === 'task' || finalType === 'idea' || finalType === 'note' ? 'e' : ''}`)
    close()
    return e
  }

  const prio = prios.find((p) => p.level === parsed.priority)
  const hasInfo = parsed.date || parsed.projectId || parsed.priority || parsed.time || parsed.tags.length

  return (
    <Modal open onClose={close} bare>
      <div className="p-4">
        <div className="mb-3 flex gap-1 overflow-x-auto no-scrollbar">
          {TYPES.map((t) => (
            <button key={t} onClick={() => setType(t)} className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition ${finalType === t ? 'bg-ink/[0.08] text-ink' : 'text-mute hover:text-ink'}`}>
              <span style={{ color: TYPE_META[t].tint }}>{TYPE_META[t].glyph}</span> {TYPE_META[t].label}
            </button>
          ))}
        </div>
        <div className="relative">
          <textarea
            autoFocus
            rows={2}
            className="w-full resize-none bg-transparent pr-12 font-display text-lg leading-snug outline-none placeholder:text-mute/50"
            placeholder="Demain appeler la banque pour Vagabox priorité haute"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); create(e.metaKey || e.ctrlKey ? true : false) } }}
          />
          <button onClick={() => (listening ? recRef.current?.stop() : startVoice())} className={`absolute right-0 top-0 flex h-10 w-10 items-center justify-center rounded-full transition ${listening ? 'bg-[#ff6b6b] text-white' : 'bg-ink/[0.06] text-ink/70 hover:bg-ink/10'}`} title="Dicter">
            {listening && <span className="absolute inset-0 animate-ping rounded-full bg-[#ff6b6b]/40" />}
            <Icon name="mic" className="relative h-5 w-5" />
          </button>
        </div>
        {voiceErr && <div className="mt-1 text-xs text-[#f2b45a]">{voiceErr}</div>}

        {text.trim() && hasInfo ? (
          <div className="fade mt-3 rounded-2xl border border-line/70 bg-raised/50 p-3">
            <div className="mb-1.5 text-[10.5px] uppercase tracking-wider text-mute">Je vais créer</div>
            <div className="text-sm font-medium">{parsed.title}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {parsed.date && <span className="chip !text-ink/80">📅 {fmtDay(parsed.date)}{parsed.time ? ` · ${parsed.time}` : ''}</span>}
              {parsed.projectTitle && <span className="chip !text-ink/80">▣ {parsed.projectTitle}</span>}
              {prio && <span className="chip" style={{ color: prio.color, borderColor: `${prio.color}66` }}>{prio.glyph} {prio.label}</span>}
              {parsed.tags.map((t) => <span key={t} className="chip">#{t}</span>)}
            </div>
          </div>
        ) : (
          <div className="mt-2 text-[11.5px] text-mute">Astuces : « demain », « vendredi », « le 15 », « 14h », « pour Shakpot », « priorité haute », #tag</div>
        )}

        <div className="mt-4 flex items-center gap-2">
          <button className="btn-ghost text-xs" onClick={() => create(true)} disabled={!text.trim()}>
            <Icon name="inbox" className="h-4 w-4" /> Inbox
          </button>
          <div className="flex-1" />
          <button className="btn-ghost text-xs" onClick={close}>Annuler</button>
          <button className="btn-accent" onClick={() => create(false)} disabled={!text.trim()}>Créer</button>
        </div>
      </div>
    </Modal>
  )
}
