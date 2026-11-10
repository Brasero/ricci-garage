import { normalizePlate } from './plate'
import { normalizePhone } from './phone'
import { normalizeText, tokenize } from './text'
import type { Client, Vehicle } from './types'

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
