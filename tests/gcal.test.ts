import { generateKeyPairSync, createPublicKey, createVerify } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { buildDesired, eventIdFor, FatalCalendarError, hashEvent, planSync, runPlan, type CalendarApi, type GcalInput, type SyncedRow } from '../shared/gcal'
import { DEFAULT_SETTINGS } from '../shared/settings'

import type { Client, Echeance, Intervention, RendezVous, Vehicle } from '../shared/types'
import { parseServiceAccount, signJwt } from '../worker/googleAuth'

const base = { createdAt: 1, updatedAt: 1, deletedAt: null }
const UUID = (n: number) => `0000000${n}-0000-4000-8000-00000000000${n}`
const client: Client = { id: UUID(1), nom: 'Dupont', prenom: 'Anne', telephone: '0612345678', email: '', notes: '', ...base }
const car: Vehicle = { id: UUID(2), clientId: client.id, marque: 'Renault', modele: 'Clio', motorisation: 'diesel', motorisationDetail: '', country: 'FR', plate: 'AB-123-CD', plateNorm: 'AB123CD', couleur: '', miseEnCirculation: '', vin: '', km: 1, dernierCT: '', notes: '', ownerHistory: [], ...base }
const NOW = Date.parse('2026-11-10T10:00:00Z')
const rdv = (o: Partial<RendezVous> = {}): RendezVous => ({ id: UUID(3), clientId: client.id, vehicleId: car.id, startAt: NOW + 86_400_000, dureeMin: 90, motif: 'Vidange', statut: 'prevu', notes: '', interventionId: null, ...base, ...o })
const inter = (o: Partial<Intervention> = {}): Intervention => ({ id: UUID(4), vehicleId: car.id, startAt: NOW + 3600_000, dureeMin: null, km: null, type: 'vidange', description: 'Vidange moteur', pieces: [{ designation: 'Filtre', reference: '', quantite: 1, prixAchatCts: 800, prixVenteCts: 1500 }], mainOeuvreCts: 6000, statut: 'a_faire', notes: '', ...base, ...o })
const ech = (o: Partial<Echeance> = {}): Echeance => ({ id: UUID(5), vehicleId: car.id, type: 'ct', libelle: '', dateDue: '2026-12-15', kmDue: null, statut: 'ouverte', sourceInterventionId: null, notes: '', ...base, ...o })
const input = (o: Partial<GcalInput> = {}): GcalInput => ({ now: NOW, settings: DEFAULT_SETTINGS, clients: [client], vehicles: [car], rdvs: [], interventions: [], echeances: [], ...o })

describe('événements Google', () => {
  it("identifiants valides pour Google (a–v, 0–9) et distincts par type d'enregistrement", () => {
    const a = eventIdFor('rdv', UUID(3))
    expect(a).toMatch(/^[a-v0-9]{5,}$/)
    expect(eventIdFor('inter', UUID(3))).not.toBe(a)
  })
  it('rendez-vous : horaires, durée, fuseau', () => {
    const [d] = buildDesired(input({ rdvs: [rdv()] })).desired
    expect(d.event.start).toEqual({ dateTime: new Date(NOW + 86_400_000).toISOString(), timeZone: 'Europe/Luxembourg' })
    expect(new Date(d.event.end.dateTime!).getTime() - new Date(d.event.start.dateTime!).getTime()).toBe(90 * 60_000)
    expect(d.event.summary).toContain('Anne Dupont')
    expect(d.event.description).toContain('0612345678')
  })
  it('ne contient jamais de prix', () => {
    const [d] = buildDesired(input({ interventions: [inter()] })).desired
    expect(JSON.stringify(d.event)).not.toMatch(/15,00|60,00|1500|6000|€/)
  })
  it('échéance : événement « toute la journée »', () => {
    const [d] = buildDesired(input({ echeances: [ech()] })).desired
    expect(d.event.start).toEqual({ date: '2026-12-15' })
    expect(d.event.end).toEqual({ date: '2026-12-16' })
  })
  it("n'impose aucun rappel : les alertes dépendent des notifications de l'agenda chez l'utilisateur, jamais du compte de service", () => {
    const evs = buildDesired(input({ rdvs: [rdv()], interventions: [inter()], echeances: [ech()], settings: { ...DEFAULT_SETTINGS, delaisRdvMin: [1, 2, 3, 4, 5, 6], delaisEcheanceJours: [0, 1, 2, 3, 4, 5] } })).desired
    expect(evs).toHaveLength(3)
    for (const d of evs) expect('reminders' in d.event).toBe(false)
  })
  it('exclut annulés, archivés, échéances faites, clients archivés', () => {
    const none = (o: Partial<GcalInput>) => buildDesired(input(o)).desired.length
    expect(none({ rdvs: [rdv({ statut: 'annule' })] })).toBe(0)
    expect(none({ rdvs: [rdv({ deletedAt: 5 })] })).toBe(0)
    expect(none({ echeances: [ech({ statut: 'faite' })] })).toBe(0)
    expect(none({ rdvs: [rdv()], clients: [{ ...client, deletedAt: 9 }] })).toBe(0)
    expect(none({ interventions: [inter()], vehicles: [{ ...car, deletedAt: 9 }] })).toBe(0)
  })
  it('un rendez-vous honoré reste dans l’agenda (marqué ✓)', () => {
    expect(buildDesired(input({ rdvs: [rdv({ statut: 'honore' })] })).desired[0].event.summary.startsWith('✓')).toBe(true)
  })
  it("les enregistrements trop anciens sont laissés tels quels (jamais supprimés de Google)", () => {
    const old = rdv({ startAt: NOW - 60 * 86_400_000 })
    const b = buildDesired(input({ rdvs: [old] }))
    expect(b.desired).toHaveLength(0)
    expect(b.keep.has(old.id)).toBe(true)
    const plan = planSync(b, new Map<string, SyncedRow>([[old.id, { eventId: 'x', hash: 'h' }]]))
    expect(plan.deletes).toHaveLength(0)
  })
  it("l'empreinte change quand le contenu change, pas sinon", () => {
    const a = buildDesired(input({ rdvs: [rdv()] })).desired[0]
    const same = buildDesired(input({ rdvs: [rdv()] })).desired[0]
    const moved = buildDesired(input({ rdvs: [rdv({ startAt: NOW + 2 * 86_400_000 })] })).desired[0]
    expect(a.hash).toBe(same.hash)
    expect(a.hash).not.toBe(moved.hash)
    expect(hashEvent({ a: 1 })).not.toBe(hashEvent({ a: 2 }))
  })
})

