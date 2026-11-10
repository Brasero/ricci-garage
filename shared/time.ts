/** Heure locale d'un fuseau, sans bibliothèque : on s'appuie sur Intl. */

interface Parts { y: number; m: number; d: number; h: number; min: number }

function partsIn(ms: number, tz: string): Parts {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  const o: Record<string, number> = {}
  for (const p of f.formatToParts(new Date(ms))) if (p.type !== 'literal') o[p.type] = Number(p.value)
  return { y: o.year, m: o.month, d: o.day, h: o.hour, min: o.minute }
}

/** Décalage (ms) du fuseau par rapport à UTC à cet instant. */
function offsetMs(ms: number, tz: string): number {
  const p = partsIn(ms, tz)
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - Math.floor(ms / 60_000) * 60_000
}

/** « AAAA-MM-JJ » du jour courant dans le fuseau. */
export function localDate(ms: number, tz: string): string {
  const p = partsIn(ms, tz)
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`
}

export function localHour(ms: number, tz: string): number {
  return partsIn(ms, tz).h
}

/** Instant UTC (ms) correspondant à « date locale + heure » dans le fuseau. */
export function zonedToMs(date: string, hour: number, tz: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const guess = Date.UTC(y, m - 1, d, hour, 0)
  let ms = guess - offsetMs(guess, tz)
  ms = guess - offsetMs(ms, tz) // second passage : corrige le changement d'heure
  return ms
}

/** Ajoute des jours à une date « AAAA-MM-JJ » (jours calendaires, insensible à l'heure d'été). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + days))
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`
}

export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + months, 1))
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate()
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`
}

/** Nombre de jours entre deux dates (b − a). */
export function daysBetween(a: string, b: string): number {
  const [ya, ma, da] = a.split('-').map(Number)
  const [yb, mb, db] = b.split('-').map(Number)
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000)
}

export function formatDateFr(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export function formatDateTimeFr(ms: number, tz: string): string {
  return new Date(ms).toLocaleString('fr-FR', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
}
