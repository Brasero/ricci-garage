import { normalizePlate } from './plate'
import { normalizePhone } from './phone'
import { normalizeText, tokenize } from './text'
import type { Client, Intervention, Vehicle } from './types'

export interface VehicleHit {
  vehicle: Vehicle
  owner: Client | undefined
  score: number
}
export interface ClientHit {
  client: Client
  score: number
}

function score(tokens: string[], haystack: string, wordStarts: string[]): number {
  let total = 0
  for (const t of tokens) {
    if (!haystack.includes(t)) return 0
    total += wordStarts.some((w) => w.startsWith(t)) ? 3 : 1
  }
  return total
}

/**
 * Recherche globale : un véhicule est trouvé par plaque, marque, modèle,
 * nom/prénom du propriétaire (dans n'importe quel ordre) ou téléphone.
 */
export function searchAll(
  query: string,
  clients: Client[],
  vehicles: Vehicle[],
): { vehicles: VehicleHit[]; clients: ClientHit[] } {
  const tokens = tokenize(query)
  if (!tokens.length) return { vehicles: [], clients: [] }
  const queryPlate = normalizePlate(query)

  const activeClients = clients.filter((c) => !c.deletedAt)
  const byId = new Map(activeClients.map((c) => [c.id, c]))

  const clientHits: ClientHit[] = []
  for (const c of activeClients) {
    const words = tokenize(`${c.nom} ${c.prenom}`)
    const hay = `${words.join(' ')} ${normalizeText(c.telephone)} ${normalizePhone(c.telephone)} ${normalizeText(c.email)}`
    const s = score(tokens, hay, words)
    if (s) clientHits.push({ client: c, score: s })
  }

  const vehicleHits: VehicleHit[] = []
  for (const v of vehicles) {
    if (v.deletedAt) continue
    const owner = byId.get(v.clientId)
    if (!owner) continue // propriétaire archivé ou inconnu
    const words = [...tokenize(`${v.marque} ${v.modele}`), ...tokenize(`${owner.nom} ${owner.prenom}`)]
    const plate = v.plateNorm.toLowerCase()
    const hay = `${plate} ${words.join(' ')} ${normalizePhone(owner.telephone)}`
    let s = score(tokens, hay, [plate, ...words])
    if (s && queryPlate && v.plateNorm === queryPlate) s += 100
    if (s) vehicleHits.push({ vehicle: v, owner, score: s })
  }

  const byScore = <T extends { score: number }>(a: T, b: T) => b.score - a.score
  return { vehicles: vehicleHits.sort(byScore), clients: clientHits.sort(byScore) }
}

export interface InterventionHit {
  intervention: Intervention
  vehicle: Vehicle
  owner: Client
  score: number
}

/** Recherche dans le texte des interventions (type, description, pièces) et dans les infos du véhicule/propriétaire. */
export function searchInterventions(query: string, interventions: Intervention[], vehicles: Vehicle[], clients: Client[]): InterventionHit[] {
  const tokens = tokenize(query)
  if (!tokens.length) return []
  const owners = new Map(clients.filter((c) => !c.deletedAt).map((c) => [c.id, c]))
  const cars = new Map(vehicles.filter((v) => !v.deletedAt).map((v) => [v.id, v]))
  const hits: InterventionHit[] = []
  for (const i of interventions) {
    if (i.deletedAt) continue
    const vehicle = cars.get(i.vehicleId)
    const owner = vehicle && owners.get(vehicle.clientId)
    if (!vehicle || !owner) continue
    const words = [
      ...tokenize(`${i.type} ${i.description} ${i.notes}`),
      ...i.pieces.flatMap((p) => tokenize(`${p.designation} ${p.reference}`)),
      ...tokenize(`${vehicle.marque} ${vehicle.modele} ${owner.nom} ${owner.prenom}`),
    ]
    const hay = `${vehicle.plateNorm.toLowerCase()} ${words.join(' ')}`
    const s = score(tokens, hay, [vehicle.plateNorm.toLowerCase(), ...words])
    if (s) hits.push({ intervention: i, vehicle, owner, score: s })
  }
  return hits.sort((a, b) => b.score - a.score || b.intervention.startAt - a.intervention.startAt)
}
