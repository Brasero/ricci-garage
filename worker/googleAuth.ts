const SCOPE = 'https://www.googleapis.com/auth/calendar.events'

export interface ServiceAccount {
  client_email: string
  private_key: string
  token_uri: string
}

export function parseServiceAccount(json: string | undefined): ServiceAccount | null {
  if (!json) return null
  try {
    const o = JSON.parse(json) as Partial<ServiceAccount>
    if (typeof o.client_email !== 'string' || typeof o.private_key !== 'string') return null
    return { client_email: o.client_email, private_key: o.private_key, token_uri: o.token_uri ?? 'https://oauth2.googleapis.com/token' }
  } catch {
    return null
  }
}

const b64url = (buf: ArrayBuffer | Uint8Array | string): string => {
  const bytes = typeof buf === 'string' ? new TextEncoder().encode(buf) : new Uint8Array(buf)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** JWT RS256 signé avec la clé du compte de service (WebCrypto, aucune dépendance). */
export async function signJwt(sa: ServiceAccount, now = Date.now()): Promise<string> {
  const pem = sa.private_key.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '')
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const iat = Math.floor(now / 1000)
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: sa.token_uri, iat, exp: iat + 3600 }))
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${claims}`))
  return `${head}.${claims}.${b64url(sig)}`
}

