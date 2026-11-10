import { validatePlate } from '../shared/plate'
import type { Client, Vehicle } from '../shared/types'
import { db } from './db'
import { requestSync } from './sync'

const FORMAT = 'ricci-garage-export'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function exportAll() {
  const [clients, vehicles] = await Promise.all([db.clients.toArray(), db.vehicles.toArray()])
  const strip = <T extends { dirty: 0 | 1 }>({ dirty: _d, ...rest }: T) => rest
  return { format: FORMAT, version: 1, exportedAt: new Date().toISOString(), clients: clients.map(strip), vehicles: vehicles.map(strip) }
}

function checkBase(r: unknown, what: string): asserts r is { id: string; updatedAt: number; deletedAt: number | null } {
  const o = r as Record<string, unknown>
  if (!o || typeof o.id !== 'string' || !UUID.test(o.id) || typeof o.updatedAt !== 'number') throw new Error(`${what} invalide dans le fichier`)
}

/** Importe une sauvegarde : tout est marqué « à envoyer » ; la version la plus récente gagne. Retourne le nombre importé. */
export async function importAll(file: unknown): Promise<number> {
  const f = file as { format?: string; version?: number; clients?: unknown; vehicles?: unknown }
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
  let n = 0
  await db.transaction('rw', db.clients, db.vehicles, async () => {
    for (const c of f.clients as Client[]) {
      const local = await db.clients.get(c.id)
      if (local && local.updatedAt >= c.updatedAt) continue
      await db.clients.put({ ...c, dirty: 1 })
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
