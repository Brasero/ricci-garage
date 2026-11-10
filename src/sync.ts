import { useSyncExternalStore } from 'react'
import { deviceAccepts } from '../shared/sync'
import type { RecordKind, SyncChange, SyncRequest, SyncResponse } from '../shared/types'
import { db } from './db'

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'unauthorized' | 'error'
export interface SyncState {
  status: SyncStatus
  lastSync: number | null
}

let state: SyncState = { status: 'idle', lastSync: null }
const listeners = new Set<() => void>()
function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}
export function useSyncState(): SyncState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

const BATCH = 200
const MAX_ROUNDS = 50

const KINDS: RecordKind[] = ['client', 'vehicle', 'intervention', 'photo']

function table(kind: RecordKind): typeof db.clients {
  const t = { client: db.clients, vehicle: db.vehicles, intervention: db.interventions, photo: db.photos }[kind]
  return t as unknown as typeof db.clients
}

/** Champs qui restent sur l'appareil (jamais envoyés dans la synchro de données). */
const LOCAL_ONLY = ['dirty', 'blob', 'uploaded']

async function getCursor(): Promise<number> {
  return ((await db.meta.get('cursor'))?.value as number | undefined) ?? 0
}

async function collectDirty(): Promise<SyncChange[]> {
  const out: SyncChange[] = []
  for (const kind of KINDS) {
    const rows = (await table(kind).where('dirty').equals(1).toArray()) as unknown as (Record<string, unknown> & { id: string; updatedAt: number; deletedAt: number | null })[]
    for (const row of rows) {
      const data = Object.fromEntries(Object.entries(row).filter(([k]) => !LOCAL_ONLY.includes(k)))
      out.push({ id: row.id, kind, updatedAt: row.updatedAt, deletedAt: row.deletedAt, data })
    }
  }
  return out.slice(0, BATCH)
}

/** Envoie les images en attente. Retourne false si la synchro doit s'arrêter (hors connexion, déconnecté, erreur). */
async function uploadPhotos(): Promise<boolean> {
  for (let i = 0; i < 100; i++) {
    const row = await db.photos.where('uploaded').equals(0).first()
    if (!row) return true
    if (row.deletedAt || !row.blob) {
      // Supprimée avant envoi, ou image absente : rien à envoyer.
      await db.photos.update(row.id, { uploaded: 1 })
      continue
    }
    let res: Response
    try {
      res = await fetch(`/api/photos/${row.id}`, { method: 'PUT', headers: { 'Content-Type': row.blob.type || 'application/octet-stream' }, body: row.blob })
    } catch {
      setState({ status: 'offline' })
      return false
    }
    if (res.status === 401) {
      setState({ status: 'unauthorized' })
      return false
    }
    if (res.status === 400 || res.status === 413 || res.status === 415) {
      // Refus définitif du serveur : on ne bloque pas toute la synchro pour une seule image (elle reste sur cet appareil).
      console.error('photo refusée', row.id, res.status)
      await db.photos.update(row.id, { uploaded: 1 })
      continue
    }
    if (!res.ok) {
      setState({ status: 'error' })
      return false
    }
    await db.photos.update(row.id, { uploaded: 1 })
  }
  return true
}

let running = false
let rerun = false

/** Envoie les modifications locales, puis récupère celles des autres appareils. Ne lève jamais d'exception. */
export async function syncNow(): Promise<void> {
  if (running) {
    rerun = true
    return
  }
  running = true
  try {
    if (!navigator.onLine) {
      setState({ status: 'offline' })
      return
    }
    setState({ status: 'syncing' })
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const pushed = await collectDirty()
      const body: SyncRequest = { cursor: await getCursor(), changes: pushed }
      let res: Response
      try {
        res = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      } catch {
        setState({ status: 'offline' })
        return
      }
      if (res.status === 401) {
        setState({ status: 'unauthorized' })
        return
      }
      if (!res.ok) {
        setState({ status: 'error' })
        return
      }
      const out = (await res.json()) as SyncResponse
      await db.transaction('rw', [db.clients, db.vehicles, db.interventions, db.photos, db.meta], async () => {
        for (const ch of out.changes) {
          const t = table(ch.kind)
          const local = await t.get(ch.id)
          if (!deviceAccepts(local, ch.updatedAt)) continue
          const row: Record<string, unknown> = { ...ch.data, id: ch.id, updatedAt: ch.updatedAt, deletedAt: ch.deletedAt, dirty: 0 }
          if (ch.kind === 'photo') {
            // L'image (locale) est conservée ; une photo connue du serveur n'a rien à envoyer.
            const lp = local as unknown as { blob?: Blob; uploaded?: 0 | 1 } | undefined
            row.blob = lp?.blob
            row.uploaded = lp ? lp.uploaded : 1
          }
          await t.put(row as never)
        }
        // Les envois acceptés ne sont plus « en attente »… sauf si l'utilisateur a re-modifié entre-temps.
        for (const p of pushed) {
          await table(p.kind).where('id').equals(p.id).modify((r) => {
            if (r.updatedAt === p.updatedAt) r.dirty = 0
          })
        }
        await db.meta.put({ key: 'cursor', value: out.cursor })
      })
      if (!out.hasMore && pushed.length < BATCH) break
    }
    if (!(await uploadPhotos())) return
    setState({ status: 'idle', lastSync: Date.now() })
  } catch (e) {
    console.error('sync', e)
    setState({ status: 'error' })
  } finally {
    running = false
    if (rerun) {
      rerun = false
      void syncNow()
    }
  }
}

let timer: ReturnType<typeof setTimeout> | undefined
/** Planifie une synchronisation dans 500 ms (regroupe les saisies rapprochées). */
export function requestSync(): void {
  clearTimeout(timer)
  timer = setTimeout(() => void syncNow(), 500)
}

export function startSync(): void {
  void syncNow()
  window.addEventListener('online', () => void syncNow())
  window.addEventListener('offline', () => setState({ status: 'offline' }))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow()
  })
  setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow()
  }, 60_000)
}

export async function login(password: string): Promise<'ok' | 'invalid' | 'locked' | 'offline'> {
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (res.ok) {
      void syncNow()
      return 'ok'
    }
    return res.status === 429 ? 'locked' : 'invalid'
  } catch {
    return 'offline'
  }
}

export async function logout(): Promise<void> {
  await fetch('/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => undefined)
  setState({ status: 'unauthorized' })
}
