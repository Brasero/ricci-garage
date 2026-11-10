import { describe, expect, it } from 'vitest'
import { createSession, safeEqual, verifySession } from '../worker/auth'

const secret = 'a-long-random-secret-for-tests-0123456789'

describe('sessions signées', () => {
  it('accepte un jeton valide', async () => {
    expect(await verifySession(secret, await createSession(secret))).toBe(true)
  })
  it('refuse un jeton expiré', async () => {
    const old = await createSession(secret, Date.now() - 100 * 24 * 3600 * 1000)
    expect(await verifySession(secret, old)).toBe(false)
  })
  it('refuse un jeton falsifié ou signé avec une autre clé', async () => {
    const t = await createSession(secret)
    const [exp, nonce, sig] = t.split('.')
    expect(await verifySession(secret, `${Number(exp) + 1000}.${nonce}.${sig}`)).toBe(false)
    expect(await verifySession('autre-cle', t)).toBe(false)
    expect(await verifySession(secret, undefined)).toBe(false)
    expect(await verifySession(secret, 'n-importe-quoi')).toBe(false)
  })
  it('comparaison de mots de passe', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'abcd')).toBe(false)
  })
})

import { sniffImage } from '../worker/photos'

describe('détection des images', () => {
  it('reconnaît jpeg, png, webp', () => {
    expect(sniffImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
    expect(sniffImage(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png')
    expect(sniffImage(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe('image/webp')
  })
  it('refuse le reste (html, svg, vide)', () => {
    expect(sniffImage(new TextEncoder().encode('<html><script>'))).toBeNull()
    expect(sniffImage(new TextEncoder().encode('<svg xmlns='))).toBeNull()
    expect(sniffImage(new Uint8Array())).toBeNull()
  })
})
