import { TIMEZONE } from './settings'
import { addDays, localDate } from './time'
import type { Client, Echeance, Intervention, RendezVous, Settings, Vehicle } from './types'
import { ECHEANCE_TYPES, INTERVENTION_TYPES } from './types'

/**
 * Synchronisation à sens unique vers Google Agenda : application → Google.
 * Ici, la partie pure (quels événements, quelles opérations) ; les appels réseau sont dans worker/gcal.ts.
 *
 * Pas de rappels dans les événements : dans Google, un rappel appartient à l'utilisateur qui l'enregistre, et l'application
 * écrit avec un compte de service (pas avec le compte de la personne qui consulte l'agenda). Les alertes sur le téléphone
 * viennent donc des notifications par défaut que cette personne règle sur l'agenda dans son propre Google Agenda.
 */

export interface GEvent {
  summary: string
  description: string
  start: { dateTime?: string; date?: string; timeZone?: string }
  end: { dateTime?: string; date?: string; timeZone?: string }
  colorId: string
  extendedProperties: { private: { rg: string } }
}

export interface Desired {
  recordId: string
  eventId: string
  event: GEvent
  hash: string
}

export interface GcalInput {
  now: number
  settings: Settings
  clients: Client[]
  vehicles: Vehicle[]
  rdvs: RendezVous[]
  interventions: Intervention[]
  echeances: Echeance[]
}

/** Au-delà de cet âge, un événement n'est plus modifié ni supprimé (l'historique ancien reste tel quel dans Google). */
export const WINDOW_DAYS = 30

/** Identifiant d'événement Google : caractères a-v et 0-9 uniquement (un UUID sans tirets convient). */
export function eventIdFor(kind: 'rdv' | 'inter' | 'echeance', recordId: string): string {
  const letter = { rdv: 'r', inter: 'i', echeance: 'e' }[kind]
  return `rg${letter}${recordId.toLowerCase().replace(/[^a-v0-9]/g, '')}`
}

