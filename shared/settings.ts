import type { Settings } from './types'

/** Identifiant fixe : les réglages sont un enregistrement unique, partagé par tous les appareils. */
export const SETTINGS_ID = '00000000-0000-4000-8000-000000000001'
export const TIMEZONE = 'Europe/Luxembourg'

export const DEFAULT_SETTINGS: Settings = {
  id: SETTINGS_ID,
  createdAt: 0,
  updatedAt: 0,
  deletedAt: null,
  garageNom: 'Ricci Garage',
  garageAdresse: '',
  garageTelephone: '',
  garageEmail: 'riccimichel3@gmail.com',
  signature: '',
  emailRecap: 'riccimichel3@gmail.com',
  heureEnvoi: 8,
  recapActif: true,
  rappelsClientActifs: true,
  rappelsRdvPereActifs: true,
  delaisRdvMin: [1440, 60],
  delaisEcheanceJours: [30, 7],
}

/** Complète des réglages partiels (ancienne version, champ manquant) avec les valeurs par défaut. */
export function withDefaults(s: Partial<Settings> | null | undefined): Settings {
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) }
}
