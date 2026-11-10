import type { Country } from './plate'

export type RecordKind = 'client' | 'vehicle' | 'intervention' | 'photo' | 'rdv' | 'echeance' | 'settings'

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
  /** Rappels par email à ce client (rendez-vous, échéances). Absent = oui. */
  rappelsEmail?: boolean
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

export const RDV_STATUTS = [
  ['prevu', 'Prévu'],
  ['honore', 'Honoré'],
  ['annule', 'Annulé'],
] as const
export type RdvStatut = (typeof RDV_STATUTS)[number][0]

export interface RendezVous extends BaseRecord {
  clientId: string
  vehicleId: string | null
  startAt: number
  /** Durée estimée en minutes. */
  dureeMin: number
  motif: string
  statut: RdvStatut
  notes: string
  /** Intervention créée à partir de ce rendez-vous. */
  interventionId: string | null
}

export const ECHEANCE_TYPES = [
  ['ct', 'Contrôle technique'],
  ['vidange', 'Vidange / entretien'],
  ['autre', 'Autre'],
] as const
export type EcheanceType = (typeof ECHEANCE_TYPES)[number][0]

/** Échéance d'un véhicule, par date (AAAA-MM-JJ) et/ou par kilométrage. */
export interface Echeance extends BaseRecord {
  vehicleId: string
  type: EcheanceType
  /** Libellé libre (obligatoire pour « Autre »). */
  libelle: string
  dateDue: string | null
  kmDue: number | null
  statut: 'ouverte' | 'faite'
  sourceInterventionId: string | null
  notes: string
}

/** Réglages du garage et des rappels (un seul enregistrement, id fixe). */
export interface Settings extends BaseRecord {
  garageNom: string
  garageAdresse: string
  garageTelephone: string
  garageEmail: string
  /** Mention libre en pied des emails. */
  signature: string
  /** Destinataire du récapitulatif quotidien. */
  emailRecap: string
  /** Heure d'envoi (0–23, heure du Luxembourg/Paris) du récapitulatif et des rappels d'échéance. */
  heureEnvoi: number
  recapActif: boolean
  rappelsClientActifs: boolean
  /** Rappels de rendez-vous aussi envoyés à l'adresse du récapitulatif. */
  rappelsRdvPereActifs: boolean
  /** Délais avant un rendez-vous, en minutes (1440 = la veille, 60 = 1 h avant). */
  delaisRdvMin: number[]
  /** Délais avant une échéance datée, en jours. */
  delaisEcheanceJours: number[]
  /** Identifiant de l'agenda Google alimenté par l'application (vide = synchronisation désactivée). */
  googleCalendarId: string
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
