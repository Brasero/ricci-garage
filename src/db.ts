import Dexie, { type Table } from 'dexie'
import type { Client, Vehicle } from '../shared/types'

/** Une ligne locale = l'enregistrement + un drapeau « à envoyer au serveur ». */
export type Row<T> = T & { dirty: 0 | 1 }

class GarageDB extends Dexie {
  clients!: Table<Row<Client>, string>
  vehicles!: Table<Row<Vehicle>, string>
  meta!: Table<{ key: string; value: unknown }, string>

  constructor() {
    super('ricci-garage')
    this.version(1).stores({
      clients: 'id, dirty, deletedAt',
      vehicles: 'id, clientId, plateNorm, dirty, deletedAt',
      meta: 'key',
    })
  }
}

export const db = new GarageDB()
