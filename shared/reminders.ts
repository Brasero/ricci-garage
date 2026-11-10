import { TIMEZONE } from './settings'
import { addDays, daysBetween, formatDateFr, formatDateTimeFr, localDate, zonedToMs } from './time'
import type { Client, Echeance, RendezVous, Settings, Vehicle } from './types'
import { ECHEANCE_TYPES } from './types'

/** Un email à envoyer. `key` identifie ce rappel précis : une fois envoyé, il n'est jamais renvoyé. */
export interface MailJob {
  key: string
  to: string
  subject: string
  text: string
  html: string
}

export interface ReminderInput {
  now: number
  settings: Settings
  clients: Client[]
  vehicles: Vehicle[]
  rdvs: RendezVous[]
  echeances: Echeance[]
}

/** Un rappel n'est plus envoyé s'il est en retard de plus de cette durée (ex. serveur en panne). */
const RDV_GRACE_MS = 6 * 3600_000
const ECHEANCE_GRACE_MS = 20 * 3600_000
const RECAP_GRACE_MS = 12 * 3600_000
/** Km restants à partir desquels une échéance kilométrique apparaît dans le récapitulatif. */
export const KM_ALERT = 1000
/** Horizon (jours) des échéances datées dans le récapitulatif. */
export const RECAP_HORIZON_DAYS = 30

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const fullName = (c: Pick<Client, 'nom' | 'prenom'>) => `${c.prenom} ${c.nom}`.trim()
const echeanceLabel = (e: Echeance) => (e.type === 'autre' ? e.libelle || 'Échéance' : ECHEANCE_TYPES.find((t) => t[0] === e.type)![1] + (e.libelle ? ` (${e.libelle})` : ''))
const delayLabel = (min: number) => (min >= 1440 && min % 1440 === 0 ? (min === 1440 ? 'demain' : `dans ${min / 1440} jours`) : min % 60 === 0 ? `dans ${min / 60} h` : `dans ${min} min`)

export function validEmail(s: string | undefined | null): s is string {
  return !!s && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim())
}

const paras = (lines: string[]) => lines.map((l) => `<p style="margin:0 0 10px">${esc(l)}</p>`).join('')

/** Habille un message : titre, pied de page (coordonnées et mention du garage, réglables). */
function wrap(settings: Settings, title: string, textLines: string[], htmlBody: string): { text: string; html: string } {
  const footer = [settings.garageNom, settings.garageAdresse, settings.garageTelephone, settings.garageEmail, settings.signature].filter((x) => x.trim())
  const text = [...textLines, '', '--', ...footer].join('\n')
  const html = `<div style="font-family:system-ui,Arial,sans-serif;font-size:16px;color:#17212b;max-width:560px"><h2 style="margin:0 0 12px">${esc(title)}</h2>${htmlBody}<hr style="border:0;border-top:1px solid #d6dde5;margin:18px 0 8px"><p style="margin:0;color:#5d6b7a;font-size:14px">${footer.map(esc).join('<br>')}</p></div>`
  return { text, html }
}

