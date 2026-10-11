import { useRef, useState, type ReactNode } from 'react'
import { useData, useUI, uid } from '../lib/store'
import { exportAll, exportTasksCsv, importBackup } from '../lib/backup'
import { removeDemo } from '../lib/demo'
import { fmtRelative } from '../lib/dates'
import { DEFAULT_PRIORITIES, DEFAULT_STATUSES, PALETTE } from '../lib/meta'
import { supabase, useSync, signOut, syncNow, setPin, signInPin, pinPassword } from '../lib/sync'
import { PinLogin, PinInput } from '../components/PinLogin'
import { Page } from './ListViews'
import { Segmented, Toggle, Icon, Info } from '../components/ui'

export function SettingsView() {
  const s = useData((st) => st.settings)
  const set = useData.getState().setSettings
  const fileRef = useRef<HTMLInputElement>(null)
  const shareRef = useRef<HTMLInputElement>(null)
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge')
  const hasDemo = useData((st) => Object.values(st.entities).some((e) => (e.meta as any)?.demo))

  return (
    <Page title="Réglages">
      <div className="space-y-5">
        <Card title="Profil">
          <Row label="Ton prénom"><input className="input !w-44" placeholder="Zoukari" value={s.userName || ''} onChange={(e) => set({ userName: e.target.value })} /></Row>
          <Row label="Reclasser mes éléments" hint="Projet → Sous-projet → Vision → Objectif → Jalon → Tâche. L’assistant te pose une question par élément."><button className="btn-soft text-xs" onClick={() => useUI.getState().set({ reclass: true })}>Lancer</button></Row>
        </Card>

        <Card title="Sauvegarde" sub={<>Dernière sauvegarde : <b className={!s.lastBackupAt ? 'text-[#f2b45a]' : 'text-ink'}>{fmtRelative(s.lastBackupAt)}</b></>}>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary text-xs" onClick={exportAll}><Icon name="share" className="h-4 w-4" />Exporter toutes mes données (JSON)</button>
            <button className="btn-soft text-xs" onClick={exportTasksCsv}>Tâches en CSV</button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Segmented value={importMode} onChange={setImportMode} options={[{ value: 'merge', label: 'Fusionner' }, { value: 'replace', label: 'Remplacer tout' }]} />
            <button className="btn-soft text-xs" onClick={() => fileRef.current?.click()}>Importer une sauvegarde…</button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              if (importMode === 'replace' && !confirm('Remplacer TOUTES tes données par cette sauvegarde ?')) return
              try { const n = await importBackup(f, importMode); useUI.getState().notify(`${n} éléments importés`) } catch (err: any) { alert('Import impossible : ' + err.message) }
            }} />
          </div>
        </Card>

        <CloudCard />

        <div id="widget-card"><Card title="Widget iPhone" info="Installe l’app Scriptable, crée un script nommé « Orbite » avec le code du widget, puis touche le bouton ci-dessous depuis l’iPhone.">
          <ConnectWidget />
        </Card></div>

        <Card title="Apparence">
          <Row label="Animations flottantes" hint="Coupées automatiquement au-delà de 140 éléments visibles"><Toggle on={s.animations} onChange={(v) => set({ animations: v })} /></Row>
          <Row label="Phrases du jour"><Toggle on={s.showQuotes} onChange={(v) => set({ showQuotes: v })} /></Row>
          {s.hiddenQuotes.length > 0 && <Row label={`${s.hiddenQuotes.length} phrase(s) masquée(s)`}><button className="btn-ghost text-xs" onClick={() => set({ hiddenQuotes: [] })}>Réafficher</button></Row>}
        </Card>

        <Card title="Niveaux de priorité" info="Du plus commun au plus critique. Renomme-les et change leurs couleurs comme tu veux.">
          <div className="space-y-2">
            {s.priorities.map((p, i) => (
              <div key={p.level} className="flex items-center gap-2">
                <span className="w-5 text-center font-mono text-xs text-mute">{p.level}</span>
                <input className="input !w-12 text-center" value={p.glyph} onChange={(e) => set({ priorities: s.priorities.map((x, j) => (j === i ? { ...x, glyph: e.target.value.slice(0, 2) } : x)) })} />
                <input className="input" value={p.label} onChange={(e) => set({ priorities: s.priorities.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} style={{ color: p.color }} />
                <input type="color" className="h-9 w-10 shrink-0 cursor-pointer rounded-lg border border-line bg-transparent" value={p.color} onChange={(e) => set({ priorities: s.priorities.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)) })} />
              </div>
            ))}
            <button className="btn-ghost text-xs" onClick={() => set({ priorities: DEFAULT_PRIORITIES })}>Réinitialiser</button>
          </div>
        </Card>

        <Card title="Statuts" info="Ajoute tes propres états (ex. « Prototype », « Négociation »). Coche « terminé » pour qu’un statut compte comme fini.">
          <div className="space-y-2">
            {s.statuses.map((st, i) => (
              <div key={st.id} className="flex items-center gap-2">
                <input type="color" className="h-9 w-10 shrink-0 cursor-pointer rounded-lg border border-line bg-transparent" value={st.color} onChange={(e) => set({ statuses: s.statuses.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)) })} />
                <input className="input" value={st.label} onChange={(e) => set({ statuses: s.statuses.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                <label className="flex shrink-0 items-center gap-1 text-[11px] text-mute"><input type="checkbox" checked={!!st.done} onChange={(e) => set({ statuses: s.statuses.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)) })} />terminé</label>
                {!DEFAULT_STATUSES.some((d) => d.id === st.id) && <button className="icon-btn" onClick={() => set({ statuses: s.statuses.filter((x) => x.id !== st.id) })}><Icon name="trash" className="h-4 w-4" /></button>}
              </div>
            ))}
            <button className="btn-soft text-xs" onClick={() => set({ statuses: [...s.statuses, { id: uid().slice(0, 8), label: 'Nouveau statut', color: PALETTE[s.statuses.length % PALETTE.length] }] })}><Icon name="plus" className="h-4 w-4" />Ajouter un statut</button>
          </div>
        </Card>

        <Card title="Données">
          {hasDemo && <Row label="Données de démonstration"><button className="btn-soft text-xs" onClick={() => { if (confirm('Supprimer tous les éléments de démonstration ?')) { const n = removeDemo(); useUI.getState().notify(`${n} éléments supprimés`) } }}>Supprimer la démo</button></Row>}
          <Row label="Ouvrir un partage reçu (.json)"><button className="btn-soft text-xs" onClick={() => shareRef.current?.click()}>Ouvrir…</button></Row>
          <input ref={shareRef} type="file" accept=".json" hidden onChange={async (e) => {
            const f = e.target.files?.[0]
            if (!f) return
            sessionStorage.setItem('orbite.shareFile', await f.text())
            location.hash = 'share=file'
            location.reload()
          }} />
          <Row label="Tout effacer" hint="Supprime toutes les données (sur cet appareil et dans le cloud)"><button className="btn text-xs text-[#ff7a7a] hover:bg-[#ff7a7a]/10" onClick={async () => { if (confirm('Effacer TOUTES tes données ? Exporte une sauvegarde avant.') && confirm('Vraiment ? Cette action est irréversible.')) { await useData.getState().wipe(); useData.getState().setSettings({ onboarded: false }) } }}>Tout effacer</button></Row>
        </Card>

        <Card title="Installer l’app" info={<>iPhone : Safari → Partager → « Sur l’écran d’accueil ». Chrome : menu → « Installer ». Fonctionne hors ligne.<br /><br />Raccourcis : ⌘K recherche · N capture · Tab enfant · Entrée frère · F2 renommer · Espace ouvrir · Suppr supprimer.</>}>
          <span className="text-sm text-mute">Version du {__BUILD__} (UTC)</span>
        </Card>
      </div>
    </Page>
  )
}

