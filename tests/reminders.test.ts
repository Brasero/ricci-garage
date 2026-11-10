import { describe, expect, it } from 'vitest'
import { computeMailJobs, type ReminderInput } from '../shared/reminders'
import { DEFAULT_SETTINGS } from '../shared/settings'
import { addDays, addMonths, daysBetween, localDate, zonedToMs } from '../shared/time'
import type { Client, Echeance, RendezVous, Vehicle } from '../shared/types'

const TZ = 'Europe/Luxembourg'
const base = { createdAt: 1, updatedAt: 1, deletedAt: null }
const client = (o: Partial<Client> = {}): Client => ({ id: 'c1', nom: 'Dupont', prenom: 'Anne', telephone: '0612345678', email: 'anne@example.com', notes: '', ...base, ...o })
const car: Vehicle = {
  id: 'v1', clientId: 'c1', marque: 'Renault', modele: 'Clio', motorisation: 'diesel', motorisationDetail: '', country: 'FR',
  plate: 'AB-123-CD', plateNorm: 'AB123CD', couleur: '', miseEnCirculation: '', vin: '', km: 100_000, dernierCT: '', notes: '', ownerHistory: [], ...base,
}
const rdv = (startAt: number, o: Partial<RendezVous> = {}): RendezVous => ({ id: 'r1', clientId: 'c1', vehicleId: 'v1', startAt, dureeMin: 60, motif: 'Vidange', statut: 'prevu', notes: '', interventionId: null, ...base, ...o })
const ech = (o: Partial<Echeance> = {}): Echeance => ({ id: 'e1', vehicleId: 'v1', type: 'ct', libelle: '', dateDue: '2026-12-15', kmDue: null, statut: 'ouverte', sourceInterventionId: null, notes: '', ...base, ...o })
const input = (now: number, o: Partial<ReminderInput> = {}): ReminderInput => ({ now, settings: DEFAULT_SETTINGS, clients: [client()], vehicles: [car], rdvs: [], echeances: [], ...o })

describe('heure locale', () => {
  it('convertit heure du Luxembourg ↔ UTC, été comme hiver', () => {
    expect(new Date(zonedToMs('2026-01-15', 8, TZ)).toISOString()).toBe('2026-01-15T07:00:00.000Z')
    expect(new Date(zonedToMs('2026-07-15', 8, TZ)).toISOString()).toBe('2026-07-15T06:00:00.000Z')
    expect(localDate(Date.parse('2026-07-15T22:30:00Z'), TZ)).toBe('2026-07-16')
  })
  it('calcule les dates', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2026-11-10', 12)).toBe('2027-11-10')
    expect(daysBetween('2026-11-10', '2026-12-10')).toBe(30)
  })
})

describe('rappels de rendez-vous', () => {
  const start = Date.parse('2026-11-20T14:00:00Z')
  const keys = (now: number, o: Partial<ReminderInput> = {}) => computeMailJobs(input(now, o)).filter((j) => j.key.startsWith('rdv:'))

  it("envoie la veille puis 1 h avant, au client et à l'adresse du récapitulatif", () => {
    expect(keys(start - 25 * 3600_000, { rdvs: [rdv(start)] })).toHaveLength(0)
    const veille = keys(start - 24 * 3600_000 + 60_000, { rdvs: [rdv(start)] })
    expect(veille.map((j) => j.to).sort()).toEqual(['anne@example.com', 'riccimichel3@gmail.com'])
    expect(veille.find((j) => j.to === 'anne@example.com')!.subject).toContain('demain')
    const hour = keys(start - 3600_000 + 60_000, { rdvs: [rdv(start)] })
    expect(hour.length).toBe(2)
    expect(hour[0].key).toContain(':60:')
  })
  it('ne renvoie pas un rappel très en retard, ni après le début, ni pour un RDV annulé/archivé', () => {
    expect(keys(start - 24 * 3600_000 + 7 * 3600_000, { rdvs: [rdv(start)] }).filter((j) => j.key.includes(':1440:'))).toHaveLength(0)
    expect(keys(start + 60_000, { rdvs: [rdv(start)] })).toHaveLength(0)
    expect(keys(start - 3600_000 + 60_000, { rdvs: [rdv(start, { statut: 'annule' })] })).toHaveLength(0)
    expect(keys(start - 3600_000 + 60_000, { rdvs: [rdv(start, { deletedAt: 5 })] })).toHaveLength(0)
  })
  it("respecte les réglages : client sans email, client exclu, rappels client désactivés", () => {
    const now = start - 3600_000 + 60_000
    const to = (o: Partial<ReminderInput>) => keys(now, { rdvs: [rdv(start)], ...o }).map((j) => j.to)
    expect(to({ clients: [client({ email: '' })] })).toEqual(['riccimichel3@gmail.com'])
    expect(to({ clients: [client({ rappelsEmail: false })] })).toEqual(['riccimichel3@gmail.com'])
    expect(to({ settings: { ...DEFAULT_SETTINGS, rappelsClientActifs: false } })).toEqual(['riccimichel3@gmail.com'])
    expect(to({ settings: { ...DEFAULT_SETTINGS, rappelsRdvPereActifs: false } })).toEqual(['anne@example.com'])
  })
  it('a une clé différente si le rendez-vous est déplacé (nouveau rappel)', () => {
    const now = start - 3600_000 + 60_000
    const a = keys(now, { rdvs: [rdv(start)] })[0].key
    const moved = keys(now + 3600_000, { rdvs: [rdv(start + 3600_000)] })[0].key
    expect(a).not.toBe(moved)
  })
  it("échappe le HTML (motif saisi par l'utilisateur)", () => {
    const j = keys(start - 3600_000 + 60_000, { rdvs: [rdv(start, { motif: '<script>x</script>' })] })[0]
    expect(j.html).not.toContain('<script>')
    expect(j.html).toContain('&lt;script&gt;')
  })
})