/** Empreinte rapide et stable (cyrb53) : sert à ne renvoyer à Google que ce qui a changé. */
export function hashEvent(e: unknown): string {
  const s = JSON.stringify(e)
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

const fullName = (c: Pick<Client, 'nom' | 'prenom'>) => `${c.prenom} ${c.nom}`.trim()
const carLabel = (v: Vehicle) => `${v.marque} ${v.modele} (${v.plate})`

function dateTime(ms: number) {
  return { dateTime: new Date(ms).toISOString(), timeZone: TIMEZONE }
}

export interface BuildResult {
  desired: Desired[]
  /** Enregistrements actifs mais hors fenêtre : à laisser tels quels dans Google. */
  keep: Set<string>
}

export function buildDesired(i: GcalInput): BuildResult {
  const { now } = i
  const clients = new Map(i.clients.filter((c) => !c.deletedAt).map((c) => [c.id, c]))
  const cars = new Map(i.vehicles.filter((v) => !v.deletedAt && clients.has(v.clientId)).map((v) => [v.id, v]))
  const minStart = now - WINDOW_DAYS * 86_400_000
  const minDay = addDays(localDate(now, TIMEZONE), -WINDOW_DAYS)
  const desired: Desired[] = []
  const keep = new Set<string>()
  const add = (recordId: string, kind: 'rdv' | 'inter' | 'echeance', event: GEvent) => {
    desired.push({ recordId, eventId: eventIdFor(kind, recordId), event, hash: hashEvent(event) })
  }

  for (const r of i.rdvs) {
    const c = clients.get(r.clientId)
    if (r.deletedAt || !c || r.statut === 'annule') continue
    if (r.startAt < minStart) {
      keep.add(r.id)
      continue
    }
    const car = r.vehicleId ? cars.get(r.vehicleId) : undefined
    add(r.id, 'rdv', {
      summary: `${r.statut === 'honore' ? '✓ ' : '📅 '}${fullName(c)} — ${r.motif || 'Rendez-vous'}`,
      description: [`Client : ${fullName(c)}`, `Téléphone : ${c.telephone}`, car ? `Véhicule : ${carLabel(car)}` : '', r.motif ? `Motif : ${r.motif}` : '', r.notes ? `Notes : ${r.notes}` : ''].filter(Boolean).join('\n'),
      start: dateTime(r.startAt),
      end: dateTime(r.startAt + Math.max(5, r.dureeMin) * 60_000),
      colorId: '9',
      extendedProperties: { private: { rg: r.id } },
    })
  }

  for (const it of i.interventions) {
    const car = cars.get(it.vehicleId)
    if (it.deletedAt || !car) continue
    if (it.startAt < minStart) {
      keep.add(it.id)
      continue
    }
    const c = clients.get(car.clientId)!
    const typeLabel = INTERVENTION_TYPES.find((t) => t[0] === it.type)![1]
    const status = it.statut === 'terminee' ? 'terminée' : it.statut === 'en_cours' ? 'en cours' : 'à faire'
    add(it.id, 'inter', {
      summary: `🔧 ${carLabel(car)} — ${it.description.split('\n')[0] || typeLabel}`,
      // Volontairement sans aucun prix : les montants restent dans l'application.
      description: [`Intervention ${status}`, `Client : ${fullName(c)}`, `Téléphone : ${c.telephone}`, `Véhicule : ${carLabel(car)}`, it.description ? `Travaux : ${it.description}` : ''].filter(Boolean).join('\n'),
      start: dateTime(it.startAt),
      end: dateTime(it.startAt + (it.dureeMin && it.dureeMin >= 5 ? it.dureeMin : 60) * 60_000),
      colorId: it.statut === 'terminee' ? '8' : '10',
      extendedProperties: { private: { rg: it.id } },
    })
  }

  for (const e of i.echeances) {
    const car = cars.get(e.vehicleId)
    if (e.deletedAt || e.statut !== 'ouverte' || !e.dateDue || !car) continue
    if (e.dateDue < minDay) {
      keep.add(e.id)
      continue
    }
    const c = clients.get(car.clientId)!
    const label = e.type === 'autre' ? e.libelle || 'Échéance' : ECHEANCE_TYPES.find((t) => t[0] === e.type)![1] + (e.libelle ? ` (${e.libelle})` : '')
    add(e.id, 'echeance', {
      summary: `⏰ ${label} — ${carLabel(car)}`,
      description: [`Échéance : ${label}`, `Client : ${fullName(c)}`, `Téléphone : ${c.telephone}`, `Véhicule : ${carLabel(car)}`, e.notes ? `Notes : ${e.notes}` : ''].filter(Boolean).join('\n'),
      start: { date: e.dateDue },
      end: { date: addDays(e.dateDue, 1) },
      colorId: '6',
      extendedProperties: { private: { rg: e.id } },
    })
  }
  return { desired, keep }
}

export interface SyncedRow {
  eventId: string
  hash: string
}

export interface Plan {
  /** `isNew` : jamais envoyé à Google → on tente d'abord la création (une seule requête au lieu de deux). */
  upserts: (Desired & { isNew: boolean })[]
  deletes: { recordId: string; eventId: string }[]
}

/** Compare ce que Google devrait contenir à ce qu'on y a déjà mis : seulement les nouveautés, modifications et suppressions. */
export function planSync(build: BuildResult, state: Map<string, SyncedRow>): Plan {
  const wanted = new Set(build.desired.map((d) => d.recordId))
  return {
    upserts: build.desired.filter((d) => state.get(d.recordId)?.hash !== d.hash).map((d) => ({ ...d, isNew: !state.has(d.recordId) })),
    deletes: [...state].filter(([id]) => !wanted.has(id) && !build.keep.has(id)).map(([recordId, row]) => ({ recordId, eventId: row.eventId })),
  }
}

export interface CalendarApi {
  upsert(eventId: string, event: GEvent, isNew: boolean): Promise<void>
  remove(eventId: string): Promise<void>
}

export interface SyncOutcome {
  saved: { recordId: string; eventId: string; hash: string }[]
  removed: string[]
  failed: { recordId: string; error: string }[]
  /** Opérations restantes (à traiter aux prochaines exécutions). */
  remaining: number
  /** Arrêt anticipé (accès refusé, agenda introuvable…) : inutile de continuer. */
  fatal?: string
}

/** Erreur dont la cause est la configuration (partage, identifiant, droits) : on s'arrête au lieu de tout retenter. */
export class FatalCalendarError extends Error {}

/** Exécute le plan, au plus `limit` opérations par passage (le reste partira à l'exécution suivante). */
export async function runPlan(plan: Plan, api: CalendarApi, limit: number): Promise<SyncOutcome> {
  const out: SyncOutcome = { saved: [], removed: [], failed: [], remaining: 0 }
  let budget = limit
  try {
    for (const d of plan.upserts) {
      if (budget <= 0) {
        out.remaining++
        continue
      }
      budget--
      try {
        await api.upsert(d.eventId, d.event, d.isNew)
        out.saved.push({ recordId: d.recordId, eventId: d.eventId, hash: d.hash })
      } catch (e) {
        if (e instanceof FatalCalendarError) throw e
        out.failed.push({ recordId: d.recordId, error: e instanceof Error ? e.message : String(e) })
      }
    }
    for (const d of plan.deletes) {
      if (budget <= 0) {
        out.remaining++
        continue
      }
      budget--
      try {
        await api.remove(d.eventId)
        out.removed.push(d.recordId)
      } catch (e) {
        if (e instanceof FatalCalendarError) throw e
        out.failed.push({ recordId: d.recordId, error: e instanceof Error ? e.message : String(e) })
      }
    }
  } catch (e) {
    out.fatal = e instanceof Error ? e.message : String(e)
    out.remaining += plan.upserts.length + plan.deletes.length - out.saved.length - out.removed.length - out.failed.length
  }
  return out
}
