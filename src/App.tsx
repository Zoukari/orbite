import { lazy, Suspense, useEffect, useState } from 'react'
import { useData, useUI } from './lib/store'
import { initSync, useSync, signIn, syncNow } from './lib/sync'
import { TYPE_META } from './lib/meta'
import { Icon, Modal, useIsMobile } from './components/ui'
import { DetailPanel } from './components/DetailPanel'
import { ContextMenu } from './components/ContextMenu'
import { AddToModal } from './components/AddToModal'
import { CommandPalette } from './components/CommandPalette'
import { QuickCapture } from './components/QuickCapture'
import { RightPanel } from './components/RightPanel'
import { DropAsk, FocusOverlay, Onboarding, ShareDialog, Toast, useReminders } from './components/Overlays'
import { HomeView } from './views/HomeView'
import { TasksView, NotesView, InboxView, ProjectsView, ObjectivesView, FavoritesView, MapsView } from './views/ListViews'
import { SettingsView } from './views/SettingsView'
import type { EntityType, ViewId } from './lib/types'

const MapCanvas = lazy(() => import('./map/MapCanvas').then((m) => ({ default: m.MapCanvas })))
const ShareView = lazy(() => import('./views/ShareView').then((m) => ({ default: m.ShareView })))

export default function App() {
  const shareCode = location.hash.startsWith('#share=') ? location.hash.slice(7) : null
  if (shareCode) return <Suspense fallback={null}><ShareView code={shareCode} /></Suspense>
  return <Main />
}

function Main() {
  const ready = useData((s) => s.ready)
  const onboarded = useData((s) => s.settings.onboarded)
  const hasMap = useData((s) => Object.values(s.entities).some((e) => e.type === 'map'))
  useEffect(() => {
    useData.getState().init().then(() => {
      const s = useData.getState()
      document.documentElement.classList.toggle('dark', s.settings.theme !== 'light')
      // une map active valide
      if (!s.settings.activeMapId || !s.entities[s.settings.activeMapId]) {
        const m = Object.values(s.entities).find((e) => e.type === 'map')
        if (m) s.setSettings({ activeMapId: m.id })
      }
    })
    initSync()
    // liens profonds (widgets iPhone) : /#notes, /#inbox, /#taches, /#capture
    const deepLink = () => {
      const h = location.hash.replace('#', '')
      const views: Record<string, ViewId> = { notes: 'notes', inbox: 'inbox', taches: 'tasks', projets: 'tasks', map: 'map', accueil: 'home' }
      if (views[h]) useUI.getState().go(views[h])
      else if (h === 'capture') useUI.getState().set({ capture: { open: true } })
      else return
      history.replaceState(null, '', location.pathname)
    }
    deepLink()
    window.addEventListener('hashchange', deepLink)
    // report automatique au changement de jour (app restée ouverte)
    const t = setInterval(() => useData.getState().rollover(), 5 * 60_000)
    return () => clearInterval(t)
  }, [])
  useReminders()
  useShortcuts()

  if (!ready) return <div className="h-full bg-bg" />
  if (!onboarded && !hasMap) return <><Onboarding /><SyncLoginHint /></>
  return <Shell />
}

function useShortcuts() {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement).isContentEditable
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); useUI.getState().set({ palette: true }) }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '/') { e.preventDefault(); useUI.getState().set({ palette: true }) }
      if (e.key.toLowerCase() === 'n' && !useUI.getState().capture) { e.preventDefault(); useUI.getState().set({ capture: { open: true } }) }
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [])
}

const NAV: { id: ViewId; label: string; icon: string; drop?: string }[] = [
  { id: 'home', label: 'Accueil', icon: 'home' },
  { id: 'map', label: 'Map', icon: 'map' },
  { id: 'tasks', label: 'Projets', icon: 'folder', drop: 'tasks' },
  { id: 'notes', label: 'Notes', icon: 'notes', drop: 'notes' }
]
const MORE: { id: ViewId; label: string; icon: string }[] = [
  { id: 'favorites', label: 'Favoris', icon: 'star' },
  { id: 'maps', label: 'Toutes les maps', icon: 'map' },
  { id: 'inbox', label: 'Inbox', icon: 'inbox' }
]