function CloudCard() {
  const { session, status, error } = useSync()
  const lastSync = useData((s) => s.settings.lastSyncAt)
  if (!supabase)
    return (
      <Card title="Synchronisation cloud" sub="Désactivée">
        <p className="text-sm text-mute">Ajoute <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code> dans Vercel puis redéploie. Les données restent en local en attendant.</p>
      </Card>
    )
  if (session)
    return (
      <Card title="Synchronisation cloud" sub={<>Connecté : <b className="text-ink">{session.user.email}</b></>}>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className={`inline-flex items-center gap-1.5 ${status === 'error' ? 'text-[#ff7a7a]' : status === 'syncing' ? 'text-accent' : 'text-[#6fe0b8]'}`}>
            <span className="h-2 w-2 rounded-full bg-current" />{{ idle: 'À jour', syncing: 'Synchronisation…', error: 'Erreur', offline: 'Hors ligne', off: 'Off' }[status]}
          </span>
          <span className="text-xs text-mute">Dernière synchro : {fmtRelative(lastSync)}</span>
          <div className="flex-1" />
          <button className="btn-soft text-xs" onClick={() => syncNow()}>Synchroniser</button>
          <button className="btn-ghost text-xs" onClick={() => signOut()}>Déconnexion</button>
          <ChangePin />
        </div>
        {error && <div className="mt-2 rounded-xl bg-[#ff7a7a]/10 px-3 py-2 text-xs text-[#ff7a7a]">{error}{/relation .* does not exist|lm_/.test(error) ? ' — as-tu bien exécuté le SQL dans Supabase ?' : ''}</div>}
      </Card>
    )
  return (
    <Card title="Synchronisation cloud" info="Sauvegarde automatique et mêmes données sur iPhone et ordinateur. Accès réservé à ton compte.">
      <div className="mx-auto max-w-xs"><PinLogin /></div>
    </Card>
  )
}

