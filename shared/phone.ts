/** Garde le "+" initial et les chiffres : `+352 621 123 456` → `+352621123456`. */
export function normalizePhone(input: string): string {
  const t = input.trim()
  const plus = t.startsWith('+') || t.startsWith('00')
  const digits = t.replace(/\D/g, '').replace(/^00/, '')
  return (plus ? '+' : '') + digits
}

export function validatePhone(input: string): { ok: true } | { ok: false; error: string } {
  const n = normalizePhone(input)
  const digits = n.replace(/\D/g, '')
  if (!digits) return { ok: false, error: 'Le téléphone est obligatoire.' }
  if (digits.length < 8 || digits.length > 15) return { ok: false, error: 'Numéro de téléphone invalide (8 à 15 chiffres).' }
  return { ok: true }
}

export function validateEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.trim())
}
