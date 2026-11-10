import type { Country } from './plate'

export type RecordKind = 'client' | 'vehicle'

export interface BaseRecord {
  /** UUID généré sur l'appareil : permet de créer hors connexion. */
  id: string
  createdAt: number
  /** Horodatage (ms) de la dernière modification : le plus récent gagne. */
  updatedAt: number
  /** Suppression douce (corbeille) : null = actif. */
  deletedAt: number | null
}

export interface Client extends BaseRecord {
  nom: string
  prenom: string
  telephone: string
  email: string
  notes: string
}

export const MOTORISATIONS = [
  ['essence', 'Essence'],
  ['diesel', 'Diesel'],
  ['hybride', 'Hybride'],
  ['hybride_rechargeable', 'Hybride rechargeable'],
  ['electrique', 'Électrique'],
  ['gpl', 'GPL'],
  ['autre', 'Autre'],
] as const
export type Motorisation = (typeof MOTORISATIONS)[number][0]

export interface Vehicle extends BaseRecord {
  clientId: string
  marque: string
  modele: string
  motorisation: Motorisation
  motorisationDetail: string
  country: Country
  /** Plaque affichée (formatée). */
  plate: string
  /** Plaque normalisée (sert à la recherche et à l'unicité). */
  plateNorm: string
  couleur: string
  miseEnCirculation: string
  vin: string
  km: number | null
  dernierCT: string
  notes: string
  /** Anciens propriétaires, du plus ancien au plus récent. */
  ownerHistory: { clientId: string; until: number }[]
}

/** Format échangé avec le serveur. */
export interface SyncChange {
  id: string
  kind: RecordKind
  updatedAt: number
  deletedAt: number | null
  data: Record<string, unknown>
}

export interface SyncRequest {
  cursor: number
  changes: SyncChange[]
}

export interface SyncResponse {
  changes: (SyncChange & { seq: number })[]
  cursor: number
  hasMore: boolean
}
