/** Minuscules, sans accents, sans ponctuation superflue : sert à la recherche. */
export function normalizeText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Découpe en mots normalisés. */
export function tokenize(input: string): string[] {
  const n = normalizeText(input)
  return n ? n.split(' ') : []
}
