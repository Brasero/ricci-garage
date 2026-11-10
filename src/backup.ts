import { validatePlate } from '../shared/plate'
import { INTERVENTION_TYPES, STATUTS, type Client, type Intervention, type Vehicle } from '../shared/types'
import { db } from './db'
import { requestSync } from './sync'

const FORMAT = 'ricci-garage-export'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function exportAll() {
  const [clients, vehicles, interventions] = await Promise.all([db.clients.toArray(), db.vehicles.toArray(), db.interventions.toArray()])
  const strip = <T extends { dirty: 0 | 1 }>({ dirty: _d, ...rest }: T) => rest
  return { format: FORMAT, version: 1, exportedAt: new Date().toISOString(), clients: clients.map(strip), vehicles: vehicles.map(strip), interventions: interventions.map(strip) }
  // Les photos ne sont pas dans ce fichier : elles restent sur le serveur (R2).
}

function checkBase(r: unknown, what: string): asserts r is { id: string; updatedAt: number; deletedAt: number | null } {
  const o = r as Record<string, unknown>
  if (!o || typeof o.id !== 'string' || !UUID.test(o.id) || typeof o.updatedAt !== 'number') throw new Error(`${what} invalide dans le fichier`)
}

/** Importe une sauvegarde : tout est marqué « à envoyer » ; la version la plus récente gagne. Retourne le nombre importé. */
export async function importAll(file: unknown): Promise<number> {
  const f = file as { format?: string; version?: number; clients?: unknown; vehicles?: unknown; interventions?: unknown }
  if (!f || f.format !== FORMAT || f.version !== 1 || !Array.isArray(f.clients) || !Array.isArray(f.vehicles)) {
    throw new Error("ce n'est pas une sauvegarde Ricci Garage")
  }
  for (const c of f.clients) {
    checkBase(c, 'client')
    const x = c as Client
    if (typeof x.nom !== 'string' || typeof x.prenom !== 'string' || typeof x.telephone !== 'string') throw new Error('client invalide dans le fichier')
  }
  for (const v of f.vehicles) {
    checkBase(v, 'véhicule')
    const x = v as Vehicle
    if (typeof x.clientId !== 'string' || typeof x.plate !== 'string' || !validatePlate(x.country, x.plate).ok) throw new Error('véhicule invalide dans le fichier')
  }
  const interventions = f.interventions === undefined ? [] : f.interventions
  if (!Array.isArray(interventions)) throw new Error('interventions invalides dans le fichier')
  for (const i of interventions) {
    checkBase(i, 'intervention')
    const x = i as Intervention
    if (
      typeof x.vehicleId !== 'string' || typeof x.startAt !== 'number' || !Array.isArray(x.pieces) ||
      !INTERVENTION_TYPES.some((t) => t[0] === x.type) || !STATUTS.some((s) => s[0] === x.statut)
    ) throw new Error('intervention invalide dans le fichier')
  }
  let n = 0
  await db.transaction('rw', [db.clients, db.vehicles, db.interventions], async () => {
    for (const c of f.clients as Client[]) {
      const local = await db.clients.get(c.id)
      if (local && local.updatedAt >= c.updatedAt) continue
      await db.clients.put({ ...c, dirty: 1 })
      n++
    }
    for (const i of interventions as Intervention[]) {
      const local = await db.interventions.get(i.id)
      if (local && local.updatedAt >= i.updatedAt) continue
      await db.interventions.put({ ...i, dirty: 1 })
      n++
    }
    for (const v of f.vehicles as Vehicle[]) {
      const local = await db.vehicles.get(v.id)
      if (local && local.updatedAt >= v.updatedAt) continue
      await db.vehicles.put({ ...v, dirty: 1 })
      n++
    }
  })
  requestSync()
  return n
}
