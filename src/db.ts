import Dexie, { type Table } from 'dexie'
import type { Client, Echeance, Intervention, Photo, RendezVous, Settings, Vehicle } from '../shared/types'

/** Une ligne locale = l'enregistrement + un drapeau « à envoyer au serveur ». */
export type Row<T> = T & { dirty: 0 | 1 }

/** Photo locale : métadonnées synchronisées + image (`blob`) et état d'envoi (`uploaded`), propres à l'appareil. */
export type PhotoRow = Row<Photo> & { blob?: Blob; uploaded: 0 | 1 }

class GarageDB extends Dexie {
  clients!: Table<Row<Client>, string>
  vehicles!: Table<Row<Vehicle>, string>
  interventions!: Table<Row<Intervention>, string>
  photos!: Table<PhotoRow, string>
  rdvs!: Table<Row<RendezVous>, string>
  echeances!: Table<Row<Echeance>, string>
  settings!: Table<Row<Settings>, string>
  meta!: Table<{ key: string; value: unknown }, string>

  constructor() {
    super('ricci-garage')
    this.version(1).stores({
      clients: 'id, dirty, deletedAt',
      vehicles: 'id, clientId, plateNorm, dirty, deletedAt',
      meta: 'key',
    })
    this.version(2).stores({
      interventions: 'id, vehicleId, startAt, dirty, deletedAt',
      photos: 'id, interventionId, dirty, uploaded, deletedAt',
    })
    this.version(3).stores({
      rdvs: 'id, startAt, clientId, vehicleId, dirty, deletedAt',
      echeances: 'id, vehicleId, dateDue, dirty, deletedAt',
      settings: 'id, dirty',
    })
  }
}

export const db = new GarageDB()

/** Nombre d'éléments en attente d'envoi (tous types, images comprises). */
export async function countPending(): Promise<number> {
  const tables = [db.clients, db.vehicles, db.interventions, db.rdvs, db.echeances, db.settings, db.photos] as unknown as Table<{ dirty: 0 | 1 }, string>[]
  const counts = await Promise.all(tables.map((t) => t.where('dirty').equals(1).count()))
  return counts.reduce((a, b) => a + b, 0) + (await db.photos.where('uploaded').equals(0).count())
}