function Shell() {
  const view = useUI((s) => s.view)
  const mobile = useIsMobile()
  const rightPanel = useData((s) => s.settings.rightPanel)
  const [create, setCreate] = useState(false)
  const [todaySheet, setTodaySheet] = useState(false)
  const todayCount = useData((s) => Object.values(s.entities).filter((e) => e.type === 'task' && !e.done && !e.archived && e.date && e.date <= new Date().toLocaleDateString('sv-SE')).length)

  return (
    <div className="flex h-full overflow-hidden">
      {!mobile && <Sidebar onCreate={() => setCreate(true)} />}
      <main className="relative min-w-0 flex-1">
        <Suspense fallback={<div className="h-full" />}>
          {view === 'map' && <MapCanvas />}
        </Suspense>
        {view === 'home' && <HomeView />}
        {view === 'maps' && <MapsView />}
        {view === 'tasks' && <TasksView />}
        {view === 'notes' && <NotesView />}
        {view === 'inbox' && <InboxView />}
        {view === 'projects' && <ProjectsView />}
        {view === 'objectives' && <ObjectivesView />}
        {view === 'favorites' && <FavoritesView />}
        {view === 'settings' && <SettingsView />}

        {mobile && view === 'map' && (
          <button className="glass absolute bottom-[88px] left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-line/60 px-4 py-2 text-[13px] font-medium shadow-lg" onClick={() => setTodaySheet(true)}>
            <Icon name="sun" className="h-4 w-4 text-[#f2b45a]" /> Aujourd’hui <span className="font-mono text-mute">{todayCount}</span>
          </button>
        )}
        {mobile && view !== 'map' && (
          <button className="glass fixed right-3 top-3 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-line/60 safe-t" onClick={() => useUI.getState().set({ palette: true })}><Icon name="search" /></button>
        )}
        {!mobile && (
          <button
            className="absolute bottom-5 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-ink text-bg shadow-xl transition hover:scale-105 active:scale-95"
            style={{ right: view === 'map' && rightPanel ? 20 : 20 }}
            onClick={() => useUI.getState().set({ capture: { open: true } })}
            title="Nouveau (N)"
          >
            <Icon name="plus" className="h-5 w-5" stroke={2} />
          </button>
        )}
      </main>
      {!mobile && view === 'map' && rightPanel && (
        <aside className="w-[340px] shrink-0 border-l border-line/60 bg-surface/70 backdrop-blur-xl">
          <RightPanel onClose={() => useData.getState().setSettings({ rightPanel: false })} />
        </aside>
      )}
      {mobile && <BottomNav onPlus={() => setCreate(true)} />}

      {todaySheet && (
        <Modal open onClose={() => setTodaySheet(false)} bare>
          <div className="h-[70vh]"><RightPanel onClose={() => setTodaySheet(false)} /></div>
        </Modal>
      )}
      <CreateMenu open={create} onClose={() => setCreate(false)} />
      <DetailPanel />
      <ContextMenu />
      <AddToModal />
      <CommandPalette />
      <QuickCapture />
      <DropAsk />
      <ShareDialog />
      <FocusOverlay />
      <Toast />
    </div>
  )
}

