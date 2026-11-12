import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildFicheModel } from '../shared/fiche'
import { DEFAULT_SETTINGS } from '../shared/settings'
import type { Client, Intervention, Vehicle } from '../shared/types'
import { renderFichePdf } from '../src/pdf/fichePdf'

const base = { createdAt: 1, updatedAt: 1, deletedAt: null }
const NOW = Date.parse('2026-11-12T10:00:00Z')
const client: Client = { id: 'c1', nom: 'Dupont', prenom: 'Anne', telephone: '+352 621 123 456', email: 'anne@example.com', notes: 'NOTE-CLIENT-INTERNE', ...base }
const car: Vehicle = {
  id: 'v1', clientId: 'c1', marque: 'Renault', modele: 'Clio', motorisation: 'diesel', motorisationDetail: '1.5 dCi 90 ch', country: 'LU',
  plate: 'AB 1234', plateNorm: 'AB1234', couleur: 'Gris', miseEnCirculation: '2019-03-14', vin: 'VF1RJA00123456789', km: 120500,
  dernierCT: '2025-06-02', notes: 'NOTE-VEHICULE-INTERNE', ownerHistory: [], ...base,
}
// Valeurs d'achat volontairement exotiques : elles ne doivent apparaître nulle part.
const ACHAT = 7777 // 77,77 €
const inter = (o: Partial<Intervention>): Intervention => ({
  id: 'i1', vehicleId: 'v1', startAt: Date.parse('2026-10-20T08:00:00Z'), dureeMin: 90, km: 120000, type: 'vidange', description: 'Vidange moteur et remplacement du filtre à huile',
  pieces: [
    { designation: 'Filtre à huile', reference: 'FH-42', quantite: 1, prixAchatCts: ACHAT, prixVenteCts: 1500 },
    { designation: 'Huile 5W30', reference: '', quantite: 4.5, prixAchatCts: ACHAT, prixVenteCts: 1400 },
  ],
  mainOeuvreCts: 6000, statut: 'terminee', notes: 'NOTE-INTERVENTION-INTERNE', ...base, ...o,
})
const make = (list: Intervention[]) => buildFicheModel({ now: NOW, settings: { ...DEFAULT_SETTINGS, garageAdresse: '1 rue du Garage, Luxembourg', garageTelephone: '+352 600 000 000' }, client, vehicle: car, interventions: list })

describe('fiche véhicule : contenu', () => {
  it('montre les prix de vente et la main d’œuvre, avec les bons totaux', () => {
    const m = make([inter({})])
    const it = m.interventions[0]
    expect(it.lignes).toEqual([
      { designation: 'Filtre à huile', reference: 'FH-42', quantite: '1', prixUnitaire: expect.stringMatching(/15,00/), total: expect.stringMatching(/15,00/) },
      { designation: 'Huile 5W30', reference: '', quantite: '4,5', prixUnitaire: expect.stringMatching(/14,00/), total: expect.stringMatching(/63,00/) },
    ])
    expect(it.piecesTotal).toMatch(/78,00/)
    expect(it.mainOeuvre).toMatch(/60,00/)
    expect(it.total).toMatch(/138,00/)
    expect(m.totalGeneral).toMatch(/138,00/)
  })
  it("ne contient AUCUN prix d'achat, aucune marge, aucune note interne", () => {
    const json = JSON.stringify(make([inter({}), inter({ id: 'i2', startAt: NOW - 86_400_000 * 90 })]))
    expect(json).not.toMatch(/77,77|7777|marge|achat/i)
    expect(json).not.toMatch(/NOTE-.*-INTERNE/)
  })
  it('ne liste que les interventions terminées et actives, de la plus récente à la plus ancienne', () => {
    const m = make([
      inter({ id: 'a', startAt: Date.parse('2026-01-10T08:00:00Z'), description: 'ancienne' }),
      inter({ id: 'b', startAt: Date.parse('2026-09-10T08:00:00Z'), description: 'récente' }),
      inter({ id: 'c', statut: 'a_faire', description: 'à faire' }),
      inter({ id: 'd', statut: 'en_cours', description: 'en cours' }),
      inter({ id: 'e', deletedAt: 9, description: 'archivée' }),
    ])
    expect(m.interventions.map((x) => x.description)).toEqual(['récente', 'ancienne'])
  })
  it('sans main d’œuvre ni pièce : pas de ligne vide', () => {
    const it = make([inter({ pieces: [], mainOeuvreCts: null })]).interventions[0]
    expect(it.lignes).toEqual([])
    expect(it.mainOeuvre).toBe('')
    expect(it.total).toMatch(/0,00/)
  })
  it('affiche les informations du véhicule et du propriétaire, et la mention « pas une facture »', () => {
    const m = make([])
    expect(m.vehicule.titre).toBe('Renault Clio')
    expect(Object.fromEntries(m.vehicule.rows)).toMatchObject({ Immatriculation: 'AB 1234 (Luxembourg)', Couleur: 'Gris', '1ʳᵉ mise en circulation': '14/03/2019', 'Dernier contrôle technique': '02/06/2025' })
    expect(m.client.nom).toBe('Anne Dupont')
    expect(m.mention).toMatch(/ne tient pas lieu de facture/)
  })
})

describe('fiche véhicule : PDF', () => {
  it('produit un PDF valide, sur une ou plusieurs pages', async () => {
    const one = await renderFichePdf(make([inter({})]))
    expect(Buffer.from(one.slice(0, 5)).toString()).toBe('%PDF-')
    const many = await renderFichePdf(
      make(Array.from({ length: 14 }, (_, k) => inter({ id: `i${k}`, startAt: NOW - k * 20 * 86_400_000, description: `Intervention n°${k + 1} — ` + 'travaux détaillés '.repeat(8) }))),
    )
    expect(many.length).toBeGreaterThan(one.length)
    if (process.env.FICHE_OUT) {
      writeFileSync(process.env.FICHE_OUT + '/fiche-1.pdf', one)
      writeFileSync(process.env.FICHE_OUT + '/fiche-n.pdf', many)
    }
  })
  it('supporte les caractères hors latin-1 sans planter (remplacés)', async () => {
    const bytes = await renderFichePdf(make([inter({ description: 'Remplacement 🚗 « joint » — łódź €' })]))
    expect(bytes.length).toBeGreaterThan(500)
  })
  it('sans aucune intervention', async () => {
    expect((await renderFichePdf(make([]))).length).toBeGreaterThan(500)
  })
})
