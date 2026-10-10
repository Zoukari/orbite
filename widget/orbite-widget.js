// ─────────────────────────────────────────────────────────────
// Widgets iPhone Orbite — app gratuite « Scriptable »
// Nomme ce script exactement : Orbite
//
// Un seul script. Dans les réglages du widget (appui long
// → Modifier le widget), champ « Parameter » :
//   (vide)  → TOUT : priorités + inbox + notes   (par défaut)
//   taches  → 3 priorités + tâches du jour
//   notes   → dernières notes
//   inbox   → Inbox + capture rapide (un tap = noter une idée)
//
// 1er lancement DANS Scriptable : e-mail + mot de passe Orbite
// (stockés dans le trousseau iOS, jamais dans ce fichier).
// ─────────────────────────────────────────────────────────────

const SUPABASE_URL = 'https://ipduohsswlfkimfzramr.supabase.co'
const SUPABASE_KEY = 'sb_publishable_djFiZ7Q1jF6iAivXoDXDkw_x0wylLgW'
const APP_URL = 'https://orbite-gray.vercel.app'
const SCRIPT_NAME = 'Orbite'

const KC_EMAIL = 'orbite.email'
const KC_PASS = 'orbite.password'

// ───────── Connexion / API ─────────
async function askCredentials() {
  const a = new Alert()
  a.title = 'Connexion Orbite'
  a.message = 'Ton e-mail et ton PIN Orbite (6 chiffres).'
  a.addTextField('E-mail', Keychain.contains(KC_EMAIL) ? Keychain.get(KC_EMAIL) : '')
  a.addSecureTextField('PIN', '')
  a.addAction('Enregistrer')
  a.addCancelAction('Annuler')
  if ((await a.present()) === -1) return false
  Keychain.set(KC_EMAIL, a.textFieldValue(0).trim())
  const pin = a.textFieldValue(1).trim()
  // un PIN à 6 chiffres est converti comme dans l'app ; sinon on garde le texte (ancien mot de passe)
  Keychain.set(KC_PASS, /^\d{6}$/.test(pin) ? `orbite-pin-${pin}` : pin)
  return true
}

let session = null
async function login() {
  if (session) return session
  const req = new Request(`${SUPABASE_URL}/auth/v1/token?grant_type=password`)
  req.method = 'POST'
  req.headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }
  req.body = JSON.stringify({ email: Keychain.get(KC_EMAIL), password: Keychain.get(KC_PASS) })
  const res = await req.loadJSON()
  if (!res.access_token) throw new Error(res.error_description || res.msg || 'Connexion refusée')
  session = { token: res.access_token, userId: res.user.id }
  return session
}

async function get(path) {
  const { token } = await login()
  const req = new Request(`${SUPABASE_URL}/rest/v1/${path}`)
  req.headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` }
  return await req.loadJSON()
}

async function insertEntity(doc) {
  const { token, userId } = await login()
  const req = new Request(`${SUPABASE_URL}/rest/v1/lm_entities`)
  req.method = 'POST'
  req.headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }
  req.body = JSON.stringify({ id: doc.id, user_id: userId, type: doc.type, title: doc.title, map_id: null, parent_id: null, deleted: false, updated_at: doc.updatedAt, doc })
  await req.load()
  if (req.response.statusCode >= 300) throw new Error('Envoi refusé (' + req.response.statusCode + ')')
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const plain = (md, n) => {
  if (!md) return ''
  const s = md.replace(/[#*_`>\[\]]/g, '').replace(/\(([^)]+)\)/g, '').replace(/\s+/g, ' ').trim()
  return s.length > n ? s.slice(0, n) + '…' : s
}

// ───────── Données ─────────
async function loadTasks() {
  const rows = await get('lm_entities?select=doc&type=eq.task&deleted=eq.false')
  const kv = await get('lm_kv?select=doc&key=eq.settings')
  const tasks = rows.map((r) => r.doc).filter((t) => !t.archived)
  const settings = (kv[0] && kv[0].doc) || {}
  const t = todayStr()
  const open = tasks.filter((x) => !x.done)
  const byId = Object.fromEntries(tasks.map((x) => [x.id, x]))
  const top = ((settings.dailyTop && settings.dailyTop.ids) || []).map((id) => byId[id]).filter(Boolean)
  const today = open.filter((x) => x.date && x.date <= t).sort((a, b) => (b.priority || 0) - (a.priority || 0))
  const overdue = open.filter((x) => (x.date && x.date < t) || (x.postponed || 0) > 0)
  return { top, today, overdue, prios: settings.priorities || [] }
}
async function loadNotes() {
  const rows = await get('lm_entities?select=doc&deleted=eq.false&type=in.(note,idea,text,checklist,document)&order=updated_at.desc&limit=20')
  return rows.map((r) => r.doc).filter((n) => !n.archived).sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite))
}
async function loadInbox() {
  const rows = await get('lm_entities?select=doc&deleted=eq.false&doc->>inbox=eq.true&order=updated_at.desc&limit=30')
  return rows.map((r) => r.doc).filter((e) => !e.done && !e.archived)
}

