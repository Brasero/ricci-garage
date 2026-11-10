import { useCallback, useEffect, useState } from 'react'

/**
 * Verrouillage de l'application sur l'appareil.
 *
 * Le serveur ne livre RIEN (ni application, ni données) sans session valide. Mais l'application fonctionne aussi
 * hors connexion : elle se verrouille donc elle-même (écran de code) à l'ouverture et après inactivité.
 * Le code est vérifié localement grâce à une « empreinte » (PBKDF2 + sel) mémorisée à la première connexion.
 */

const VERIFIER_KEY = 'rg_verifier'
const UNLOCK_KEY = 'rg_unlocked'
/** Verrouillage automatique après cette durée d'inactivité ou d'application en arrière-plan. */
export const LOCK_AFTER_MS = 15 * 60 * 1000
export const PBKDF2_ITERATIONS = 300_000

export interface Verifier {
  v: 1
  i: number
  /** sel (base64) */
  s: string
  /** empreinte (base64) */
  h: string
}

const b64 = (buf: ArrayBuffer | Uint8Array): string => btoa(String.fromCharCode(...new Uint8Array(buf)))
const unb64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function derive(code: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveBits'])
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256)
}

export async function createVerifier(code: string): Promise<Verifier> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return { v: 1, i: PBKDF2_ITERATIONS, s: b64(salt), h: b64(await derive(code, salt, PBKDF2_ITERATIONS)) }
}

export async function checkVerifier(code: string, ver: Verifier): Promise<boolean> {
  const got = new Uint8Array(await derive(code, unb64(ver.s), ver.i))
  const want = unb64(ver.h)
  let diff = got.length ^ want.length
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ (want[i] ?? 0)
  return diff === 0
}

export function loadVerifier(): Verifier | null {
  try {
    const raw = localStorage.getItem(VERIFIER_KEY)
    const v = raw ? (JSON.parse(raw) as Verifier) : null
    return v && v.v === 1 && typeof v.s === 'string' && typeof v.h === 'string' && typeof v.i === 'number' ? v : null
  } catch {
    return null
  }
}
export function storeVerifier(v: Verifier): void {
  try {
    localStorage.setItem(VERIFIER_KEY, JSON.stringify(v))
  } catch {
    /* stockage indisponible : l'appareil demandera une connexion à chaque ouverture */
  }
}
export function clearVerifier(): void {
  try {
    localStorage.removeItem(VERIFIER_KEY)
  } catch {
    /* rien à faire */
  }
}

const isUnlockedNow = (): boolean => {
  try {
    const t = Number(sessionStorage.getItem(UNLOCK_KEY))
    return t > 0 && Date.now() - t < LOCK_AFTER_MS
  } catch {
    return false
  }
}
const markActive = () => {
  try {
    sessionStorage.setItem(UNLOCK_KEY, String(Date.now()))
  } catch {
    /* ignoré */
  }
}

let lockListeners: (() => void)[] = []
function notifyLock() {
  lockListeners.forEach((l) => l())
}

export function unlockNow(): void {
  markActive()
  notifyLock()
}
export function lockNow(): void {
  try {
    sessionStorage.removeItem(UNLOCK_KEY)
  } catch {
    /* ignoré */
  }
  notifyLock()
}

/** État de verrouillage : verrouillé à l'ouverture, après inactivité, ou quand l'appli reste en arrière-plan. */
export function useLock(): boolean {
  const [locked, setLocked] = useState(() => !isUnlockedNow())
  const refresh = useCallback(() => setLocked(!isUnlockedNow()), [])

  useEffect(() => {
    lockListeners.push(refresh)
    return () => {
      lockListeners = lockListeners.filter((l) => l !== refresh)
    }
  }, [refresh])

  useEffect(() => {
    if (locked) return
    let last = Date.now()
    let lastWrite = 0
    const activity = () => {
      last = Date.now()
      if (last - lastWrite > 5_000) {
        lastWrite = last
        markActive()
      }
    }
    const events = ['pointerdown', 'keydown', 'touchstart', 'scroll'] as const
    events.forEach((e) => window.addEventListener(e, activity, { passive: true }))
    const check = () => {
      // Deux sources : l'inactivité vue par cette page, et l'horodatage partagé (survit à un onglet gelé en arrière-plan).
      if (Date.now() - last > LOCK_AFTER_MS || !isUnlockedNow()) lockNow()
    }
    const timer = setInterval(check, 15_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') check()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      events.forEach((e) => window.removeEventListener(e, activity))
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [locked])

  return locked
}