/** Rappels de rendez-vous (client et, si activé, adresse du récapitulatif) dont l'heure d'envoi est arrivée. */
function rdvJobs(i: ReminderInput): MailJob[] {
  const { now, settings: s } = i
  const clients = new Map(i.clients.filter((c) => !c.deletedAt).map((c) => [c.id, c]))
  const vehicles = new Map(i.vehicles.filter((v) => !v.deletedAt).map((v) => [v.id, v]))
  const jobs: MailJob[] = []
  for (const r of i.rdvs) {
    if (r.deletedAt || r.statut !== 'prevu' || r.startAt <= now) continue
    const client = clients.get(r.clientId)
    if (!client) continue
    const car = r.vehicleId ? vehicles.get(r.vehicleId) : undefined
    for (const min of s.delaisRdvMin) {
      const fire = r.startAt - min * 60_000
      if (now < fire || now >= Math.min(fire + RDV_GRACE_MS, r.startAt)) continue
      const when = formatDateTimeFr(r.startAt, TIMEZONE)
      const what = [r.motif, car ? `${car.marque} ${car.modele} (${car.plate})` : ''].filter(Boolean).join(' — ')
      const recipients: { to: string; who: 'client' | 'pere' }[] = []
      if (s.rappelsClientActifs && client.rappelsEmail !== false && validEmail(client.email)) recipients.push({ to: client.email.trim(), who: 'client' })
      if (s.rappelsRdvPereActifs && validEmail(s.emailRecap)) recipients.push({ to: s.emailRecap.trim(), who: 'pere' })
      for (const { to, who } of recipients) {
        const subject = who === 'client' ? `Rappel de rendez-vous ${delayLabel(min)} — ${s.garageNom}` : `Rendez-vous ${delayLabel(min)} : ${fullName(client)}`
        const lines =
          who === 'client'
            ? [`Bonjour ${client.prenom},`, `Nous vous rappelons votre rendez-vous au garage : ${when}.`, ...(what ? [`Objet : ${what}.`] : []), 'Si vous ne pouvez pas venir, merci de nous prévenir.']
            : [`Rendez-vous ${delayLabel(min)} : ${when}.`, `Client : ${fullName(client)} (${client.telephone}).`, ...(what ? [`Objet : ${what}.`] : [])]
        const { text, html } = wrap(s, who === 'client' ? 'Rappel de rendez-vous' : 'Rendez-vous à venir', lines, paras(lines))
        jobs.push({ key: `rdv:${r.id}:${r.startAt}:${min}:${to.toLowerCase()}`, to, subject, text, html })
      }
    }
  }
  return jobs
}

/** Rappels d'échéance datée au client (à l'heure d'envoi du jour J − N). */
function echeanceJobs(i: ReminderInput): MailJob[] {
  const { now, settings: s } = i
  if (!s.rappelsClientActifs) return []
  const clients = new Map(i.clients.filter((c) => !c.deletedAt).map((c) => [c.id, c]))
  const vehicles = new Map(i.vehicles.filter((v) => !v.deletedAt).map((v) => [v.id, v]))
  const jobs: MailJob[] = []
  for (const e of i.echeances) {
    if (e.deletedAt || e.statut !== 'ouverte' || !e.dateDue) continue
    const car = vehicles.get(e.vehicleId)
    const client = car && clients.get(car.clientId)
    if (!car || !client || client.rappelsEmail === false || !validEmail(client.email)) continue
    for (const days of s.delaisEcheanceJours) {
      const fire = zonedToMs(addDays(e.dateDue, -days), s.heureEnvoi, TIMEZONE)
      if (now < fire || now >= fire + ECHEANCE_GRACE_MS) continue
      const label = echeanceLabel(e)
      const dateTxt = formatDateFr(e.dateDue)
      const inTxt = days === 0 ? "aujourd'hui" : days === 1 ? 'demain' : `dans ${days} jours`
      const lines = [
        `Bonjour ${client.prenom},`,
        `Petit rappel pour votre ${car.marque} ${car.modele} (${car.plate}) : ${label.toLowerCase()} à prévoir ${inTxt}, le ${dateTxt}.`,
        'Contactez-nous pour prendre rendez-vous.',
      ]
      const { text, html } = wrap(s, `Rappel : ${label}`, lines, paras(lines))
      jobs.push({ key: `echeance:${e.id}:${e.dateDue}:${days}:${client.email.trim().toLowerCase()}`, to: client.email.trim(), subject: `Rappel : ${label.toLowerCase()} — ${car.marque} ${car.modele}`, text, html })
    }
  }
  return jobs
}