// ───────── Style ─────────
const C = { bg: new Color('#05060a'), ink: new Color('#e8ecff'), mute: new Color('#868da6'), accent: new Color('#8ea2ff'), done: new Color('#6fe0b8'), warn: new Color('#ff8a8a'), gold: new Color('#f2b45a') }
const TYPE_GLYPH = { note: '≡', idea: '✧', text: 'T', checklist: '☑', document: '▤', task: '○', project: '▣', objective: '◉' }

function addStars(w) {
  const ctx = new DrawContext()
  ctx.size = new Size(400, 400)
  ctx.opaque = true
  ctx.setFillColor(C.bg)
  ctx.fillRect(new Rect(0, 0, 400, 400))
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
  for (let i = 0; i < 70; i++) {
    const r = rnd() < 0.9 ? 0.8 : 1.4
    ctx.setFillColor(new Color('#dfe5ff', 0.15 + rnd() * 0.5))
    ctx.fillEllipse(new Rect(rnd() * 400, rnd() * 400, r, r))
  }
  w.backgroundImage = ctx.getImage()
}
function txt(stack, text, opts = {}) {
  const t = stack.addText(text)
  t.font = opts.font || Font.systemFont(13)
  t.textColor = opts.color || C.ink
  t.lineLimit = opts.lines || 1
  return t
}
function header(w, title, right, rightColor) {
  const h = w.addStack()
  h.centerAlignContent()
  txt(h, title, { font: Font.semiboldSystemFont(10), color: C.mute })
  h.addSpacer()
  if (right) txt(h, right, { font: Font.mediumSystemFont(10), color: rightColor || C.mute })
  w.addSpacer(8)
}
function errorWidget(w) {
  txt(w, 'Orbite', { font: Font.boldSystemFont(15) })
  w.addSpacer(6)
  txt(w, 'Ouvre Scriptable et lance le script pour te connecter.', { color: C.mute, font: Font.systemFont(11), lines: 3 })
}

// ───────── Widgets ─────────
async function tasksWidget(w, family) {
  w.url = APP_URL + '/#taches'
  const d = await loadTasks()
  header(w, 'MES 3 PRIORITÉS', d.overdue.length ? `${d.overdue.length} en retard` : '', C.warn)
  const list = d.top.length ? d.top : d.today.slice(0, 3)
  if (!list.length) txt(w, 'Rien de prévu. Choisis tes priorités.', { color: C.mute, font: Font.systemFont(12), lines: 2 })
  list.slice(0, 3).forEach((t, i) => {
    const row = w.addStack()
    row.centerAlignContent()
    const p = d.prios.find((x) => x.level === t.priority)
    txt(row, `0${i + 1}`, { font: Font.boldMonospacedSystemFont(family === 'small' ? 14 : 17), color: t.done ? C.done : p ? new Color(p.color) : C.accent })
    row.addSpacer(8)
    txt(row, t.title, { font: Font.mediumSystemFont(family === 'small' ? 12 : 14), color: t.done ? C.mute : C.ink })
    w.addSpacer(family === 'small' ? 4 : 6)
  })
  if (family === 'large') {
    w.addSpacer(8)
    txt(w, `AUJOURD’HUI · ${d.today.length}`, { font: Font.semiboldSystemFont(10), color: C.mute })
    w.addSpacer(4)
    d.today.filter((t) => !list.includes(t)).slice(0, 7).forEach((t) => { txt(w, `○  ${t.title}`); w.addSpacer(3) })
  } else if (family === 'medium') {
    w.addSpacer()
    txt(w, `${d.today.length} tâche${d.today.length > 1 ? 's' : ''} aujourd’hui`, { font: Font.systemFont(11), color: C.mute })
  }
}

