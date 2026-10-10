// ─────────────────────────────────────────────────────────────
// Widget iPhone Orbite — à coller dans l'app gratuite « Scriptable »
// Affiche : tes 3 priorités du jour + tâches du jour / en retard.
// Lit tes données depuis Supabase (même compte que l'app).
// 1er lancement DANS Scriptable : il te demande e-mail + mot de passe
// (stockés dans le trousseau iOS, jamais dans ce fichier).
// ─────────────────────────────────────────────────────────────

const SUPABASE_URL = 'https://ipduohsswlfkimfzramr.supabase.co'
const SUPABASE_KEY = 'sb_publishable_djFiZ7Q1jF6iAivXoDXDkw_x0wylLgW'
const APP_URL = 'https://orbite.vercel.app' // ← remplace par l'URL de ton app Vercel

const KC_EMAIL = 'orbite.email'
const KC_PASS = 'orbite.password'

async function askCredentials() {
  const a = new Alert()
  a.title = 'Connexion Orbite'
  a.message = 'Même e-mail et mot de passe que dans l’app (Réglages → Synchronisation).'
  a.addTextField('E-mail', Keychain.contains(KC_EMAIL) ? Keychain.get(KC_EMAIL) : '')
  a.addSecureTextField('Mot de passe', '')
  a.addAction('Enregistrer')
  a.addCancelAction('Annuler')
  if ((await a.present()) === -1) return false
  Keychain.set(KC_EMAIL, a.textFieldValue(0).trim())
  Keychain.set(KC_PASS, a.textFieldValue(1))
  return true
}

async function login() {
  const req = new Request(`${SUPABASE_URL}/auth/v1/token?grant_type=password`)
  req.method = 'POST'
  req.headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }
  req.body = JSON.stringify({ email: Keychain.get(KC_EMAIL), password: Keychain.get(KC_PASS) })
  const res = await req.loadJSON()
  if (!res.access_token) throw new Error(res.error_description || res.msg || 'Connexion refusée')
  return res.access_token
}

async function get(path, token) {
  const req = new Request(`${SUPABASE_URL}/rest/v1/${path}`)
  req.headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` }
  return await req.loadJSON()
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function loadData() {
  const token = await login()
  const rows = await get('lm_entities?select=doc&type=eq.task&deleted=eq.false', token)
  const kv = await get('lm_kv?select=doc&key=eq.settings', token)
  const tasks = rows.map((r) => r.doc).filter((t) => !t.archived)
  const settings = (kv[0] && kv[0].doc) || {}
  const t = todayStr()
  const open = tasks.filter((x) => !x.done)
  const byId = Object.fromEntries(tasks.map((x) => [x.id, x]))
  const topIds = settings.dailyTop && settings.dailyTop.date === t ? settings.dailyTop.ids : (settings.dailyTop?.ids || [])
  const top = topIds.map((id) => byId[id]).filter(Boolean)
  const today = open.filter((x) => x.date && x.date <= t).sort((a, b) => (b.priority || 0) - (a.priority || 0))
  const overdue = open.filter((x) => (x.date && x.date < t) || (x.postponed || 0) > 0)
  const prios = settings.priorities || []
  return { top, today, overdue, prios }
}

const C = { bg: new Color('#05060a'), ink: new Color('#e8ecff'), mute: new Color('#868da6'), accent: new Color('#8ea2ff'), done: new Color('#6fe0b8'), warn: new Color('#ff8a8a') }

function addStars(w) {
  // fond étoilé discret dessiné une fois
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

function line(stack, text, opts = {}) {
  const t = stack.addText(text)
  t.font = opts.font || Font.systemFont(13)
  t.textColor = opts.color || C.ink
  t.lineLimit = 1
  return t
}

async function build() {
  const w = new ListWidget()
  addStars(w)
  w.setPadding(14, 14, 12, 14)
  w.url = APP_URL
  const family = config.widgetFamily || 'medium'
  let data
  try {
    data = await loadData()
  } catch (e) {
    line(w, 'Orbite', { font: Font.boldSystemFont(15) })
    w.addSpacer(6)
    line(w, 'Ouvre Scriptable et lance le script pour te connecter.', { color: C.mute, font: Font.systemFont(11) })
    return w
  }
  const head = w.addStack()
  head.centerAlignContent()
  line(head, 'MES 3 PRIORITÉS', { font: Font.semiboldSystemFont(10), color: C.mute })
  head.addSpacer()
  if (data.overdue.length) line(head, `${data.overdue.length} en retard`, { font: Font.mediumSystemFont(10), color: C.warn })
  w.addSpacer(8)

  const list = data.top.length ? data.top : data.today.slice(0, 3)
  const max = family === 'small' ? 3 : family === 'large' ? 3 : 3
  if (!list.length) line(w, 'Rien de prévu. Choisis tes priorités.', { color: C.mute, font: Font.systemFont(12) })
  list.slice(0, max).forEach((t, i) => {
    const row = w.addStack()
    row.centerAlignContent()
    const p = data.prios.find((x) => x.level === t.priority)
    line(row, `0${i + 1}`, { font: Font.boldMonospacedSystemFont(family === 'small' ? 14 : 17), color: t.done ? C.done : p ? new Color(p.color) : C.accent })
    row.addSpacer(8)
    line(row, t.title, { font: Font.mediumSystemFont(family === 'small' ? 12 : 14), color: t.done ? C.mute : C.ink })
    w.addSpacer(family === 'small' ? 4 : 6)
  })

  if (family === 'large') {
    w.addSpacer(8)
    line(w, `AUJOURD’HUI · ${data.today.length}`, { font: Font.semiboldSystemFont(10), color: C.mute })
    w.addSpacer(4)
    data.today.filter((t) => !list.includes(t)).slice(0, 7).forEach((t) => {
      line(w, `○  ${t.title}`, { font: Font.systemFont(13) })
      w.addSpacer(3)
    })
  } else if (family === 'medium') {
    w.addSpacer()
    line(w, `${data.today.length} tâche${data.today.length > 1 ? 's' : ''} aujourd’hui`, { font: Font.systemFont(11), color: C.mute })
  }
  w.addSpacer()
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000)
  return w
}

if (config.runsInApp && (!Keychain.contains(KC_EMAIL) || !Keychain.contains(KC_PASS))) {
  await askCredentials()
} else if (config.runsInApp && args.queryParameters.reset) {
  await askCredentials()
}

const widget = await build()
if (config.runsInWidget) Script.setWidget(widget)
else await widget.presentMedium()
Script.complete()
