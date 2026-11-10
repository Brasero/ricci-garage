import Dexie, { type Table } from 'dexie'
import type { Client, Intervention, Photo, Vehicle } from '../shared/types'

/** Une ligne locale = l'enregistrement + un drapeau « à envoyer au serveur ». */
export type Row<T> = T & { dirty: 0 | 1 }

/** Photo locale : métadonnées synchronisées + image (`blob`) et état d'envoi (`uploaded`), propres à l'appareil. */
export type PhotoRow = Row<Photo> & { blob?: Blob; uploaded: 0 | 1 }

class GarageDB extends Dexie {
  clients!: Table<Row<Client>, string>
  vehicles!: Table<Row<Vehicle>, string>
  interventions!: Table<Row<Intervention>, string>
  photos!: Table<PhotoRow, string>
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
  }
}

export const db = new GarageDB()
