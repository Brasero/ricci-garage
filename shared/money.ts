import type { Piece } from './types'

/** « 12,50 », « 12.5 », « 1 200,5 € » → 1250 / 1250 / 120050. Retourne null si vide ou invalide. */
export function parseEuros(input: string): number | null {
  const t = input.replace(/[\s€ ]/g, '').replace(',', '.')
  if (!t) return null
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null
  return Math.round(Number(t) * 100)
}

export function formatEuros(cts: number | null | undefined): string {
  if (cts === null || cts === undefined) return '—'
  return (cts / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
}

/** Valeur éditable d'un montant en centimes : 1250 → « 12,50 ». */
export function eurosToInput(cts: number | null | undefined): string {
  return cts === null || cts === undefined ? '' : (cts / 100).toFixed(2).replace('.', ',')
}

const line = (qty: number, cts: number) => Math.round(qty * cts)

export interface Totals {
  piecesVenteCts: number
  piecesAchatCts: number
  /** Marge sur les pièces = vente − achat. */
  margePiecesCts: number
  mainOeuvreCts: number
  /** Total = pièces (prix de vente) + main d'œuvre. */
  totalCts: number
}

export function computeTotals(pieces: Piece[], mainOeuvreCts: number | null): Totals {
  const piecesVenteCts = pieces.reduce((s, p) => s + line(p.quantite, p.prixVenteCts), 0)
  const piecesAchatCts = pieces.reduce((s, p) => s + line(p.quantite, p.prixAchatCts), 0)
  const mo = mainOeuvreCts ?? 0
  return { piecesVenteCts, piecesAchatCts, margePiecesCts: piecesVenteCts - piecesAchatCts, mainOeuvreCts: mo, totalCts: piecesVenteCts + mo }
}

/** 135 → « 2 h 15 », 45 → « 45 min », 120 → « 2 h ». */
export function formatDuree(min: number | null | undefined): string {
  if (min === null || min === undefined) return '—'
  const h = Math.floor(min / 60)
  const m = min % 60
  if (!h) return `${m} min`
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`
}