function Sidebar({ onCreate }: { onCreate: () => void }) {
  const view = useUI((s) => s.view)
  const inbox = useData((s) => Object.values(s.entities).filter((e) => e.inbox && !e.done && !e.archived).length)
  const theme = useData((s) => s.settings.theme)
  const sync = useSync((s) => s.status)
  const session = useSync((s) => s.session)
  const inMore = MORE.some((m) => m.id === view)
  const [more, setMore] = useState(() => { try { return localStorage.getItem('orbite.navMore') === '1' } catch { return false } })
  const toggleMore = () => { setMore(!more); try { localStorage.setItem('orbite.navMore', more ? '0' : '1') } catch {} }
  const item = (n: { id: ViewId; label: string; icon: string; drop?: string }, badge?: number) => (
    <button key={n.id} data-dropzone={n.drop} title={n.label} onClick={() => useUI.getState().go(n.id)} className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-[7px] text-[13.5px] transition ${view === n.id ? 'bg-ink/[0.07] font-medium text-ink' : 'text-ink/65 hover:bg-ink/[0.04] hover:text-ink'}`}>
      <Icon name={n.icon} className="h-[17px] w-[17px]" />
      {n.label}
      {!!badge && <span className="ml-auto rounded-full bg-accent/15 px-1.5 font-mono text-[10.5px] text-accent">{badge}</span>}
    </button>
  )
  return (
    <nav className="flex w-[200px] shrink-0 flex-col border-r border-line/60 bg-surface/50 px-2.5 pb-3 pt-5 backdrop-blur-xl">
      <div className="mb-5 flex items-center gap-2 px-2">
        <img src="/favicon.svg" alt="" className="h-6 w-6 rounded-md" />
        <span className="flex-1 font-display text-[16px] font-semibold tracking-tight">Orbite</span>
        <button className="icon-btn !h-8 !w-8" title="Rechercher (⌘K)" onClick={() => useUI.getState().set({ palette: true })}><Icon name="search" className="h-4 w-4" /></button>
        <button className="icon-btn !h-8 !w-8 text-accent" title="Capture rapide (N)" onClick={() => useUI.getState().set({ capture: { open: true } })}><Icon name="bolt" className="h-4 w-4" /></button>
      </div>
      <div className="space-y-0.5">
        {NAV.map((n) => item(n))}
        {inbox > 0 && !more && item(MORE[2], inbox)}
      </div>
      <button className={`mt-3 flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] ${inMore && !more ? 'text-accent' : 'text-mute'} hover:text-ink`} onClick={toggleMore}>
        <Icon name="chevron" className={`h-3 w-3 transition ${more ? 'rotate-90' : ''}`} /> Plus
      </button>
      {more && <div className="fade space-y-0.5">{MORE.map((m) => item(m, m.id === 'inbox' ? inbox : undefined))}</div>}
      <div className="mt-auto flex items-center gap-1 pt-3">
        <button onClick={() => useUI.getState().go('settings')} className={`flex flex-1 items-center gap-2.5 rounded-xl px-3 py-[7px] text-[13.5px] ${view === 'settings' ? 'bg-ink/[0.07] text-ink' : 'text-ink/65 hover:bg-ink/[0.04]'}`}>
          <Icon name="gear" className="h-[17px] w-[17px]" /> Réglages
          {session && <span title={`Cloud : ${sync}`} className={`ml-auto h-1.5 w-1.5 rounded-full ${sync === 'error' ? 'bg-[#ff7a7a]' : sync === 'syncing' ? 'bg-accent' : 'bg-[#6fe0b8]'}`} />}
        </button>
      </div>
    </nav>
  )
}

function BottomNav({ onPlus }: { onPlus: () => void }) {
  const view = useUI((s) => s.view)
  const items: { id: ViewId; label: string; icon: string }[] = [
    { id: 'home', label: 'Accueil', icon: 'home' },
    { id: 'map', label: 'Map', icon: 'map' },
    { id: 'tasks', label: 'Projets', icon: 'folder' },
    { id: 'notes', label: 'Notes', icon: 'notes' }
  ]
  const more = !['home', 'map', 'tasks', 'notes'].includes(view)
  return (
    <nav className="glass fixed inset-x-0 bottom-0 z-30 border-t border-line/60 safe-b">
      <div className="mx-auto flex max-w-md items-stretch justify-around px-2 pt-1.5">
        {items.map((i) => (
          <button key={i.id} onClick={() => useUI.getState().go(i.id)} className={`flex flex-1 flex-col items-center gap-0.5 py-1 text-[10.5px] ${view === i.id ? 'text-ink' : 'text-mute'}`}>
            <Icon name={i.icon} className="h-[22px] w-[22px]" stroke={view === i.id ? 1.9 : 1.6} />{i.label}
          </button>
        ))}
        <button onClick={onPlus} className="flex flex-1 flex-col items-center gap-0.5 py-1 text-[10.5px] text-mute">
          <span className={`flex h-[26px] w-[26px] items-center justify-center rounded-full ${more ? 'bg-accent text-bg' : 'bg-ink text-bg'}`}><Icon name="plus" className="h-4 w-4" stroke={2.2} /></span>
          Plus
        </button>
      </div>
    </nav>
  )
}

// Bouton global « + » : créer, capturer, et (sur mobile) accéder au reste
function CreateMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const mobile = useIsMobile()
  const ui = useUI.getState()
  const capture = (type?: EntityType, voice?: boolean) => { onClose(); ui.set({ capture: { open: true, type, voice } }) }
  const go = (v: ViewId) => { onClose(); ui.go(v) }
  const types: [EntityType, string][] = [['idea', 'Nouvelle idée'], ['task', 'Nouvelle tâche'], ['note', 'Nouvelle note'], ['project', 'Nouveau projet'], ['objective', 'Nouvel objectif']]
  return (
    <Modal open={open} onClose={onClose} bare>
      <div className="p-4">
        <div className="grid grid-cols-2 gap-2">
          <button className="flex items-center gap-2 rounded-2xl bg-accent/12 px-3 py-3 text-left text-sm font-medium text-accent" style={{ background: 'rgb(var(--accent) / .12)' }} onClick={() => capture()}><Icon name="bolt" className="h-4 w-4" />Capture rapide</button>
          <button className="flex items-center gap-2 rounded-2xl px-3 py-3 text-left text-sm font-medium" style={{ background: 'rgb(var(--ink) / .06)' }} onClick={() => capture(undefined, true)}><Icon name="mic" className="h-4 w-4" />Dicter</button>
        </div>

        {mobile && (
          <>
            <div className="my-3 h-px bg-line/60" />
            <div className="grid grid-cols-4 gap-1">
              {([['inbox', 'Inbox', 'inbox'], ['favorites', 'Favoris', 'star'], ['maps', 'Maps', 'map'], ['settings', 'Réglages', 'gear']] as const).map(([v, l, i]) => (
                <button key={v} className="flex flex-col items-center gap-1 rounded-xl py-2.5 text-[11.5px] text-ink/80 hover:bg-ink/5" onClick={() => go(v)}><Icon name={i} />{l}</button>
              ))}
            </div>
            <button className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm text-mute hover:bg-ink/5" onClick={() => { onClose(); ui.set({ palette: true }) }}><Icon name="search" className="h-4 w-4" />Rechercher / Command Center</button>
          </>
        )}
      </div>
    </Modal>
  )
}

// Sur un nouvel appareil : se connecter récupère tout depuis le cloud
function SyncLoginHint() {
  const [open, setOpen] = useState(false)
  if (!(import.meta.env.VITE_SUPABASE_URL)) return null
  return (
    <>
      <button className="fixed bottom-6 left-1/2 -translate-x-1/2 text-xs text-mute underline-offset-4 hover:text-ink hover:underline safe-b" onClick={() => setOpen(true)}>Déjà un compte ? Récupérer mes données</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Récupérer mes données">
        <LoginInline onDone={() => setOpen(false)} />
      </Modal>
    </>
  )
}

function LoginInline({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState<string | null>(null)
  return (
    <form className="space-y-2 px-5 pb-5" onSubmit={async (e) => {
      e.preventDefault()
      setErr(null)
      try {
        await signIn(email, pw)
        await syncNow()
        const s = useData.getState()
        const m = Object.values(s.entities).find((x) => x.type === 'map')
        s.setSettings({ onboarded: true, activeMapId: s.settings.activeMapId || m?.id })
        onDone()
      } catch (er: any) { setErr(er.message) }
    }}>
      <input className="input" type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input className="input" type="password" placeholder="Mot de passe" value={pw} onChange={(e) => setPw(e.target.value)} />
      {err && <div className="text-xs text-[#ff7a7a]">{err}</div>}
      <button className="btn-primary w-full">Se connecter et synchroniser</button>
    </form>
  )
}
