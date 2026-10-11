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
  const isToday = (iso) => { if (!iso) return false; const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === t }
  const doneToday = tasks.filter((x) => x.done && isToday(x.doneAt)).length
  const total = today.length + doneToday
  return { top, today, overdue, doneToday, total, progress: total ? doneToday / total : 0, prios: settings.priorities || [] }
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

// Fond : ciel étoilé + faisceau blanc lumineux qui fait le tour des bords.
// iOS n'anime pas les widgets : la comète avance à chaque rafraîchissement.
function addStars(w, family) {
  const dims = { small: [170, 170], medium: [364, 170], large: [364, 382] }[family] || [364, 170]
  const S = 3 // résolution
  const W = dims[0] * S, H = dims[1] * S
  const ctx = new DrawContext()
  ctx.size = new Size(W, H)
  ctx.opaque = true
  ctx.respectScreenScale = false
  // ciel qui suit l'heure : aube dorée, jour bleu profond, crépuscule violet, nuit noire
  const hr = new Date().getHours() + new Date().getMinutes() / 60
  const SKIES = {
    dawn: { top: [24, 18, 46], bottom: [70, 40, 52], glow: '#ffb46b', ga: 0.22, stars: 0.5 },
    day: { top: [8, 20, 44], bottom: [16, 38, 78], glow: '#6fb7ff', ga: 0.16, stars: 0.35 },
    dusk: { top: [20, 12, 40], bottom: [74, 30, 70], glow: '#ff7aa8', ga: 0.2, stars: 0.6 },
    night: { top: [4, 5, 10], bottom: [10, 12, 26], glow: '#7f8cff', ga: 0.12, stars: 1 }
  }
  const sky = hr >= 5 && hr < 8 ? SKIES.dawn : hr >= 8 && hr < 17 ? SKIES.day : hr >= 17 && hr < 20.5 ? SKIES.dusk : SKIES.night
  const bands = 80
  for (let i = 0; i < bands; i++) {
    const k = i / (bands - 1)
    const c = sky.top.map((v, j) => Math.round(v + (sky.bottom[j] - v) * k))
    ctx.setFillColor(new Color('#' + c.map((v) => v.toString(16).padStart(2, '0')).join('')))
    ctx.fillRect(new Rect(0, Math.floor((H * i) / bands), W, Math.ceil(H / bands) + 1))
  }
  // nébuleuse douce (dégradé radial simulé)
  const gx = W * (0.15 + ((hr % 24) / 24) * 0.7), gy = H * 0.95
  for (let r = Math.max(W, H) * 0.7; r > 10; r -= Math.max(W, H) * 0.035) {
    ctx.setFillColor(new Color(sky.glow, sky.ga * 0.09))
    ctx.fillEllipse(new Rect(gx - r, gy - r * 0.6, 2 * r, 1.2 * r))
  }

  // étoiles
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
  const n = Math.round((W * H) / (S * S * 900))
  for (let i = 0; i < n; i++) {
    const r = (rnd() < 0.9 ? 0.8 : 1.5) * S
    ctx.setFillColor(new Color('#dfe5ff', (0.12 + rnd() * 0.5) * sky.stars))
    ctx.fillEllipse(new Rect(rnd() * W, rnd() * H, r, r))
  }

  // contour du widget (rectangle arrondi), paramétré de 0 à 1
  const inset = 2.2 * S, R = (family === 'small' ? 20 : 22) * S
  const x0 = inset, y0 = inset, x1 = W - inset, y1 = H - inset
  const sw = x1 - x0 - 2 * R, sh = y1 - y0 - 2 * R, arc = (Math.PI * R) / 2
  const L = 2 * sw + 2 * sh + 4 * arc
  const at = (t) => {
    let d = ((t % 1) + 1) % 1 * L
    const seg = [
      [sw, (u) => [x0 + R + u, y0]],
      [arc, (u) => { const a = -Math.PI / 2 + u / R; return [x1 - R + R * Math.cos(a), y0 + R + R * Math.sin(a)] }],
      [sh, (u) => [x1, y0 + R + u]],
      [arc, (u) => { const a = u / R; return [x1 - R + R * Math.cos(a), y1 - R + R * Math.sin(a)] }],
      [sw, (u) => [x1 - R - u, y1]],
      [arc, (u) => { const a = Math.PI / 2 + u / R; return [x0 + R + R * Math.cos(a), y1 - R + R * Math.sin(a)] }],
      [sh, (u) => [x0, y1 - R - u]],
      [arc, (u) => { const a = Math.PI + u / R; return [x0 + R + R * Math.cos(a), y0 + R + R * Math.sin(a)] }]
    ]
    for (const [len, f] of seg) { if (d <= len) return f(d); d -= len }
    return [x0 + R, y0]
  }
  const dot = (x, y, r, color, alpha) => { ctx.setFillColor(new Color(color, alpha)); ctx.fillEllipse(new Rect(x - r, y - r, 2 * r, 2 * r)) }

  // fin liseré permanent
  for (let i = 0; i < 900; i++) { const [x, y] = at(i / 900); dot(x, y, 0.55 * S, '#c9d3ff', 0.16) }

  // position de la comète : avance avec l'heure (un tour ≈ toutes les 2 h)
  const now = new Date()
  const head = ((now.getHours() * 60 + now.getMinutes()) % 120) / 120
  const trail = 0.34
  const steps = 420
  for (let i = steps; i >= 0; i--) {
    const k = i / steps // 0 = tête, 1 = bout de la traîne
    const [x, y] = at(head - k * trail)
    const f = Math.pow(1 - k, 1.6)
    dot(x, y, (5.5 * f + 1.2) * S, '#9fb0ff', 0.035 * f) // halo bleuté large
    dot(x, y, (2.4 * f + 0.6) * S, '#ffffff', 0.10 * f) // lueur
    dot(x, y, (0.9 * f + 0.45) * S, '#ffffff', 0.25 + 0.75 * f) // trait
  }
  // seconde comète plus discrète à l'opposé
  for (let i = 140; i >= 0; i--) {
    const k = i / 140, [x, y] = at(head + 0.5 - k * 0.12), f = Math.pow(1 - k, 2)
    dot(x, y, (2 * f + 0.4) * S, '#ffffff', 0.08 * f)
    dot(x, y, (0.6 * f + 0.3) * S, '#ffffff', 0.15 + 0.4 * f)
  }
  // tête : étoile à 4 branches
  const [hx, hy] = at(head)
  for (let r = 14; r > 0; r -= 1.5) dot(hx, hy, r * S, '#ffffff', 0.05)
  dot(hx, hy, 2.6 * S, '#ffffff', 1)
  ctx.setStrokeColor(new Color('#ffffff', 0.85)); ctx.setLineWidth(0.9 * S)
  const flare = (dx, dy, len) => { const p = new Path(); p.move(new Point(hx - dx * len, hy - dy * len)); p.addLine(new Point(hx + dx * len, hy + dy * len)); ctx.addPath(p); ctx.strokePath() }
  flare(1, 0, 13 * S); flare(0, 1, 13 * S)
  ctx.setStrokeColor(new Color('#ffffff', 0.35)); flare(0.7, 0.7, 6 * S); flare(0.7, -0.7, 6 * S)

  w.backgroundImage = ctx.getImage()
}
// Anneau de progression du jour. Rouge avec halo s'il y a du retard.
function ringImage(progress, label, size, alert, plain) {
  const S = 3, D = size * S
  const ctx = new DrawContext()
  ctx.size = new Size(D, D); ctx.opaque = false; ctx.respectScreenScale = false
  const c = D / 2, r = D * 0.36, lw = D * 0.085
  const color = alert ? '#ff6b6b' : progress >= 1 ? '#6fe0b8' : '#8ea2ff'
  const dotAt = (a, rad, col, al) => { ctx.setFillColor(new Color(col, al)); ctx.fillEllipse(new Rect(c + r * Math.cos(a) - rad, c + r * Math.sin(a) - rad, 2 * rad, 2 * rad)) }
  // halo
  if (!plain) for (let i = 0; i < 6; i++) { ctx.setStrokeColor(new Color(color, alert ? 0.07 : 0.045)); ctx.setLineWidth(lw + i * D * 0.035); const p = new Path(); p.addEllipse(new Rect(c - r, c - r, 2 * r, 2 * r)); ctx.addPath(p); ctx.strokePath() }
  // piste
  ctx.setStrokeColor(new Color(plain ? '#ffffff' : '#ffffff', plain ? 0.3 : 0.12)); ctx.setLineWidth(lw)
  const track = new Path(); track.addEllipse(new Rect(c - r, c - r, 2 * r, 2 * r)); ctx.addPath(track); ctx.strokePath()
  // arc (points serrés = trait arrondi)
  const steps = 240, end = Math.max(0.0001, Math.min(1, progress))
  for (let i = 0; i <= steps * end; i++) dotAt(-Math.PI / 2 + (i / steps) * 2 * Math.PI, lw / 2, plain ? '#ffffff' : color, 1)
  if (progress > 0 && !plain) dotAt(-Math.PI / 2 + end * 2 * Math.PI, lw * 0.9, '#ffffff', 0.9)
  // texte au centre
  ctx.setTextAlignedCenter(); ctx.setFont(Font.boldRoundedSystemFont(D * 0.26)); ctx.setTextColor(plain ? Color.white() : new Color('#e8ecff'))
  ctx.drawTextInRect(label, new Rect(0, c - D * 0.17, D, D * 0.34))
  return ctx.getImage()
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
function errorWidget(w, e) {
  w.url = APP_URL + '/#widget'
  txt(w, 'Orbite', { font: Font.boldSystemFont(15) })
  w.addSpacer(6)
  txt(w, 'Touche ici → Réglages → « Connecter le widget ».', { color: C.mute, font: Font.systemFont(12), lines: 3 })
  if (e) { w.addSpacer(4); txt(w, String(e.message || e), { color: C.warn, font: Font.systemFont(9), lines: 2 }) }
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
    const h = w.addStack(); h.centerAlignContent()
    txt(h, 'PRIORITÉS', { font: Font.semiboldSystemFont(10), color: C.mute }); h.addSpacer()
    const im = h.addImage(ringImage(d.progress, `${d.doneToday}/${d.total}`, 34, d.overdue.length > 0)); im.imageSize = new Size(34, 34)
    w.addSpacer(6)
    list.slice(0, 3).forEach((t, i) => prioRow(w, t, i, 12))
    if (!list.length) txt(w, 'Rien de prévu.', { color: C.mute, font: Font.systemFont(12) })
    return
  }
  if (family === 'medium') {
    // haut : priorités sur toute la largeur — bas : 2 cartes Inbox | Note
    const head = w.addStack(); head.centerAlignContent()
    const top = head.addStack(); top.layoutVertically()
    txt(top, 'PRIORITÉS', { font: Font.semiboldSystemFont(10), color: C.mute })
    top.addSpacer(4)
    list.slice(0, 2).forEach((t, i) => prioRow(top, t, i, 14))
    if (!list.length) txt(top, 'Rien de prévu.', { color: C.mute, font: Font.systemFont(13) })
    head.addSpacer()
    const ringBox = head.addStack(); ringBox.layoutVertically(); ringBox.centerAlignContent()
    const img = ringBox.addImage(ringImage(d.progress, `${d.doneToday}/${d.total}`, 54, d.overdue.length > 0))
    img.imageSize = new Size(54, 54)
    if (d.overdue.length) { const o = ringBox.addText(`${d.overdue.length} en retard`); o.font = Font.mediumSystemFont(9); o.textColor = C.warn; o.centerAlignText() }
    w.addSpacer()
    const row = w.addStack()
    const card = (title, body, color, url) => {
      const c = row.addStack(); c.layoutVertically()
      c.backgroundColor = new Color('#ffffff', 0.06); c.cornerRadius = 12; c.setPadding(7, 9, 7, 9)
      c.size = new Size(0, 52)
      if (url) c.url = url
      const h = c.addStack(); h.addSpacer(0)
      txt(h, title, { font: Font.semiboldSystemFont(10), color })
      h.addSpacer()
      c.addSpacer(2)
      txt(c, body, { font: Font.mediumSystemFont(13), lines: 1 })
      return c
    }
    card(`INBOX · ${inbox.length}`, inbox[0] ? inbox[0].title : '＋ Capturer', inbox.length ? C.gold : C.accent, `scriptable:///run/${encodeURIComponent(SCRIPT_NAME)}?mode=capture`)
    row.addSpacer(8)
    card(`NOTES · ${notes.length}`, notes[0] ? (notes[0].title || 'Sans titre') : 'Aucune note', C.mute, APP_URL + '/#notes')
    return
  }
  // large : 3 sections
  const lh = w.addStack(); lh.centerAlignContent()
  const lt = lh.addStack(); lt.layoutVertically()
  txt(lt, 'MES 3 PRIORITÉS', { font: Font.semiboldSystemFont(10), color: C.mute })
  txt(lt, d.overdue.length ? `${d.overdue.length} en retard` : `${d.today.length} restante${d.today.length > 1 ? 's' : ''} aujourd’hui`, { font: Font.mediumSystemFont(11), color: d.overdue.length ? C.warn : C.mute })
  lh.addSpacer()
  const li = lh.addImage(ringImage(d.progress, `${d.doneToday}/${d.total}`, 50, d.overdue.length > 0)); li.imageSize = new Size(50, 50)
  w.addSpacer(6)
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

// Connexion envoyée par la webapp (Réglages → Connecter le widget)
if (mode === 'setup' && args.queryParameters.email && args.queryParameters.k) {
  Keychain.set(KC_EMAIL, args.queryParameters.email)
  Keychain.set(KC_PASS, args.queryParameters.k)
  try {
    await login()
    const a = new Alert(); a.title = 'Widget connecté ✓'; a.message = 'Tu peux revenir à l’écran d’accueil.'; a.addAction('OK'); await a.present()
  } catch (e) {
    const a = new Alert(); a.title = 'Connexion refusée'; a.message = String(e.message || e); a.addAction('OK'); await a.present()
  }
  Script.complete()
} else {

if (config.runsInApp && (!Keychain.contains(KC_EMAIL) || !Keychain.contains(KC_PASS) || mode === 'login')) {
  await askCredentials()
}

if (mode === 'capture') {
  try { await capture() } catch (e) { const a = new Alert(); a.title = 'Erreur'; a.message = String(e.message || e); a.addAction('OK'); await a.present() }
  Script.complete()
} else {
  const w = new ListWidget()
  const fam = config.widgetFamily || 'medium'
  if (fam.startsWith('accessory')) {
    // ───── Écran verrouillé ─────
    w.url = APP_URL
    try {
      const d = await loadTasks()
      const first = (d.top.find((t) => !t.done) || d.today[0])
      if (fam === 'accessoryCircular') {
        w.addAccessoryWidgetBackground = true
        const im = w.addImage(ringImage(d.progress, `${d.today.length}`, 64, false, true)); im.imageSize = new Size(64, 64); im.centerAlignImage()
      } else if (fam === 'accessoryRectangular') {
        const h = w.addStack(); h.centerAlignContent()
        const im = h.addImage(ringImage(d.progress, '', 18, false, true)); im.imageSize = new Size(18, 18)
        h.addSpacer(4)
        const t = h.addText(`${d.doneToday}/${d.total} aujourd’hui${d.overdue.length ? ` · ${d.overdue.length}⚠︎` : ''}`); t.font = Font.semiboldSystemFont(12)
        w.addSpacer(2)
        const a = w.addText(first ? `01 ${first.title}` : 'Rien de prévu'); a.font = Font.boldSystemFont(14); a.lineLimit = 1
        const second = (d.top.length ? d.top : d.today).filter((x) => x !== first && !x.done)[0]
        if (second) { const b = w.addText(`02 ${second.title}`); b.font = Font.systemFont(12); b.lineLimit = 1; b.textOpacity = 0.75 }
      } else {
        const t = w.addText(`◉ ${d.doneToday}/${d.total}${first ? ' · ' + first.title : ''}`); t.font = Font.systemFont(12)
      }
    } catch (e) { const t = w.addText('Orbite · connexion'); t.font = Font.systemFont(11) }
    Script.setWidget(w)
    Script.complete()
  } else {
  addStars(w, config.widgetFamily || 'medium')
  w.setPadding(14, 15, 13, 15)
  w.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000)
  const family = config.widgetFamily || 'medium'
  try {
    if (mode.startsWith('note')) await notesWidget(w, family)
    else if (mode.startsWith('inbox')) await inboxWidget(w, family)
    else if (mode.startsWith('tache') || mode.startsWith('tâche')) await tasksWidget(w, family)
    else await allWidget(w, family)
  } catch (e) {
    errorWidget(w, e)
  }
  if (family !== 'medium') w.addSpacer()
  if (config.runsInWidget) Script.setWidget(w)
  else await w.presentMedium()
  Script.complete()
  }
}
}