/** Récapitulatif quotidien : rendez-vous d'aujourd'hui et de demain, échéances en retard ou proches. Vide → pas d'email. */
function recapJob(i: ReminderInput): MailJob[] {
  const { now, settings: s } = i
  if (!s.recapActif || !validEmail(s.emailRecap)) return []
  const today = localDate(now, TIMEZONE)
  const fire = zonedToMs(today, s.heureEnvoi, TIMEZONE)
  if (now < fire || now >= fire + RECAP_GRACE_MS) return []
  const tomorrow = addDays(today, 1)
  const clients = new Map(i.clients.filter((c) => !c.deletedAt).map((c) => [c.id, c]))
  const vehicles = new Map(i.vehicles.filter((v) => !v.deletedAt).map((v) => [v.id, v]))

  const rdvLine = (r: RendezVous) => {
    const c = clients.get(r.clientId)
    const car = r.vehicleId ? vehicles.get(r.vehicleId) : undefined
    const hh = new Date(r.startAt).toLocaleTimeString('fr-FR', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit' })
    return `${hh} — ${c ? fullName(c) : 'Client'}${car ? ` · ${car.marque} ${car.modele} (${car.plate})` : ''}${r.motif ? ` · ${r.motif}` : ''}`
  }
  const mine = i.rdvs.filter((r) => !r.deletedAt && r.statut === 'prevu' && clients.has(r.clientId)).sort((a, b) => a.startAt - b.startAt)
  const rdvToday = mine.filter((r) => localDate(r.startAt, TIMEZONE) === today && r.startAt >= fire - 24 * 3600_000)
  const rdvTomorrow = mine.filter((r) => localDate(r.startAt, TIMEZONE) === tomorrow)

  const eLine = (e: Echeance, extra: string) => {
    const car = vehicles.get(e.vehicleId)
    const c = car && clients.get(car.clientId)
    return `${echeanceLabel(e)} — ${car ? `${car.marque} ${car.modele} (${car.plate})` : 'véhicule'}${c ? ` · ${fullName(c)}` : ''} · ${extra}`
  }
  const open = i.echeances.filter((e) => !e.deletedAt && e.statut === 'ouverte' && vehicles.has(e.vehicleId) && clients.has(vehicles.get(e.vehicleId)!.clientId))
  const overdue: string[] = []
  const soon: string[] = []
  const kmSoon: string[] = []
  for (const e of open.filter((x) => x.dateDue).sort((a, b) => a.dateDue!.localeCompare(b.dateDue!))) {
    const d = daysBetween(today, e.dateDue!)
    if (d < 0) overdue.push(eLine(e, `en retard de ${-d} jour${-d > 1 ? 's' : ''} (${e.dateDue})`))
    else if (d <= RECAP_HORIZON_DAYS) soon.push(eLine(e, d === 0 ? "aujourd'hui" : `dans ${d} jour${d > 1 ? 's' : ''} (${e.dateDue})`))
  }
  for (const e of open.filter((x) => x.kmDue !== null)) {
    const km = vehicles.get(e.vehicleId)!.km
    if (km === null) continue
    const left = e.kmDue! - km
    if (left <= KM_ALERT) kmSoon.push(eLine(e, left <= 0 ? `dépassée de ${-left} km` : `dans ${left} km`))
  }

  if (!rdvToday.length && !rdvTomorrow.length && !overdue.length && !soon.length && !kmSoon.length) return []
  const sections: [string, string[]][] = [
    ["Rendez-vous d'aujourd'hui", rdvToday.map(rdvLine)],
    ['Rendez-vous de demain', rdvTomorrow.map(rdvLine)],
    ['Échéances en retard', overdue],
    [`Échéances dans les ${RECAP_HORIZON_DAYS} prochains jours`, soon],
    ['Échéances kilométriques proches', kmSoon],
  ]
  const lines: string[] = []
  let htmlExtra = ''
  for (const [title, items] of sections) {
    if (!items.length) continue
    lines.push('', `${title} :`, ...items.map((x) => `  • ${x}`))
    htmlExtra += `<h3 style="margin:16px 0 6px">${esc(title)}</h3><ul style="margin:0;padding-left:20px">${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`
  }
  const { text, html } = wrap(s, `Récapitulatif du ${formatDateFr(today)}`, lines.slice(1), htmlExtra)
  return [{ key: `recap:${today}:${s.emailRecap.trim().toLowerCase()}`, to: s.emailRecap.trim(), subject: `Récapitulatif du ${today.split('-').reverse().join('/')} — ${s.garageNom}`, text, html }]
}

/** Tous les emails dont l'heure est arrivée (le serveur écarte ceux déjà envoyés grâce à `key`). */
export function computeMailJobs(i: ReminderInput): MailJob[] {
  return [...rdvJobs(i), ...echeanceJobs(i), ...recapJob(i)]
}
