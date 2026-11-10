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

function table(kind: RecordKind) {
  return kind === 'client' ? db.clients : db.vehicles
}

async function getCursor(): Promise<number> {
  return ((await db.meta.get('cursor'))?.value as number | undefined) ?? 0
}

async function collectDirty(): Promise<SyncChange[]> {
  const [clients, vehicles] = await Promise.all([db.clients.where('dirty').equals(1).toArray(), db.vehicles.where('dirty').equals(1).toArray()])
  const toChange = (kind: RecordKind, rows: { id: string; updatedAt: number; deletedAt: number | null; dirty: 0 | 1 }[]): SyncChange[] =>
    rows.map(({ dirty: _dirty, ...data }) => ({ id: data.id, kind, updatedAt: data.updatedAt, deletedAt: data.deletedAt, data }))
  return [...toChange('client', clients), ...toChange('vehicle', vehicles)].slice(0, BATCH)
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
      await db.transaction('rw', db.clients, db.vehicles, db.meta, async () => {
        for (const ch of out.changes) {
          const t = table(ch.kind) as typeof db.clients
          const local = await t.get(ch.id)
          if (!deviceAccepts(local, ch.updatedAt)) continue
          await t.put({ ...(ch.data as object), id: ch.id, updatedAt: ch.updatedAt, deletedAt: ch.deletedAt, dirty: 0 } as never)
        }
        // Les envois acceptés ne sont plus « en attente »… sauf si l'utilisateur a re-modifié entre-temps.
        for (const p of pushed) {
          await (table(p.kind) as typeof db.clients).where('id').equals(p.id).modify((r) => {
            if (r.updatedAt === p.updatedAt) r.dirty = 0
          })
        }
        await db.meta.put({ key: 'cursor', value: out.cursor })
      })
      if (!out.hasMore && pushed.length < BATCH) break
    }
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
