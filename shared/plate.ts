export type Country = 'FR' | 'LU'

/** Majuscules, uniquement lettres et chiffres : `ab-123-cd` → `AB123CD`. */
export function normalizePlate(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

const FR_SIV = /^[A-Z]{2}\d{3}[A-Z]{2}$/
// Ancien format FNI : 1 à 4 chiffres, 1 à 3 lettres, département (2 chiffres, 2A/2B, ou 971…976)
const FR_FNI = /^\d{1,4}[A-Z]{1,3}(\d{2}|2A|2B|97[1-6])$/
const LU = /^[A-Z]{2}\d{4}$/

export function validatePlate(country: Country, input: string): { ok: true } | { ok: false; error: string } {
  const p = normalizePlate(input)
  if (!p) return { ok: false, error: "L'immatriculation est obligatoire." }
  if (country === 'LU') {
    return LU.test(p) ? { ok: true } : { ok: false, error: 'Plaque luxembourgeoise : 2 lettres puis 4 chiffres (ex. AB 1234).' }
  }
  if (FR_SIV.test(p) || FR_FNI.test(p)) return { ok: true }
  return { ok: false, error: 'Plaque française : format AB-123-CD (ou ancien format 123 ABC 45).' }
}

/** Affichage lisible d'une plaque déjà normalisée. */
export function formatPlate(country: Country, input: string): string {
  const p = normalizePlate(input)
  if (country === 'LU' && LU.test(p)) return `${p.slice(0, 2)} ${p.slice(2)}`
  if (country === 'FR' && FR_SIV.test(p)) return `${p.slice(0, 2)}-${p.slice(2, 5)}-${p.slice(5)}`
  return p
}

const VIN = /^[A-HJ-NPR-Z0-9]{17}$/
export function validateVin(input: string): boolean {
  return VIN.test(input.toUpperCase().replace(/\s+/g, ''))
}
