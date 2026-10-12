// Position du soleil et de la lune — calculs astronomiques simplifiés (précision ~1°, largement suffisant).
const RAD = Math.PI / 180

export function sunPosition(date: Date, lat: number, lng: number) {
  const d = date.getTime() / 86400000 + 2440587.5 - 2451545.0
  const g = (357.529 + 0.98560028 * d) * RAD
  const q = 280.459 + 0.98564736 * d
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD
  const e = (23.439 - 0.00000036 * d) * RAD
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L))
  const dec = Math.asin(Math.sin(e) * Math.sin(L))
  const gmst = (((18.697374558 + 24.06570982441908 * d) % 24) + 24) % 24
  let H = (gmst * 15 + lng) * RAD - ra
  H = Math.atan2(Math.sin(H), Math.cos(H)) // -π..π
  const φ = lat * RAD
  const alt = Math.asin(Math.sin(φ) * Math.sin(dec) + Math.cos(φ) * Math.cos(dec) * Math.cos(H)) / RAD
  const cosH0 = (Math.sin(-0.833 * RAD) - Math.sin(φ) * Math.sin(dec)) / (Math.cos(φ) * Math.cos(dec))
  const H0 = Math.acos(Math.max(-1, Math.min(1, cosH0))) / RAD // demi-arc diurne en degrés
  const noonAlt = 90 - Math.abs(lat - dec / RAD)
  // heures de lever/coucher (approx.) : H avance de 15°/h
  const hNow = H / RAD
  const rise = new Date(date.getTime() + ((-H0 - hNow) / 15) * 3600000)
  const set = new Date(date.getTime() + ((H0 - hNow) / 15) * 3600000)
  return { alt, H: hNow, H0, noonAlt, rise, set }
}

// âge de la lune (0 = nouvelle, 0.5 = pleine)
export function moonPhase(date: Date) {
  const syn = 29.530588853
  const ref = Date.UTC(2000, 0, 6, 18, 14) // nouvelle lune de référence
  const age = ((date.getTime() - ref) / 86400000) % syn
  return (age < 0 ? age + syn : age) / syn
}

// Position par défaut selon le fuseau horaire de l'appareil
const TZ: Record<string, [number, number, string]> = {
  'Africa/Djibouti': [11.59, 43.15, 'Djibouti'],
  'Africa/Addis_Ababa': [9.03, 38.74, 'Addis-Abeba'],
  'Africa/Nairobi': [-1.29, 36.82, 'Nairobi'],
  'Africa/Mogadishu': [2.05, 45.32, 'Mogadiscio'],
  'Africa/Cairo': [30.04, 31.24, 'Le Caire'],
  'Africa/Casablanca': [33.57, -7.59, 'Casablanca'],
  'Africa/Dakar': [14.69, -17.44, 'Dakar'],
  'Africa/Abidjan': [5.36, -4.01, 'Abidjan'],
  'Asia/Riyadh': [24.71, 46.68, 'Riyad'],
  'Asia/Dubai': [25.2, 55.27, 'Dubaï'],
  'Asia/Aden': [12.79, 45.03, 'Aden'],
  'Asia/Qatar': [25.29, 51.53, 'Doha'],
  'Europe/Paris': [48.86, 2.35, 'Paris'],
  'Europe/Brussels': [50.85, 4.35, 'Bruxelles'],
  'Europe/London': [51.51, -0.13, 'Londres'],
  'Europe/Istanbul': [41.01, 28.98, 'Istanbul'],
  'America/Moncton': [46.09, -64.78, 'Moncton'],
  'America/Halifax': [44.65, -63.57, 'Halifax'],
  'America/Toronto': [43.65, -79.38, 'Toronto'],
  'America/Montreal': [45.5, -73.57, 'Montréal'],
  'America/New_York': [40.71, -74.01, 'New York'],
  'America/Chicago': [41.88, -87.63, 'Chicago'],
  'America/Los_Angeles': [34.05, -118.24, 'Los Angeles'],
  'America/Vancouver': [49.28, -123.12, 'Vancouver']
}
export function defaultLocation() {
  let tz = 'UTC'
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { /* */ }
  const hit = TZ[tz]
  if (hit) return { lat: hit[0], lng: hit[1], label: hit[2] }
  const off = -new Date().getTimezoneOffset() / 60
  return { lat: 20, lng: off * 15, label: tz.split('/').pop()!.replace(/_/g, ' ') }
}
