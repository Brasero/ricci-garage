const enc = new TextEncoder()
export const SESSION_COOKIE = 'rg_session'
export const SESSION_MAX_AGE = 60 * 60 * 24 * 90 // 90 jours

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(message)))
}

/** Comparaison en temps constant (évite de deviner le secret par le temps de réponse). */
export function safeEqual(a: string, b: string): boolean {
  const ab = enc.encode(a)
  const bb = enc.encode(b)
  let diff = ab.length ^ bb.length
  const n = Math.max(ab.length, bb.length)
  for (let i = 0; i < n; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0)
  return diff === 0
}

export async function createSession(secret: string, now = Date.now()): Promise<string> {
  const exp = now + SESSION_MAX_AGE * 1000
  const nonce = crypto.randomUUID()
  const payload = `${exp}.${nonce}`
  return `${payload}.${await hmac(secret, payload)}`
}

export async function verifySession(secret: string, token: string | undefined, now = Date.now()): Promise<boolean> {
  if (!token) return false
  const parts = token.split('.')
  if (parts.length !== 3) return false
  const [exp, nonce, sig] = parts
  if (!(Number(exp) > now)) return false
  return safeEqual(sig, await hmac(secret, `${exp}.${nonce}`))
}
