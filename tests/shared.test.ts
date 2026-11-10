import { describe, expect, it } from 'vitest'
import { formatPlate, normalizePlate, validatePlate, validateVin } from '../shared/plate'
import { normalizePhone, validateEmail, validatePhone } from '../shared/phone'
import { searchAll } from '../shared/search'
import { deviceAccepts, serverAccepts } from '../shared/sync'
import type { Client, Vehicle } from '../shared/types'

describe('plaques', () => {
  it('normalise', () => {
    expect(normalizePlate('ab-123-cd')).toBe('AB123CD')
    expect(normalizePlate(' ab 1234 ')).toBe('AB1234')
  })
  it('LU : 2 lettres + 4 chiffres', () => {
    expect(validatePlate('LU', 'AB 1234').ok).toBe(true)
    expect(validatePlate('LU', 'ab1234').ok).toBe(true)
    for (const bad of ['A 1234', 'AB 123', 'AB 12345', 'ABC 123', '1234 AB', 'AB-123-CD', '']) {
      expect(validatePlate('LU', bad).ok, bad).toBe(false)
    }
  })
  it('FR : SIV et ancien format', () => {
    expect(validatePlate('FR', 'AB-123-CD').ok).toBe(true)
    expect(validatePlate('FR', 'ab123cd').ok).toBe(true)
    expect(validatePlate('FR', '123 ABC 45').ok).toBe(true)
    expect(validatePlate('FR', '1234 AB 2A').ok).toBe(true)
    for (const bad of ['AB 1234', 'A-123-CD', 'AB-12-CD', 'AB-123-C', '']) {
      expect(validatePlate('FR', bad).ok, bad).toBe(false)
    }
  })
  it('formate', () => {
    expect(formatPlate('FR', 'ab123cd')).toBe('AB-123-CD')
    expect(formatPlate('LU', 'ab1234')).toBe('AB 1234')
  })
  it('VIN', () => {
    expect(validateVin('WVWZZZ1JZXW000001')).toBe(true)
    expect(validateVin('WVWZZZ1JZXW00000I')).toBe(false) // I interdit
    expect(validateVin('123')).toBe(false)
  })
})

describe('téléphone / email', () => {
  it('normalise et valide', () => {
    expect(normalizePhone('+352 621 123 456')).toBe('+352621123456')
    expect(normalizePhone('0033 6 12 34 56 78')).toBe('+33612345678')
    expect(normalizePhone('06 12 34 56 78')).toBe('0612345678')
    expect(validatePhone('06 12 34 56 78').ok).toBe(true)
    expect(validatePhone('123').ok).toBe(false)
    expect(validatePhone('').ok).toBe(false)
  })
  it('email', () => {
    expect(validateEmail('a@b.lu')).toBe(true)
    expect(validateEmail('a@b')).toBe(false)
  })
})

const now = 1_000
const client = (id: string, nom: string, prenom: string, telephone = '0612345678'): Client => ({
  id, nom, prenom, telephone, email: '', notes: '', createdAt: now, updatedAt: now, deletedAt: null,
})
const vehicle = (id: string, clientId: string, marque: string, modele: string, plate: string): Vehicle => ({
  id, clientId, marque, modele, motorisation: 'diesel', motorisationDetail: '', country: 'FR',
  plate, plateNorm: normalizePlate(plate), couleur: '', miseEnCirculation: '', vin: '', km: null,
  dernierCT: '', notes: '', ownerHistory: [], createdAt: now, updatedAt: now, deletedAt: null,
})

describe('recherche globale', () => {
  const clients = [client('c1', 'Dupont', 'Éloïse'), client('c2', 'Martin', 'Paul', '+352 621 123 456')]
  const vehicles = [
    vehicle('v1', 'c1', 'Volkswagen', 'Golf', 'AB-123-CD'),
    vehicle('v2', 'c2', 'Renault', 'Clio', 'XY 9876'),
  ]
  const ids = (q: string) => searchAll(q, clients, vehicles).vehicles.map((h) => h.vehicle.id)

  it('par plaque, avec ou sans séparateurs', () => {
    expect(ids('ab123cd')).toEqual(['v1'])
    expect(ids('AB-123-CD')).toEqual(['v1'])
    expect(ids('xy 9876')).toEqual(['v2'])
  })
  it('par marque et modèle', () => {
    expect(ids('golf')).toEqual(['v1'])
    expect(ids('renault clio')).toEqual(['v2'])
  })
  it('par propriétaire, accents et ordre indifférents', () => {
    expect(ids('eloise')).toEqual(['v1'])
    expect(ids('paul martin')).toEqual(['v2'])
    expect(ids('dupont golf')).toEqual(['v1'])
  })
  it('par téléphone', () => {
    expect(ids('621123')).toEqual(['v2'])
  })
  it('ignore les archivés', () => {
    const archived = clients.map((c) => (c.id === 'c1' ? { ...c, deletedAt: 5 } : c))
    expect(searchAll('golf', archived, vehicles).vehicles).toEqual([])
  })
  it('requête vide', () => {
    expect(ids('  ')).toEqual([])
  })
})

describe('fusion', () => {
  it('serveur : le plus récent gagne, égalité idempotente', () => {
    expect(serverAccepts(null, 1)).toBe(true)
    expect(serverAccepts(5, 6)).toBe(true)
    expect(serverAccepts(5, 5)).toBe(true)
    expect(serverAccepts(5, 4)).toBe(false)
  })
  it('appareil : garde le local en attente plus récent', () => {
    expect(deviceAccepts(undefined, 1)).toBe(true)
    expect(deviceAccepts({ updatedAt: 9, dirty: 1 }, 5)).toBe(false)
    expect(deviceAccepts({ updatedAt: 9, dirty: 1 }, 9)).toBe(true)
    expect(deviceAccepts({ updatedAt: 9, dirty: 0 }, 5)).toBe(true)
  })
})
