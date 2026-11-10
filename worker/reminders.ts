import { computeMailJobs, type MailJob } from '../shared/reminders'
import { withDefaults } from '../shared/settings'
import type { Client, Echeance, Intervention, RendezVous, Settings, Vehicle } from '../shared/types'
import { sendMail, type MailEnv } from './mail'

export interface RemindersEnv extends Partial<MailEnv> {
  DB: D1Database
}

const MAX_PER_RUN = 15
const LOG_RETENTION_MS = 120 * 24 * 3600_000

export interface RunStatus {
  at: number
  sent: number
  failed: number
  pending: number
  error?: string
}

interface Row {
  kind: string
  data: string
  updated_at: number
  deleted_at: number | null
  id: string
}

export async function loadAll(db: D1Database) {
  const { results } = await db
    .prepare("SELECT id, kind, data, updated_at, deleted_at FROM records WHERE kind IN ('client','vehicle','intervention','rdv','echeance','settings')")
    .all<Row>()
  const pick = <T>(kind: string): T[] =>
    results.filter((r) => r.kind === kind).map((r) => ({ ...(JSON.parse(r.data) as object), id: r.id, updatedAt: r.updated_at, deletedAt: r.deleted_at }) as T)
  const settings = pick<Settings>('settings')[0]
  return {
    settings: withDefaults(settings && !settings.deletedAt ? settings : undefined),
    clients: pick<Client>('client'),
    vehicles: pick<Vehicle>('vehicle'),
    interventions: pick<Intervention>('intervention'),
    rdvs: pick<RendezVous>('rdv'),
    echeances: pick<Echeance>('echeance'),
  }
}

export const mailConfigured = (env: Partial<MailEnv>): boolean => !!env.SMTP_USER && !!env.SMTP_PASSWORD

async function saveStatus(db: D1Database, s: RunStatus) {
  await db.prepare("INSERT INTO kv (k, v) VALUES ('mail_last_run', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(JSON.stringify(s)).run()
}

export async function getStatus(db: D1Database): Promise<RunStatus | null> {
  const row = await db.prepare("SELECT v FROM kv WHERE k = 'mail_last_run'").first<{ v: string }>()
  return row ? (JSON.parse(row.v) as RunStatus) : null
}

/**
 * Exécuté toutes les 15 minutes : calcule les emails dont l'heure est arrivée et envoie ceux qui ne l'ont pas encore été.
 * Chaque rappel est « réservé » (INSERT) avant l'envoi : deux exécutions simultanées ne peuvent pas l'envoyer deux fois ;
 * si l'envoi échoue, la réservation est levée et il sera retenté à la prochaine exécution (tant que la fenêtre n'est pas passée).
 */
export async function runReminders(env: RemindersEnv, now = Date.now()): Promise<RunStatus> {
  const status: RunStatus = { at: now, sent: 0, failed: 0, pending: 0 }
  try {
    if (!mailConfigured(env)) {
      status.error = 'Envoi non configuré (secrets SMTP_USER / SMTP_PASSWORD manquants).'
      return status
    }
    const data = await loadAll(env.DB)
    const jobs = computeMailJobs({ now, ...data })
    const queue: MailJob[] = jobs.slice(0, MAX_PER_RUN)
    status.pending = Math.max(0, jobs.length - queue.length)
    for (const job of queue) {
      const claim = await env.DB.prepare('INSERT OR IGNORE INTO reminder_log (key, sent_at, to_addr, subject) VALUES (?, ?, ?, ?)')
        .bind(job.key, now, job.to, job.subject)
        .run()
      if (!claim.meta.changes) continue // déjà envoyé (ou en cours)
      try {
        await sendMail(env as MailEnv, { fromName: data.settings.garageNom, to: job.to, replyTo: data.settings.garageEmail || undefined, subject: job.subject, text: job.text, html: job.html })
        status.sent++
      } catch (e) {
        status.failed++
        status.error = e instanceof Error ? e.message : String(e)
        await env.DB.prepare('DELETE FROM reminder_log WHERE key = ?').bind(job.key).run()
      }
    }
    await env.DB.prepare('DELETE FROM reminder_log WHERE sent_at < ?').bind(now - LOG_RETENTION_MS).run()
  } catch (e) {
    status.error = e instanceof Error ? e.message : String(e)
  } finally {
    await saveStatus(env.DB, status).catch(() => undefined)
  }
  return status
}
