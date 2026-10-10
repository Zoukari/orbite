import { useEffect, useRef, useState } from 'react'
import { signIn, signInPin, signUpPin, rememberedEmail, rememberEmail, syncNow } from '../lib/sync'
import { useData } from '../lib/store'

// Saisie d'un code à 6 chiffres (clavier numérique sur iPhone)
export function PinInput({ value, onChange, onDone, autoFocus }: { value: string; onChange: (v: string) => void; onDone?: (v: string) => void; autoFocus?: boolean }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (autoFocus) setTimeout(() => ref.current?.focus(), 50) }, [autoFocus])
  return (
    <label className="relative block cursor-text" onClick={() => ref.current?.focus()}>
      <input
        ref={ref}
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        maxLength={6}
        value={value}
        onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 6); onChange(v); if (v.length === 6) onDone?.(v) }}
        className="absolute inset-0 h-full w-full opacity-0"
      />
      <div className="flex justify-center gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={`flex h-12 w-10 items-center justify-center rounded-xl border text-xl font-semibold transition ${i === value.length ? 'border-accent' : 'border-line'} bg-raised/60`}>
            {value[i] ? '•' : ''}
          </div>
        ))}
      </div>
    </label>
  )
}

export function PinLogin({ onDone, allowCreate = true }: { onDone?: () => void; allowCreate?: boolean }) {
  const [email, setEmail] = useState(rememberedEmail())
  const [pin, setPinV] = useState('')
  const [mode, setMode] = useState<'pin' | 'create' | 'password'>('pin')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const askEmail = !rememberedEmail() || mode !== 'pin'

  const finish = async () => {
    await syncNow()
    const s = useData.getState()
    const m = Object.values(s.entities).find((x) => x.type === 'map')
    if (m) s.setSettings({ onboarded: true, activeMapId: s.settings.activeMapId || m.id })
    onDone?.()
  }
  const run = async (p = pin) => {
    if (!email.includes('@')) { setMsg('Entre ton e-mail.'); return }
    setBusy(true); setMsg(null)
    try {
      if (mode === 'password') { await signIn(email, pw); rememberEmail(email); await finish() }
      else if (mode === 'create') {
        if (p.length !== 6) throw new Error('Choisis un PIN de 6 chiffres.')
        const ok = await signUpPin(email, p)
        if (ok) await finish()
        else setMsg('Compte créé. Confirme l’e-mail reçu, puis reviens entrer ton PIN.')
      } else {
        await signInPin(email, p)
        await finish()
      }
    } catch (e: any) {
      setMsg(e.message === 'Invalid login credentials' ? (mode === 'password' ? 'E-mail ou mot de passe incorrect.' : 'PIN incorrect.') : e.message)
      setPinV('')
    }
    setBusy(false)
  }

  return (
    <div className="space-y-3">
      {askEmail ? (
        <input className="input" type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      ) : (
        <div className="text-center text-[12px] text-mute">{email} · <button className="text-accent" onClick={() => { setEmail(''); try { localStorage.removeItem('orbite.email') } catch {} }}>changer</button></div>
      )}
      {mode === 'password' ? (
        <input className="input" type="password" placeholder="Mot de passe" value={pw} onChange={(e) => setPw(e.target.value)} />
      ) : (
        <>
          <div className="text-center text-[13px] font-medium">{mode === 'create' ? 'Choisis ton PIN (6 chiffres)' : 'Entre ton PIN'}</div>
          <PinInput value={pin} onChange={setPinV} onDone={(v) => mode === 'pin' && !askEmail && run(v)} autoFocus={!askEmail} />
        </>
      )}
      <button className="btn-primary w-full" disabled={busy} onClick={() => run()}>
        {busy ? '…' : mode === 'create' ? 'Créer mon compte' : 'Se connecter'}
      </button>
      {msg && <div className="text-center text-xs text-[#ff8a8a]">{msg}</div>}
      <div className="flex justify-center gap-4 text-[11.5px] text-mute">
        {mode !== 'pin' && <button onClick={() => { setMode('pin'); setMsg(null) }}>Avec mon PIN</button>}
        {allowCreate && mode !== 'create' && <button onClick={() => { setMode('create'); setMsg(null) }}>Créer un compte</button>}
        {mode !== 'password' && <button onClick={() => { setMode('password'); setMsg(null) }}>Ancien mot de passe</button>}
      </div>
    </div>
  )
}
