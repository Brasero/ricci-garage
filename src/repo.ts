import { formatPlate, normalizePlate } from '../shared/plate'
import { normalizePhone } from '../shared/phone'
import { normalizeText } from '../shared/text'
import type { Client, Intervention, Vehicle } from '../shared/types'
import { db, type PhotoRow, type Row } from './db'
import { requestSync } from './sync'

export const newId = (): string => crypto.randomUUID()

/** Garantit un horodatage strictement croissant pour un même enregistrement. */
const stamp = (prev?: { updatedAt: number }): number => Math.max(Date.now(), (prev?.updatedAt ?? 0) + 1)

export type ClientInput = Pick<Client, 'nom' | 'prenom' | 'telephone' | 'email' | 'notes'>
export type VehicleInput = Pick<
  Vehicle,
  'clientId' | 'marque' | 'modele' | 'motorisation' | 'motorisationDetail' | 'country' | 'couleur' | 'miseEnCirculation' | 'vin' | 'km' | 'dernierCT' | 'notes'
> & { plate: string }

export async function saveClient(input: ClientInput, existing?: Row<Client>): Promise<string> {
  const now = stamp(existing)
  const row: Row<Client> = {
    ...input,
    nom: input.nom.trim(),
    prenom: input.prenom.trim(),
    telephone: normalizePhone(input.telephone),
    email: input.email.trim(),
    id: existing?.id ?? newId(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    deletedAt: existing?.deletedAt ?? null,
    dirty: 1,
  }
  await db.clients.put(row)
  requestSync()
  return row.id
}

export async function saveVehicle(input: VehicleInput, existing?: Row<Vehicle>): Promise<string> {
  const now = stamp(existing)
  const ownerHistory = [...(existing?.ownerHistory ?? [])]
  if (existing && existing.clientId !== input.clientId) ownerHistory.push({ clientId: existing.clientId, until: now })
  const row: Row<Vehicle> = {
    ...input,
    marque: input.marque.trim(),
    modele: input.modele.trim(),
    plate: formatPlate(input.country, input.plate),
    plateNorm: normalizePlate(input.plate),
    vin: input.vin.toUpperCase().replace(/\s+/g, ''),
    ownerHistory,
    id: existing?.id ?? newId(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    deletedAt: existing?.deletedAt ?? null,
    dirty: 1,
  }
  await db.vehicles.put(row)
  requestSync()
  return row.id
}

/** Archive un client ET ses véhicules actifs (même horodatage : sert à les restaurer ensemble). */
export async function archiveClient(id: string): Promise<void> {
  await db.transaction('rw', db.clients, db.vehicles, async () => {
    const c = await db.clients.get(id)
    if (!c || c.deletedAt) return
    const now = stamp(c)
    await db.clients.put({ ...c, deletedAt: now, updatedAt: now, dirty: 1 })
    for (const v of await db.vehicles.where('clientId').equals(id).toArray()) {
      if (v.deletedAt) continue
      await db.vehicles.put({ ...v, deletedAt: now, updatedAt: stamp(v), dirty: 1 })
    }
  })
  requestSync()
}

export async function restoreClient(id: string): Promise<void> {
  await db.transaction('rw', db.clients, db.vehicles, async () => {
    const c = await db.clients.get(id)
    if (!c?.deletedAt) return
    const archivedAt = c.deletedAt
    const now = stamp(c)
    await db.clients.put({ ...c, deletedAt: null, updatedAt: now, dirty: 1 })
    for (const v of await db.vehicles.where('clientId').equals(id).toArray()) {
      if (v.deletedAt === archivedAt) await db.vehicles.put({ ...v, deletedAt: null, updatedAt: stamp(v), dirty: 1 })
    }
  })
  requestSync()
}

export async function setVehicleArchived(id: string, archived: boolean): Promise<void> {
  const v = await db.vehicles.get(id)
  if (!v) return
  const now = stamp(v)
  await db.vehicles.put({ ...v, deletedAt: archived ? now : null, updatedAt: now, dirty: 1 })
  requestSync()
}

/** Clients actifs qui ressemblent à celui saisi (même téléphone, ou même nom + prénom). */
export async function findDuplicateClients(input: ClientInput, selfId?: string): Promise<Row<Client>[]> {
  const phone = normalizePhone(input.telephone)
  const name = normalizeText(`${input.nom} ${input.prenom}`)
  const all = await db.clients.filter((c) => !c.deletedAt && c.id !== selfId).toArray()
  return all.filter((c) => (phone && normalizePhone(c.telephone) === phone) || normalizeText(`${c.nom} ${c.prenom}`) === name)
}

export async function findVehiclesByPlate(plate: string, selfId?: string): Promise<Row<Vehicle>[]> {
  const norm = normalizePlate(plate)
  if (!norm) return []
  return (await db.vehicles.where('plateNorm').equals(norm).toArray()).filter((v) => !v.deletedAt && v.id !== selfId)
}

export const fullName = (c: Pick<Client, 'nom' | 'prenom'> | undefined): string =>
  c ? `${c.prenom} ${c.nom}`.trim() : '(client inconnu)'

// ───────────── Interventions ─────────────

export type InterventionInput = Pick<
  Intervention,
  'vehicleId' | 'startAt' | 'dureeMin' | 'km' | 'type' | 'description' | 'pieces' | 'mainOeuvreCts' | 'statut' | 'notes'
>

/**
 * Enregistre une intervention. Si elle est terminée et relève un kilométrage supérieur à celui du véhicule,
 * le kilométrage du véhicule est mis à jour (jamais à la baisse).
 */
export async function saveIntervention(input: InterventionInput, existing?: Row<Intervention>): Promise<string> {
  const now = stamp(existing)
  const row: Row<Intervention> = {
    ...input,
    pieces: input.pieces.map((p) => ({ ...p, designation: p.designation.trim(), reference: p.reference.trim() })),
    description: input.description.trim(),
    id: existing?.id ?? newId(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    deletedAt: existing?.deletedAt ?? null,
    dirty: 1,
  }
  await db.transaction('rw', db.interventions, db.vehicles, async () => {
    await db.interventions.put(row)
    if (row.statut === 'terminee' && row.km !== null) {
      const v = await db.vehicles.get(row.vehicleId)
      if (v && (v.km === null || row.km > v.km)) await db.vehicles.put({ ...v, km: row.km, updatedAt: stamp(v), dirty: 1 })
    }
  })
  requestSync()
  return row.id
}

export async function setInterventionArchived(id: string, archived: boolean): Promise<void> {
  const i = await db.interventions.get(id)
  if (!i) return
  const now = stamp(i)
  await db.interventions.put({ ...i, deletedAt: archived ? now : null, updatedAt: now, dirty: 1 })
  requestSync()
}

// ───────────── Photos ─────────────

/** Ajoute une photo (déjà compressée) : stockée sur l'appareil, envoyée dès qu'il y a du réseau. */
export async function addPhoto(interventionId: string, blob: Blob): Promise<string> {
  const now = Date.now()
  const row: PhotoRow = {
    id: newId(),
    interventionId,
    mime: blob.type,
    size: blob.size,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    dirty: 1,
    uploaded: 0,
    blob,
  }
  await db.photos.put(row)
  requestSync()
  return row.id
}

export async function deletePhoto(id: string): Promise<void> {
  const p = await db.photos.get(id)
  if (!p) return
  await db.photos.put({ ...p, deletedAt: stamp(p), updatedAt: stamp(p), dirty: 1 })
  requestSync()
}
