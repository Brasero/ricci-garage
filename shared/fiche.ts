import { computeTotals, formatDuree, formatEuros } from './money'
import { TIMEZONE } from './settings'
import type { Client, Intervention, Settings, Vehicle } from './types'
import { INTERVENTION_TYPES, MOTORISATIONS } from './types'

/**
 * Fiche véhicule à remettre au client : contenu du document, déjà mis en forme (textes).
 *
 * Elle montre les prix de VENTE des pièces et la main d'œuvre. Elle ne contient JAMAIS de prix d'achat, de marge ni de notes
 * internes : le modèle ci-dessous n'a tout simplement aucun champ pour les porter (garantie par le typage et par les tests).
 */

export interface FicheLine {
  designation: string
  reference: string
  quantite: string
  prixUnitaire: string
  total: string
}

export interface FicheIntervention {
  date: string
  km: string
  type: string
  description: string
  duree: string
  lignes: FicheLine[]
  piecesTotal: string
  /** Vide si aucune main d'œuvre n'a été chiffrée. */
  mainOeuvre: string
  total: string
}

export interface FicheModel {
  garage: { nom: string; lignes: string[] }
  editeLe: string
  client: { nom: string; lignes: string[] }
  vehicule: { titre: string; rows: [string, string][] }
  interventions: FicheIntervention[]
  totalGeneral: string
  mention: string
  signature: string
}

const fr = (iso: string) => iso.split('-').reverse().join('/')
const dateFr = (ms: number) => new Date(ms).toLocaleDateString('fr-FR', { timeZone: TIMEZONE })
const qty = (q: number) => String(q).replace('.', ',')
const lineTotal = (q: number, cts: number) => Math.round(q * cts)

export function buildFicheModel(i: { now: number; settings: Settings; client: Client | undefined; vehicle: Vehicle; interventions: Intervention[] }): FicheModel {
  const { settings: s, vehicle: v, client: c } = i
  // Seules les interventions TERMINÉES (et non archivées) figurent sur la fiche, de la plus récente à la plus ancienne.
  const done = i.interventions.filter((x) => !x.deletedAt && x.statut === 'terminee' && x.vehicleId === v.id).sort((a, b) => b.startAt - a.startAt)

  let grand = 0
  const interventions: FicheIntervention[] = done.map((x) => {
    const t = computeTotals(x.pieces, x.mainOeuvreCts)
    grand += t.totalCts
    return {
      date: dateFr(x.startAt),
      km: x.km != null ? `${x.km.toLocaleString('fr-FR')} km` : '',
      type: INTERVENTION_TYPES.find((tp) => tp[0] === x.type)?.[1] ?? '',
      description: x.description.trim(),
      duree: x.dureeMin ? formatDuree(x.dureeMin) : '',
      lignes: x.pieces.map((p) => ({
        designation: p.designation,
        reference: p.reference,
        quantite: qty(p.quantite),
        prixUnitaire: formatEuros(p.prixVenteCts),
        total: formatEuros(lineTotal(p.quantite, p.prixVenteCts)),
      })),
      piecesTotal: formatEuros(t.piecesVenteCts),
      mainOeuvre: x.mainOeuvreCts != null ? formatEuros(x.mainOeuvreCts) : '',
      total: formatEuros(t.totalCts),
    }
  })

  const motor = MOTORISATIONS.find((m) => m[0] === v.motorisation)?.[1] ?? ''
  const rows: [string, string][] = (
    [
      ['Immatriculation', `${v.plate} (${v.country === 'LU' ? 'Luxembourg' : 'France'})`],
      ['Motorisation', [motor, v.motorisationDetail].filter(Boolean).join(' — ')],
      ['Couleur', v.couleur],
      ['1ʳᵉ mise en circulation', v.miseEnCirculation ? fr(v.miseEnCirculation) : ''],
      ['N° de châssis', v.vin],
      ['Kilométrage', v.km != null ? `${v.km.toLocaleString('fr-FR')} km` : ''],
      ['Dernier contrôle technique', v.dernierCT ? fr(v.dernierCT) : ''],
    ] as [string, string][]
  ).filter(([, val]) => val.trim())

  return {
    garage: { nom: s.garageNom, lignes: [s.garageAdresse, s.garageTelephone, s.garageEmail].filter((x) => x.trim()) },
    editeLe: dateFr(i.now),
    client: { nom: c ? `${c.prenom} ${c.nom}`.trim() : '', lignes: c ? [c.telephone, c.email].filter((x) => x.trim()) : [] },
    vehicule: { titre: `${v.marque} ${v.modele}`.trim(), rows },
    interventions,
    totalGeneral: formatEuros(grand),
    mention: "Document récapitulatif des interventions réalisées sur ce véhicule. Il ne tient pas lieu de facture.",
    signature: s.signature.trim(),
  }
}