describe('plan de synchronisation', () => {
  it('envoie le nouveau, ignore le déjà synchronisé, supprime ce qui a disparu', () => {
    const b = buildDesired(input({ rdvs: [rdv()], echeances: [ech()] }))
    const state = new Map<string, SyncedRow>([
      [UUID(3), { eventId: eventIdFor('rdv', UUID(3)), hash: b.desired.find((d) => d.recordId === UUID(3))!.hash }], // à jour
      ['ancien', { eventId: 'evtancien', hash: 'h' }], // supprimé côté application
    ])
    const plan = planSync(b, state)
    expect(plan.upserts.map((d) => d.recordId)).toEqual([UUID(5)])
    expect(plan.upserts[0].isNew).toBe(true)
    expect(plan.deletes).toEqual([{ recordId: 'ancien', eventId: 'evtancien' }])
  })
  it('une modification est renvoyée', () => {
    const before = buildDesired(input({ rdvs: [rdv()] })).desired[0]
    const state = new Map<string, SyncedRow>([[before.recordId, { eventId: before.eventId, hash: before.hash }]])
    const plan = planSync(buildDesired(input({ rdvs: [rdv({ motif: 'Freins' })] })), state)
    expect(plan.upserts).toHaveLength(1)
    expect(plan.upserts[0].isNew).toBe(false) // déjà envoyé : simple mise à jour
  })
})

describe('exécution du plan', () => {
  const fake = (fail: Record<string, Error> = {}): CalendarApi & { calls: string[] } => {
    const calls: string[] = []
    return {
      calls,
      async upsert(id) { calls.push(`up:${id}`); if (fail[id]) throw fail[id] },
      async remove(id) { calls.push(`del:${id}`); if (fail[id]) throw fail[id] },
    }
  }
  const plan = () => planSync(buildDesired(input({ rdvs: [rdv()], echeances: [ech()] })), new Map([['ancien', { eventId: 'evtancien', hash: 'h' }]]))

  it('exécute tout dans la limite, le reste attend la prochaine exécution', async () => {
    const api = fake()
    const out = await runPlan(plan(), api, 2)
    expect(out.saved).toHaveLength(2)
    expect(out.removed).toHaveLength(0)
    expect(out.remaining).toBe(1)
    expect(api.calls).toHaveLength(2)
  })
  it('une erreur isolée n’arrête pas les autres et reste à retenter', async () => {
    const id = eventIdFor('rdv', UUID(3))
    const out = await runPlan(plan(), fake({ [id]: new Error('500 — oups') }), 10)
    expect(out.failed).toEqual([{ recordId: UUID(3), error: '500 — oups' }])
    expect(out.saved.map((s) => s.recordId)).toEqual([UUID(5)])
    expect(out.removed).toEqual(['ancien'])
  })
  it('une erreur de configuration (droits, agenda) arrête tout', async () => {
    const id = eventIdFor('rdv', UUID(3))
    const api = fake({ [id]: new FatalCalendarError('Agenda introuvable') })
    const out = await runPlan(plan(), api, 10)
    expect(out.fatal).toBe('Agenda introuvable')
    expect(out.saved).toHaveLength(0)
    expect(out.remaining).toBe(3)
    expect(api.calls).toHaveLength(1)
  })
})

describe('compte de service Google', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } })
  const sa = parseServiceAccount(JSON.stringify({ client_email: 'garage@projet.iam.gserviceaccount.com', private_key: privateKey, token_uri: 'https://oauth2.googleapis.com/token' }))!

  it('lit le fichier JSON de clé, refuse le reste', () => {
    expect(sa.client_email).toContain('@')
    expect(parseServiceAccount(undefined)).toBeNull()
    expect(parseServiceAccount('pas du json')).toBeNull()
    expect(parseServiceAccount('{"foo":1}')).toBeNull()
  })
  it('signe un JWT RS256 vérifiable avec la clé publique', async () => {
    const jwt = await signJwt(sa, Date.parse('2026-11-10T10:00:00Z'))
    const [h, c, s] = jwt.split('.')
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' })
    const claims = JSON.parse(Buffer.from(c, 'base64url').toString())
    expect(claims).toMatchObject({ iss: sa.client_email, aud: sa.token_uri, scope: 'https://www.googleapis.com/auth/calendar.events' })
    expect(claims.exp - claims.iat).toBe(3600)
    const v = createVerify('RSA-SHA256').update(`${h}.${c}`)
    expect(v.verify(createPublicKey(publicKey), Buffer.from(s, 'base64url'))).toBe(true)
  })
})