// Connecte le widget Scriptable en un tap : vérifie le PIN puis ouvre Scriptable avec les identifiants
function ConnectWidget() {
  const { session } = useSync()
  const [pin, setP] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!session) return <p className="text-sm text-mute">Connecte-toi d’abord à la synchronisation (ci-dessus).</p>
  const email = session.user.email || ''
  const go = async (p: string) => {
    setBusy(true); setMsg(null)
    try {
      await signInPin(email, p) // vérifie que le PIN est le bon
      const url = `scriptable:///run/Orbite?mode=setup&email=${encodeURIComponent(email)}&k=${encodeURIComponent(pinPassword(p))}`
      setP('')
      location.href = url
      setMsg('Scriptable va s’ouvrir. Si rien ne se passe, vérifie que le script s’appelle exactement « Orbite ».')
    } catch (e: any) {
      setMsg(e.message === 'Invalid login credentials' ? 'PIN incorrect. Si tu n’as pas encore de PIN, utilise « Définir mon PIN » ci-dessus.' : e.message)
      setP('')
    }
    setBusy(false)
  }
  return (
    <div className="mx-auto max-w-xs space-y-3">
      <div className="text-center text-[13px] font-medium">Entre ton PIN pour connecter le widget</div>
      <PinInput value={pin} onChange={setP} onDone={go} />
      <button className="btn-primary w-full" disabled={busy || pin.length !== 6} onClick={() => go(pin)}>{busy ? '…' : 'Connecter le widget'}</button>
      {msg && <div className="text-center text-xs text-mute">{msg}</div>}
    </div>
  )
}

function ChangePin() {
  const [pin, setP] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  if (!open) return <button className="btn-soft text-xs" onClick={() => setOpen(true)}>Définir mon PIN</button>
  return (
    <div className="mt-3 w-full space-y-2 rounded-2xl border border-line/60 p-3">
      <div className="text-center text-[13px] font-medium">Nouveau PIN (6 chiffres)</div>
      <PinInput value={pin} onChange={setP} autoFocus />
      <button className="btn-primary w-full" disabled={pin.length !== 6} onClick={async () => { try { await setPin(pin); setMsg('PIN enregistré. Utilise-le pour te connecter (et dans le widget).'); setP('') } catch (e: any) { setMsg(e.message) } }}>Enregistrer</button>
      {msg && <div className="text-center text-xs text-mute">{msg}</div>}
    </div>
  )
}

function Card({ title, sub, info, children }: { title: string; sub?: ReactNode; info?: ReactNode; children: ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold">{title}{info && <Info text={info} />}</h2>
      {sub && <div className="mb-3 mt-0.5 text-[13px] text-mute">{sub}</div>}
      <div className={sub ? '' : 'mt-3'}>{children}</div>
    </section>
  )
}
function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line/50 py-3 last:border-0">
      <div className="flex items-center gap-2 text-sm">{label}{hint && <Info text={hint} />}</div>
      {children}
    </div>
  )
}
