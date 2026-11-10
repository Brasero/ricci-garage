import type { Country } from './plate'

export type RecordKind = 'client' | 'vehicle' | 'intervention' | 'photo'

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

export const INTERVENTION_TYPES = [
  ['vidange', 'Vidange / entretien'],
  ['freins', 'Freins'],
  ['distribution', 'Distribution'],
  ['pneus', 'Pneus'],
  ['diagnostic', 'Diagnostic'],
  ['controle', 'Contrôle'],
  ['carrosserie', 'Carrosserie'],
  ['autre', 'Autre'],
] as const
export type InterventionType = (typeof INTERVENTION_TYPES)[number][0]

export const STATUTS = [
  ['a_faire', 'À faire'],
  ['en_cours', 'En cours'],
  ['terminee', 'Terminée'],
] as const
export type Statut = (typeof STATUTS)[number][0]

/** Ligne de pièce. Tous les prix sont en centimes d'euro (entiers : pas d'erreur d'arrondi). */
export interface Piece {
  designation: string
  reference: string
  /** Peut être décimale (ex. 4,5 litres). */
  quantite: number
  prixAchatCts: number
  prixVenteCts: number
}

export interface Intervention extends BaseRecord {
  vehicleId: string
  /** Date et heure de l'intervention (ms depuis epoch). */
  startAt: number
  /** Temps passé réel en minutes, saisie libre (indépendante du prix). */
  dureeMin: number | null
  km: number | null
  type: InterventionType
  description: string
  pieces: Piece[]
  /** Prix de main d'œuvre saisi librement, en centimes (aucun calcul depuis la durée). */
  mainOeuvreCts: number | null
  statut: Statut
  notes: string
}

/** Métadonnées d'une photo. L'image elle-même est stockée à part (R2 côté serveur, IndexedDB sur l'appareil). */
export interface Photo extends BaseRecord {
  interventionId: string
  mime: string
  size: number
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