async function notesWidget(w, family) {
  w.url = APP_URL + '/#notes'
  const notes = await loadNotes()
  header(w, 'NOTES', `${notes.length}`)
  if (!notes.length) { txt(w, 'Aucune note.', { color: C.mute, font: Font.systemFont(12) }); return }
  const max = family === 'small' ? 2 : family === 'large' ? 6 : 3
  const showBody = family !== 'small'
  notes.slice(0, max).forEach((n) => {
    const row = w.addStack()
    row.layoutVertically()
    const t = row.addStack()
    t.centerAlignContent()
    txt(t, (TYPE_GLYPH[n.type] || '≡') + ' ', { font: Font.systemFont(12), color: n.type === 'idea' ? C.gold : C.accent })
    txt(t, n.title || 'Sans titre', { font: Font.semiboldSystemFont(family === 'small' ? 12 : 13) })
    if (n.favorite) txt(t, ' ★', { font: Font.systemFont(10), color: C.gold })
    if (showBody) {
      const body = n.checklist && n.checklist.length
        ? n.checklist.slice(0, 2).map((c) => (c.done ? '☑ ' : '☐ ') + c.text).join('  ')
        : plain(n.description, family === 'large' ? 110 : 70)
      if (body) txt(row, body, { font: Font.systemFont(11), color: C.mute, lines: family === 'large' ? 2 : 1 })
    }
    w.addSpacer(family === 'small' ? 4 : 7)
  })
}

async function inboxWidget(w, family) {
  // un tap = capture rapide sans ouvrir l'app (Scriptable demande le texte)
  w.url = `scriptable:///run/${encodeURIComponent(SCRIPT_NAME)}?mode=capture`
  const items = await loadInbox()
  header(w, 'INBOX', items.length ? `${items.length} à trier` : 'vide', items.length ? C.gold : C.mute)
  const max = family === 'small' ? 3 : family === 'large' ? 9 : 4
  items.slice(0, max).forEach((e) => {
    txt(w, `${TYPE_GLYPH[e.type] || '•'}  ${e.title}`, { font: Font.systemFont(family === 'small' ? 12 : 13) })
    w.addSpacer(4)
  })
  if (!items.length) txt(w, 'Tout est rangé.', { color: C.mute, font: Font.systemFont(12) })
  w.addSpacer()
  const cta = w.addStack()
  cta.backgroundColor = new Color('#8ea2ff', 0.18)
  cta.cornerRadius = 10
  cta.setPadding(5, 10, 5, 10)
  txt(cta, '＋ Capturer une idée', { font: Font.semiboldSystemFont(12), color: C.accent })
}

async function allWidget(w, family) {
  w.url = APP_URL
  const [d, notes, inbox] = await Promise.all([loadTasks(), loadNotes(), loadInbox()])
  const list = d.top.length ? d.top : d.today.slice(0, 3)
  const prioRow = (stack, t, i, size) => {
    const row = stack.addStack()
    row.centerAlignContent()
    const p = d.prios.find((x) => x.level === t.priority)
    txt(row, `0${i + 1}`, { font: Font.boldMonospacedSystemFont(size + 2), color: t.done ? C.done : p ? new Color(p.color) : C.accent })
    row.addSpacer(6)
    txt(row, t.title, { font: Font.mediumSystemFont(size), color: t.done ? C.mute : C.ink })
    stack.addSpacer(4)
  }
  if (family === 'small') {
    header(w, 'PRIORITÉS', inbox.length ? `✉ ${inbox.length}` : '', C.gold)
    list.slice(0, 3).forEach((t, i) => prioRow(w, t, i, 12))
    if (!list.length) txt(w, 'Rien de prévu.', { color: C.mute, font: Font.systemFont(12) })
    return
  }
  if (family === 'medium') {
    const cols = w.addStack()
    cols.topAlignContent()
    const left = cols.addStack(); left.layoutVertically()
    cols.addSpacer(14)
    const right = cols.addStack(); right.layoutVertically(); right.size = new Size(128, 0)
    txt(left, 'PRIORITÉS', { font: Font.semiboldSystemFont(11), color: C.mute }); left.addSpacer(7)
    list.slice(0, 3).forEach((t, i) => prioRow(left, t, i, 16))
    if (!list.length) txt(left, 'Rien de prévu.', { color: C.mute, font: Font.systemFont(14) })
    // colonne droite : inbox + dernière note
    const ib = right.addStack(); ib.url = `scriptable:///run/${encodeURIComponent(SCRIPT_NAME)}?mode=capture`
    txt(ib, `INBOX · ${inbox.length}`, { font: Font.semiboldSystemFont(11), color: inbox.length ? C.gold : C.mute })
    right.addSpacer(4)
    inbox.slice(0, 2).forEach((e) => { txt(right, e.title, { font: Font.mediumSystemFont(14), lines: 2 }); right.addSpacer(3) })
    right.addSpacer(8)
    const nh = right.addStack(); nh.url = APP_URL + '/#notes'
    txt(nh, 'NOTE', { font: Font.semiboldSystemFont(11), color: C.mute }); right.addSpacer(4)
    if (notes[0]) txt(right, notes[0].title || 'Sans titre', { font: Font.mediumSystemFont(14), lines: 2 })
    w.addSpacer()
    txt(w, `${d.today.length} aujourd’hui${d.overdue.length ? ` · ${d.overdue.length} en retard` : ''}`, { font: Font.mediumSystemFont(13), color: d.overdue.length ? C.warn : C.mute })
    return
  }
  // large : 3 sections
  header(w, 'MES 3 PRIORITÉS', d.overdue.length ? `${d.overdue.length} en retard` : `${d.today.length} aujourd’hui`, d.overdue.length ? C.warn : C.mute)
  list.slice(0, 3).forEach((t, i) => prioRow(w, t, i, 14))
  if (!list.length) txt(w, 'Rien de prévu.', { color: C.mute, font: Font.systemFont(12) })
  w.addSpacer(8)
  const ih = w.addStack(); ih.centerAlignContent(); ih.url = `scriptable:///run/${encodeURIComponent(SCRIPT_NAME)}?mode=capture`
  txt(ih, `INBOX · ${inbox.length}`, { font: Font.semiboldSystemFont(10), color: inbox.length ? C.gold : C.mute }); ih.addSpacer()
  txt(ih, '＋ Capturer', { font: Font.semiboldSystemFont(11), color: C.accent })
  w.addSpacer(4)
  inbox.slice(0, 3).forEach((e) => { txt(w, `${TYPE_GLYPH[e.type] || '•'}  ${e.title}`, { font: Font.systemFont(12) }); w.addSpacer(2) })
  if (!inbox.length) txt(w, 'Tout est rangé.', { color: C.mute, font: Font.systemFont(12) })
  w.addSpacer(8)
  const nh = w.addStack(); nh.url = APP_URL + '/#notes'
  txt(nh, 'NOTES', { font: Font.semiboldSystemFont(10), color: C.mute })
  w.addSpacer(4)
  notes.slice(0, 3).forEach((n) => {
    const r = w.addStack(); r.url = APP_URL + '/#notes'
    txt(r, `${TYPE_GLYPH[n.type] || '≡'}  ${n.title || 'Sans titre'}`, { font: Font.systemFont(12) })
    w.addSpacer(2)
  })
}