describe("rappels d'échéance (client)", () => {
  const eventKeys = (now: number, o: Partial<ReminderInput> = {}) => computeMailJobs(input(now, { echeances: [ech()], ...o })).filter((j) => j.key.startsWith('echeance:'))
  it("envoie à 8 h locale, 30 jours puis 7 jours avant l'échéance", () => {
    expect(eventKeys(zonedToMs('2026-11-14', 9, TZ))).toHaveLength(0)
    expect(eventKeys(zonedToMs('2026-11-15', 7, TZ))).toHaveLength(0)
    const j30 = eventKeys(zonedToMs('2026-11-15', 9, TZ))
    expect(j30).toHaveLength(1)
    expect(j30[0].subject.toLowerCase()).toContain('contrôle technique')
    expect(j30[0].text).toContain('dans 30 jours')
    expect(eventKeys(zonedToMs('2026-12-08', 9, TZ))[0].text).toContain('dans 7 jours')
  })
  it('pas de rappel si faite, archivée, sans email ou par kilométrage seul', () => {
    const now = zonedToMs('2026-11-15', 9, TZ)
    expect(eventKeys(now, { echeances: [ech({ statut: 'faite' })] })).toHaveLength(0)
    expect(eventKeys(now, { echeances: [ech({ deletedAt: 1 })] })).toHaveLength(0)
    expect(eventKeys(now, { clients: [client({ email: '' })] })).toHaveLength(0)
    expect(eventKeys(now, { echeances: [ech({ dateDue: null, kmDue: 101_000 })] })).toHaveLength(0)
  })
  it('les délais sont paramétrables', () => {
    const s = { ...DEFAULT_SETTINGS, delaisEcheanceJours: [14, 0] }
    expect(eventKeys(zonedToMs('2026-12-01', 9, TZ), { settings: s })).toHaveLength(1)
    expect(eventKeys(zonedToMs('2026-12-15', 9, TZ), { settings: s })).toHaveLength(1)
    expect(eventKeys(zonedToMs('2026-11-15', 9, TZ), { settings: s })).toHaveLength(0)
  })
})

describe('récapitulatif quotidien', () => {
  const recap = (now: number, o: Partial<ReminderInput> = {}) => computeMailJobs(input(now, o)).filter((j) => j.key.startsWith('recap:'))
  it('liste rendez-vous du jour/lendemain, échéances en retard et proches, km proches', () => {
    const now = zonedToMs('2026-11-10', 9, TZ)
    const jobs = recap(now, {
      rdvs: [rdv(zonedToMs('2026-11-10', 15, TZ)), rdv(zonedToMs('2026-11-11', 10, TZ), { id: 'r2', motif: 'Freins' })],
      echeances: [ech({ id: 'e1', dateDue: '2026-11-05' }), ech({ id: 'e2', type: 'vidange', dateDue: '2026-11-25' }), ech({ id: 'e3', type: 'autre', libelle: 'Pneus hiver', dateDue: null, kmDue: 100_500 })],
    })
    expect(jobs).toHaveLength(1)
    const t = jobs[0].text
    expect(jobs[0].to).toBe('riccimichel3@gmail.com')
    expect(t).toContain("Rendez-vous d'aujourd'hui")
    expect(t).toContain('Rendez-vous de demain')
    expect(t).toContain('en retard de 5 jours')
    expect(t).toContain('dans 15 jours')
    expect(t).toContain('dans 500 km')
    expect(jobs[0].key).toBe('recap:2026-11-10:riccimichel3@gmail.com')
  })
  it("n'envoie rien avant l'heure, quand il n'y a rien à dire, ou si désactivé", () => {
    const now = zonedToMs('2026-11-10', 9, TZ)
    expect(recap(zonedToMs('2026-11-10', 7, TZ), { echeances: [ech({ dateDue: '2026-11-05' })] })).toHaveLength(0)
    expect(recap(now)).toHaveLength(0)
    expect(recap(now, { echeances: [ech({ dateDue: '2026-11-05' })], settings: { ...DEFAULT_SETTINGS, recapActif: false } })).toHaveLength(0)
    expect(recap(now, { echeances: [ech({ dateDue: '2027-06-05' })] })).toHaveLength(0)
  })
})
