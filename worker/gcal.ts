import { buildDesired, FatalCalendarError, planSync, runPlan, type CalendarApi, type GEvent, type SyncedRow } from '../shared/gcal'
import { loadAll } from './reminders'
import { parseServiceAccount, signJwt, type ServiceAccount } from './googleAuth'

export { parseServiceAccount }

export interface GcalEnv {
  DB: D1Database
  /** Contenu du fichier JSON de la clé du compte de service Google (secret Cloudflare). */
  GOOGLE_SA_JSON?: string
  /** Surcharge de l'adresse de l'API (tests uniquement). */
  GCAL_API_BASE?: string
}

const DEFAULT_API = 'https://www.googleapis.com/calendar/v3'
/** Au plus 18 opérations par exécution : reste sous la limite de 50 sous-requêtes du forfait gratuit. */
const OPS_PER_RUN = 18

async function googleError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } | string; error_description?: string } | null
  const msg = typeof body?.error === 'string' ? `${body.error}${body.error_description ? ` : ${body.error_description}` : ''}` : body?.error?.message
  return `${res.status}${msg ? ` — ${msg}` : ''}`
}

async function accessToken(sa: ServiceAccount): Promise<string> {
  const res = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: await signJwt(sa) }),
  })
  if (!res.ok) throw new FatalCalendarError(`Connexion à Google refusée (${await googleError(res)}). Vérifiez la clé du compte de service.`)
  return ((await res.json()) as { access_token: string }).access_token
}

export function calendarApi(env: GcalEnv, calendarId: string, token: string): CalendarApi {
  const base = `${env.GCAL_API_BASE ?? DEFAULT_API}/calendars/${encodeURIComponent(calendarId)}/events`
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const fatal = async (res: Response): Promise<never> => {
    const detail = await googleError(res)
    if (res.status === 401) throw new FatalCalendarError(`Accès refusé par Google (${detail}).`)
    if (res.status === 403) throw new FatalCalendarError(`Droits insuffisants (${detail}). L'agenda doit être partagé avec le compte de service avec la permission « Apporter des modifications aux événements », et l'API Google Agenda activée.`)
    if (res.status === 404) throw new FatalCalendarError(`Agenda introuvable (${detail}). Vérifiez l'identifiant de l'agenda et son partage avec le compte de service.`)
    throw new Error(detail)
  }
  return {
    async upsert(eventId, event: GEvent, isNew: boolean) {
      const body = JSON.stringify({ ...event, id: eventId, status: 'confirmed' })
      const create = () => fetch(base, { method: 'POST', headers, body })
      // PUT ressuscite aussi un événement supprimé dans Google ; 404 = il n'existe pas → création (et inversement : 409 = il existe → mise à jour).
      const update = () => fetch(`${base}/${eventId}`, { method: 'PUT', headers, body })
      let res = isNew ? await create() : await update()
      if (isNew && res.status === 409) res = await update()
      else if (!isNew && res.status === 404) res = await create()
      if (!res.ok) await fatal(res)
    },
    async remove(eventId) {
      const res = await fetch(`${base}/${eventId}`, { method: 'DELETE', headers })
      // 404 / 410 : l'événement n'existe plus (l'agenda introuvable est déjà détecté à l'écriture) → rien à faire.
      if (res.ok || res.status === 404 || res.status === 410) return
      await fatal(res)
    },
  }
}

export interface GcalStatus {
  at: number
  saved: number
  removed: number
  failed: number
  remaining: number
  error?: string
}

async function saveStatus(db: D1Database, s: GcalStatus) {
  await db.prepare("INSERT INTO kv (k, v) VALUES ('gcal_last_run', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(JSON.stringify(s)).run()
}
export async function getGcalStatus(db: D1Database): Promise<GcalStatus | null> {
  const row = await db.prepare("SELECT v FROM kv WHERE k = 'gcal_last_run'").first<{ v: string }>()
  return row ? (JSON.parse(row.v) as GcalStatus) : null
}

/**
 * Envoie vers Google Agenda ce qui a changé depuis la dernière fois (sens unique : application → Google).
 * Désactivé tant que l'identifiant d'agenda est vide ou que la clé du compte de service est absente.
 */
export async function runGcalSync(env: GcalEnv, now = Date.now()): Promise<GcalStatus | null> {
  const status: GcalStatus = { at: now, saved: 0, removed: 0, failed: 0, remaining: 0 }
  let active = false
  try {
    const data = await loadAll(env.DB)
    const calendarId = data.settings.googleCalendarId.trim()
    if (!calendarId) return null // non activé : on ne laisse aucune trace d'exécution
    active = true
    const sa = parseServiceAccount(env.GOOGLE_SA_JSON)
    if (!sa) {
      status.error = 'Clé du compte de service Google absente ou illisible (secret GOOGLE_SA_JSON).'
      return status
    }
    // Agenda changé dans les Réglages : on repart de zéro (les anciens événements restent dans l'ancien agenda).
    const known = await env.DB.prepare("SELECT v FROM kv WHERE k = 'gcal_calendar_id'").first<{ v: string }>()
    if (known?.v !== calendarId) {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM gcal_sync'),
        env.DB.prepare("INSERT INTO kv (k, v) VALUES ('gcal_calendar_id', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(calendarId),
      ])
    }
    const rows = await env.DB.prepare('SELECT record_id, event_id, hash FROM gcal_sync').all<{ record_id: string; event_id: string; hash: string }>()
    const state = new Map<string, SyncedRow>(rows.results.map((r) => [r.record_id, { eventId: r.event_id, hash: r.hash }]))
    const plan = planSync(buildDesired({ now, ...data }), state)
    if (plan.upserts.length || plan.deletes.length) {
      const api = calendarApi(env, calendarId, await accessToken(sa))
      const out = await runPlan(plan, api, OPS_PER_RUN)
      const stmts = [
        ...out.saved.map((s) => env.DB.prepare('INSERT INTO gcal_sync (record_id, event_id, hash, synced_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(record_id) DO UPDATE SET event_id = ?2, hash = ?3, synced_at = ?4').bind(s.recordId, s.eventId, s.hash, now)),
        ...out.removed.map((id) => env.DB.prepare('DELETE FROM gcal_sync WHERE record_id = ?').bind(id)),
      ]
      if (stmts.length) await env.DB.batch(stmts)
      status.saved = out.saved.length
      status.removed = out.removed.length
      status.failed = out.failed.length
      status.remaining = out.remaining
      status.error = out.fatal ?? out.failed[0]?.error
    }
  } catch (e) {
    status.error = e instanceof FatalCalendarError || e instanceof Error ? e.message : String(e)
  } finally {
    if (active) await saveStatus(env.DB, status).catch(() => undefined)
  }
  return active || status.error ? status : null
}