// ───────── Capture (lancée depuis le widget Inbox) ─────────
async function capture() {
  const a = new Alert()
  a.title = 'Capture rapide'
  a.message = 'Direction l’Inbox d’Orbite.'
  a.addTextField('Appeler Jean-Pierre pour Shakpot…', '')
  a.addAction('Tâche')
  a.addAction('Idée')
  a.addAction('Note')
  a.addCancelAction('Annuler')
  const choice = await a.present()
  const title = a.textFieldValue(0).trim()
  if (choice === -1 || !title) return
  const type = ['task', 'idea', 'note'][choice]
  const now = new Date().toISOString()
  const doc = { id: UUID.string().toLowerCase(), type, title, inbox: true, status: type === 'task' ? 'todo' : undefined, createdAt: now, updatedAt: now, history: [{ at: now, action: 'created', detail: 'widget' }] }
  await insertEntity(doc)
  const n = new Notification()
  n.title = 'Ajouté à l’Inbox'
  n.body = title
  await n.schedule()
}

// ───────── Entrée ─────────
const mode = ((args.queryParameters && args.queryParameters.mode) || args.widgetParameter || 'tout').toString().trim().toLowerCase()

if (config.runsInApp && (!Keychain.contains(KC_EMAIL) || !Keychain.contains(KC_PASS) || mode === 'login')) {
  await askCredentials()
}

if (mode === 'capture') {
  try { await capture() } catch (e) { const a = new Alert(); a.title = 'Erreur'; a.message = String(e.message || e); a.addAction('OK'); await a.present() }
  Script.complete()
} else {
  const w = new ListWidget()
  addStars(w)
  w.setPadding(14, 15, 13, 15)
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000)
  const family = config.widgetFamily || 'medium'
  try {
    if (mode.startsWith('note')) await notesWidget(w, family)
    else if (mode.startsWith('inbox')) await inboxWidget(w, family)
    else if (mode.startsWith('tache') || mode.startsWith('tâche')) await tasksWidget(w, family)
    else await allWidget(w, family)
  } catch (e) {
    errorWidget(w)
  }
  if (family !== 'medium') w.addSpacer()
  if (config.runsInWidget) Script.setWidget(w)
  else await w.presentMedium()
  Script.complete()
}
